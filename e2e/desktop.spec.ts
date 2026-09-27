/**
 * The desktop app: the same build in Electron, with saves and settings as files in a folder of its
 * own, the window's mode, and a save on the way out. It needs a display: on Linux, run it under
 * xvfb-run (`xvfb-run -a npm run e2e`).
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.skip(process.platform === 'linux' && !process.env.DISPLAY, 'The desktop app needs a display: use xvfb-run.');

async function launch(home: string): Promise<{ app: ElectronApplication; page: Page; errors: string[] }> {
  const app = await electron.launch({
    args: [
      // Containers and CI runners on Linux cannot give Chromium its sandbox.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      // Software WebGL, as for the browser tests.
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '.',
      '--debug-game',
    ],
    env: { ...process.env, CROWNS_HOME: home },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { app, page, errors };
}

const isFullScreen = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());

test('keeps saves and settings as files, minds the window, and saves on the way out', async () => {
  const home = mkdtempSync(join(tmpdir(), 'crowns-'));
  const saves = join(home, 'save games');
  const settingsFile = () => JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'));
  // The settings file already says the tour was seen, and turns the hints off.
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ tour: 'done', settings: { hints: false } }));
  try {
    let { app, page, errors } = await launch(home);
    await expect(page.getByRole('button', { name: 'Quit' })).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'New Campaign' }).click();
    await page.getByRole('button', { name: 'Play as England' }).click();
    await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
    await expect(page.locator('.tour')).toHaveCount(0);

    // A setting lands in the file, beside what was there.
    await page.getByRole('button', { name: 'Game menu' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: '110%' }).click();
    await expect.poll(() => settingsFile().settings?.textScale).toBe(1.1);
    expect(settingsFile().tour).toBe('done');

    // The window fills the screen and comes back.
    await dialog.getByRole('button', { name: 'Map and graphics' }).click();
    const mode = dialog.getByRole('radiogroup', { name: 'Window' });
    await expect(mode.getByRole('radio', { name: 'Windowed' })).toHaveAttribute('aria-checked', 'true');
    await mode.getByRole('radio', { name: 'Fullscreen' }).click();
    await expect.poll(() => isFullScreen(app)).toBe(true);
    await mode.getByRole('radio', { name: 'Windowed' }).click();
    await expect.poll(() => isFullScreen(app)).toBe(false);

    // A save by name is a file in the saves folder.
    await page.keyboard.press('Escape');
    const menu = page.getByRole('dialog', { name: 'The scriptorium' });
    await menu.getByRole('textbox', { name: 'Name of the save' }).fill('Before the storm');
    await menu.getByRole('button', { name: 'Save game' }).click();
    await expect(page.locator('.notice')).toHaveText('Game saved.');
    const named = readdirSync(saves).filter((f) => f.startsWith('save-'));
    expect(named.filter((f) => f.endsWith('.ccsave'))).toHaveLength(1);
    expect(named.filter((f) => f.endsWith('.meta.json'))).toHaveLength(1);

    // Some days on, Quit to desktop saves the campaign before the window goes.
    await menu.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.keyboard.press('5');
    await expect(page.locator('.date-long')).not.toHaveText('15th of September, 1066 AD', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Game menu' }).click();
    expect(errors).toEqual([]);
    const closed = app.waitForEvent('close');
    await menu.getByRole('button', { name: 'Quit to desktop' }).click();
    await closed;
    expect(readdirSync(saves)).toEqual(expect.arrayContaining(['autosave-1.ccsave', 'autosave-1.meta.json']));
    expect(existsSync(join(home, 'app', 'window.json'))).toBe(true);

    // Next time, Continue offers the autosave, and the named save loads from the archive.
    ({ app, page, errors } = await launch(home));
    await expect(page.getByRole('button', { name: /Continue/ })).toContainText('Autosave: Kingdom of England', {
      timeout: 120_000,
    });
    await page.getByRole('button', { name: 'Load Game' }).click();
    const archive = page.getByRole('dialog', { name: 'Load a game' });
    await expect(archive.locator('.save-row')).toHaveCount(2);
    await expect(archive.getByRole('button', { name: 'Open the saves folder' })).toBeVisible();
    await archive.locator('.save-row', { hasText: 'Before the storm' }).getByRole('button', { name: 'Load' }).click();
    await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
    await expect(page.locator('.nation-name')).toHaveText('Kingdom of England');
    expect(errors).toEqual([]);
    await app.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
