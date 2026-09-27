// @ts-check
/**
 * The desktop app: a window around the same build as the web game (dist/, served over app://). It
 * remembers the window's size and mode, keeps saves and settings as files in the player's documents
 * folder, and lets the game save before the window closes. The game reaches all of it through the
 * bridge in preload.cjs.
 *
 *   npm run app          build, then run the app (add -- --debug-game for window.game)
 *   npm run app:dist     build, then package it for this system into release/
 *
 * CROWNS_HOME moves the saves, the settings and the app's own files (tests use it); CROWNS_DEV_URL
 * loads a dev server instead of dist/.
 */
const { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.CROWNS_DEV_URL;
const HOME = process.env.CROWNS_HOME || path.join(app.getPath('documents'), 'Crowns & Centuries');
const SAVES = path.join(HOME, 'save games');
const SETTINGS = path.join(HOME, 'settings.json');
/** How long the game may take to save once the window is asked to close. */
const CLOSE_WAIT_MS = 8000;
/** The game's own files and nothing else; styles inline for the arms' SVG, images as data for saves. */
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

if (process.env.CROWNS_HOME) app.setPath('userData', path.join(HOME, 'app'));
const WINDOW = path.join(app.getPath('userData'), 'window.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ── Files ─────────────────────────────────────────────────────────

/** @param {string} file @param {any} fallback */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Writes beside the file first and then moves it into place, so a crash never leaves half a file.
 * @param {string} file @param {string | Uint8Array} data
 */
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** A slot as a file name every system accepts ("save:abc" becomes "save-abc"). @param {unknown} slot */
function slotFile(slot) {
  const name = String(slot)
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 120);
  if (!name) throw new Error('A save needs a name.');
  return path.join(SAVES, name);
}

// ── The window ────────────────────────────────────────────────────

/** @type {BrowserWindow | null} */
let win = null;
/** The game has saved (or had its chance to), so the window may close. */
let mayClose = false;

/** @param {BrowserWindow} w */
const modeOf = (w) => (w.isFullScreen() ? 'fullscreen' : 'windowed');

/**
 * Fullscreen covers the screen without a border, as Chromium does it, so other windows are a switch
 * away. @param {BrowserWindow} w @param {string} mode
 */
const setMode = (w, mode) => w.setFullScreen(mode === 'fullscreen');

function rememberWindow() {
  if (!win) return;
  const state = { mode: modeOf(win), maximized: win.isMaximized(), bounds: win.getNormalBounds() };
  try {
    writeAtomic(WINDOW, JSON.stringify(state));
  } catch {
    // the window opens at its default size next time
  }
}

/**
 * The saved place of the window, if it still lies on a screen (one may have been unplugged since).
 * @param {any} bounds
 */
function onScreen(bounds) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return {};
  const size = { width: bounds.width, height: bounds.height };
  const visible = screen.getAllDisplays().some(({ workArea: a }) => {
    const w = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x);
    const h = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y);
    return w >= 200 && h >= 100;
  });
  return visible ? { ...size, x: bounds.x, y: bounds.y } : size;
}

function createWindow() {
  const saved = readJson(WINDOW, {});
  mayClose = false;
  const w = new BrowserWindow({
    width: 1600,
    height: 900,
    ...onScreen(saved.bounds),
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#120e0a',
    title: 'Crowns & Centuries',
    // Windows and macOS take the icon from the app itself; Linux needs it for the window.
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, 'build', 'icon.png') } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win = w;
  w.removeMenu();
  if (saved.maximized) w.maximize();
  if (saved.mode === 'fullscreen') setMode(w, 'fullscreen');
  w.once('ready-to-show', () => w.show());
  w.on('enter-full-screen', () => w.webContents.send('window:mode', 'fullscreen'));
  w.on('leave-full-screen', () => w.webContents.send('window:mode', 'windowed'));

  // F11, and Alt+Enter as in many games, switch between a window and the full screen.
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      e.preventDefault();
      setMode(w, w.isFullScreen() ? 'windowed' : 'fullscreen');
    }
  });

  // Closing asks the game to save first, and waits a little for it (unless it has stopped).
  let crashed = false;
  w.on('close', (e) => {
    rememberWindow();
    if (mayClose || crashed) return;
    e.preventDefault();
    mayClose = true;
    w.webContents.send('app:closing');
    setTimeout(() => w.isDestroyed() || w.destroy(), CLOSE_WAIT_MS);
  });
  w.on('closed', () => {
    if (win === w) win = null;
  });

  // Links (the credits' sources) open in the player's browser; the window never leaves the game.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault();
  });

  w.webContents.on('render-process-gone', async (_, details) => {
    if (details.reason === 'clean-exit' || w.isDestroyed()) return;
    crashed = true;
    const { response } = await dialog.showMessageBox(w, {
      type: 'error',
      title: 'Crowns & Centuries',
      message: 'The game stopped unexpectedly.',
      detail: 'Your saves are safe up to the last one made. Start the game again to carry on.',
      buttons: ['Start again', 'Quit'],
      defaultId: 0,
    });
    if (response === 0) {
      crashed = false;
      w.webContents.reload();
    } else w.destroy();
  });

  const debug = process.argv.includes('--debug-game') ? '?debug' : '';
  void w.loadURL(`${DEV_URL || 'app://game/index.html'}${debug}`);
}

// ── The bridge ────────────────────────────────────────────────────

ipcMain.handle('saves:list', () => {
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(SAVES).filter((n) => n.endsWith('.meta.json'));
  } catch {
    return [];
  }
  return names
    .map((n) => readJson(path.join(SAVES, n), null))
    .filter((m) => m && typeof m === 'object' && typeof m.slot === 'string');
});

ipcMain.handle('saves:read', (_, slot) => {
  try {
    return fs.readFileSync(`${slotFile(slot)}.ccsave`);
  } catch {
    return null;
  }
});

ipcMain.handle('saves:write', (_, slot, meta, data) => {
  if (!meta || typeof meta !== 'object') throw new Error('A save needs its description.');
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) throw new Error('A save needs its game.');
  const file = slotFile(slot);
  // The game first: a description without its game would list a save that cannot load.
  writeAtomic(`${file}.ccsave`, new Uint8Array(data));
  writeAtomic(`${file}.meta.json`, JSON.stringify(meta));
});

ipcMain.handle('saves:delete', (_, slot) => {
  const file = slotFile(slot);
  for (const f of [`${file}.meta.json`, `${file}.ccsave`]) fs.rmSync(f, { force: true });
});

ipcMain.handle('saves:folder', () => {
  fs.mkdirSync(SAVES, { recursive: true });
  return shell.openPath(SAVES);
});

ipcMain.on('settings:read', (e) => {
  try {
    e.returnValue = fs.readFileSync(SETTINGS, 'utf8');
  } catch {
    e.returnValue = null;
  }
});

ipcMain.on('settings:write', (_, text) => {
  try {
    writeAtomic(SETTINGS, String(text));
  } catch {
    // the settings last for this session
  }
});

ipcMain.handle('window:getMode', () => (win ? modeOf(win) : 'windowed'));
ipcMain.handle('window:setMode', (_, mode) => {
  if (win && (mode === 'windowed' || mode === 'fullscreen')) setMode(win, mode);
});

/** Saves a file where the player chooses, for exported saves and bug reports; '' if they cancel. */
ipcMain.handle('file:save', async (_, name, text) => {
  const options = { defaultPath: path.join(app.getPath('downloads'), path.basename(String(name))) };
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return '';
  writeAtomic(result.filePath, String(text));
  return result.filePath;
});

ipcMain.on('app:closed', () => {
  if (win && !win.isDestroyed()) win.destroy();
});

ipcMain.on('app:quit', () => win?.close());

// ── Start ─────────────────────────────────────────────────────────

// One game at a time: a second start brings the first window forward.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // dist/ over app://game/, and never a file outside it. The page may load nothing from elsewhere.
    protocol.handle('app', async (req) => {
      try {
        const { pathname } = new URL(req.url);
        const file = path.normalize(path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
        if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 });
        const res = await net.fetch(pathToFileURL(file).toString());
        if (!file.endsWith('.html')) return res;
        const headers = new Headers(res.headers);
        headers.set('Content-Security-Policy', CSP);
        return new Response(res.body, { status: res.status, headers });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
