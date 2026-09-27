// @ts-check
/**
 * The bridge between the game and the desktop: saves and settings as files, the window's mode,
 * saving a file where the player chooses, and saving before the window closes. The game sees it as
 * `window.native` (src/ui/platform.ts, which describes it) and nothing more of the system.
 */
const { contextBridge, ipcRenderer } = require('electron');

/**
 * What the game does before the window closes (saving the campaign), once it has said.
 * @type {(() => unknown) | null}
 */
let beforeClose = null;

ipcRenderer.on('app:closing', async () => {
  try {
    if (beforeClose) await beforeClose();
  } catch {
    // the window closes all the same
  }
  ipcRenderer.send('app:closed');
});

contextBridge.exposeInMainWorld('native', {
  platform: process.platform,
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),
    /** @param {string} slot */
    read: (slot) => ipcRenderer.invoke('saves:read', slot),
    /** @param {string} slot @param {object} meta @param {ArrayBuffer} data */
    write: (slot, meta, data) => ipcRenderer.invoke('saves:write', slot, meta, data),
    /** @param {string} slot */
    remove: (slot) => ipcRenderer.invoke('saves:delete', slot),
    openFolder: () => ipcRenderer.invoke('saves:folder'),
  },
  settings: {
    read: () => ipcRenderer.sendSync('settings:read'),
    /** @param {string} text */
    write: (text) => ipcRenderer.send('settings:write', text),
  },
  window: {
    getMode: () => ipcRenderer.invoke('window:getMode'),
    /** @param {string} mode */
    setMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
    /** @param {(mode: string) => void} fn */
    onMode: (fn) => {
      /** @param {unknown} _ @param {string} mode */
      const listener = (_, mode) => fn(mode);
      ipcRenderer.on('window:mode', listener);
      return () => void ipcRenderer.removeListener('window:mode', listener);
    },
  },
  /** @param {string} name @param {string} text */
  saveFile: (name, text) => ipcRenderer.invoke('file:save', name, text),
  /** @param {() => unknown} fn */
  beforeClose: (fn) => {
    beforeClose = fn;
  },
  quit: () => ipcRenderer.send('app:quit'),
});
