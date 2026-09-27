import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { toDay } from '../src/sim/calendar';

// The guided tour greets the first campaign in a browser; every test but the tour's own has seen it.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes('guided tour'))
    await page.addInitScript(() => localStorage.setItem('crowns-and-centuries:tour', 'done'));
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('loads the world of 1066, takes a realm and inspects the map', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const newCampaign = page.getByRole('button', { name: 'New Campaign' });
  await expect(newCampaign).toBeVisible({ timeout: 120_000 });

  await newCampaign.click();
  await expect(page.getByRole('heading', { name: 'Kingdom of England' })).toBeVisible();
  await page.locator('.bookmark', { hasText: 'Byzantium' }).click();
  await expect(page.getByRole('heading', { name: 'Byzantine Empire' })).toBeVisible();

  await page.getByRole('button', { name: 'Play as Byzantium' }).click();
  await expect(page.locator('.nation-name')).toHaveText('Byzantine Empire');
  await expect(page.locator('.side-panel')).toContainText('Constantinople');

  // Let the camera settle over the realm, then click the middle of the map.
  await page.waitForTimeout(1500);
  const box = (await page.getByTestId('map').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await expect(page.locator('.side-panel .sp-title')).toBeVisible();

  await page.keyboard.press('y');
  await expect(page.getByRole('button', { name: 'Faith map (Y)' })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(page.locator('.side-panel')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('plays England: armies, time and a saved game', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');

  // The royal army, ordered north.
  await page.getByRole('tab', { name: 'Army' }).click();
  await page.locator('.army-row', { hasText: 'Royal Army of England' }).click();
  await expect(page.locator('.side-panel')).toContainText('Harold II');
  await expect(page.locator('.side-panel')).toContainText('Encamped at London');

  // Time runs, and news of the fight at York arrives.
  await page.keyboard.press('5');
  await expect(page.locator('.date-long')).not.toHaveText('15th of September, 1066 AD', { timeout: 30_000 });
  await expect(page.locator('.toast').first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press(' ');

  // Save to the browser.
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('button', { name: 'Save game' }).click();
  await expect(page.locator('.notice')).toHaveText('Game saved.');
  await expect(page.locator('.modal .save-row')).toContainText('Kingdom of England');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('keeps its archive: named saves, overwriting, deleting, and Continue after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
  const menu = page.getByRole('dialog', { name: 'The scriptorium' });
  const name = menu.getByRole('textbox', { name: 'Name of the save' });

  // A save under the offered name, and one under a name of our own.
  await page.getByRole('button', { name: 'Game menu' }).click();
  await expect(name).toHaveValue('England, 15 Sep 1066');
  await menu.getByRole('button', { name: 'Save game' }).click();
  await expect(menu.locator('.save-row')).toHaveCount(1);
  await name.fill('Before the storm');
  await menu.getByRole('button', { name: 'Save game' }).click();
  await expect(menu.locator('.save-row')).toHaveCount(2);
  await expect(menu.locator('.save-row').first()).toContainText('Before the storm');
  await expect(menu.locator('.save-row').first()).toContainText('Kingdom of England · 15th of September, 1066 AD');

  // The same name again asks first, then overwrites.
  await menu.getByRole('button', { name: 'Save game' }).click();
  await expect(menu.getByRole('status')).toContainText('A save called “Before the storm” exists');
  await menu.getByRole('button', { name: 'Overwrite' }).click();
  await expect(page.locator('.notice')).toHaveText('Game saved.');
  await expect(menu.locator('.save-row')).toHaveCount(2);

  // Deleting asks too.
  await menu.getByRole('button', { name: 'Delete England, 15 Sep 1066' }).click();
  await menu.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(menu.locator('.save-row')).toHaveCount(1);

  // A few days on, then a fresh page: Continue takes up the latest save, which knows its date.
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.keyboard.press('5');
  await expect(page.locator('.date-long')).not.toHaveText('15th of September, 1066 AD', { timeout: 30_000 });
  await page.reload();
  const cont = page.getByRole('button', { name: /Continue/ });
  await expect(cont).toContainText('Before the storm', { timeout: 120_000 });
  await cont.click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
  await expect(page.locator('.nation-name')).toHaveText('Kingdom of England');

  // The archive is on the title screen too.
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('button', { name: 'Title screen' }).click();
  await page.getByRole('button', { name: 'Load Game' }).click();
  await expect(page.getByRole('dialog', { name: 'Load a game' }).locator('.save-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('carries a campaign to another browser: a save file out, and in from the title screen', async ({
  page,
  browser,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.locator('.bookmark', { hasText: 'Byzantium' }).click();
  await page.getByRole('button', { name: 'Play as Byzantium' }).click();
  await page.keyboard.press('5');
  await expect(page.locator('.date-long')).not.toHaveText('15th of September, 1066 AD', { timeout: 30_000 });
  await page.keyboard.press(' ');
  const date = await page.locator('.date-long').textContent();
  await page.getByRole('button', { name: 'Game menu' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export save file' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^crowns-and-centuries-BYZ-1066\.json$/);
  const file = await download.path();

  // A browser that has never seen the game opens it from the title screen.
  const other = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const fresh = await other.newPage();
  const freshErrors = watchErrors(fresh);
  await fresh.addInitScript(() => localStorage.setItem('crowns-and-centuries:tour', 'done'));
  await fresh.goto('/');
  await fresh.getByRole('button', { name: 'Load Game' }).click({ timeout: 120_000 });
  const archive = fresh.getByRole('dialog', { name: 'Load a game' });
  await expect(archive).toContainText('No saved games yet.');
  await archive.locator('input[type=file]').setInputFiles(file);
  await expect(fresh.locator('.nation-name')).toHaveText('Byzantine Empire');
  await expect(fresh.locator('.date-long')).toHaveText(date!);
  await other.close();
  expect(errors).toEqual([]);
  expect(freshErrors).toEqual([]);
});

test('keeps watch: the outliner, and alerts that lead to the fix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');

  // The outliner lists what the realm has in hand; a click selects it.
  const outliner = page.getByRole('complementary', { name: 'Outliner' });
  await outliner.getByRole('button', { name: /Royal Army of England/ }).click();
  await expect(page.locator('.side-panel')).toContainText('Encamped at London');
  await outliner.getByRole('button', { name: /Norwegian Claim on England/ }).click();
  await expect(page.locator('.side-panel .sp-title')).toHaveText('Norwegian Claim on England');

  // Its parts fold away, and so does the whole of it, and it remembers.
  await outliner.getByRole('button', { name: /^Fleets/ }).click();
  await expect(outliner).not.toContainText('First Fleet of England');
  await outliner.getByRole('button', { name: 'Fold the outliner away' }).click();
  await expect(outliner).toHaveCount(0);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('crowns-and-centuries:outliner')!));
  expect(kept).toEqual({ open: false, closed: ['fleets'] });
  await page.getByRole('button', { name: 'Outliner' }).click();
  await expect(outliner).toContainText('Royal Army of England');

  // An empty treasury raises an alert; a click opens the treasury, a right-click hides it.
  await page.evaluate(() => {
    type G = { state: { player: number; countries: { gold: number }[] }; runner: { sync(): void } };
    const g = (window as unknown as { game: G }).game;
    g.state.countries[g.state.player].gold = -50;
    g.runner.sync();
  });
  const sign = page.getByRole('button', { name: 'The treasury runs dry' });
  await sign.click();
  await expect(page.getByRole('tab', { name: 'Treasury' })).toHaveAttribute('aria-selected', 'true');
  await sign.click({ button: 'right' });
  await expect(sign).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('makes friends: an alliance, the diplomacy map and a forged claim', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');

  // Open panels the way a click on the map would (the camera may still be moving).
  const open = (what: { province?: string; country?: string }) =>
    page.evaluate((w) => {
      type G = {
        ui: { set: (p: object) => void };
        world: { regions: { id: number; name: string; kind: string }[] };
        state: { countries: ({ tag: string; index: number } | null)[] };
      };
      const g = (window as unknown as { game: G }).game;
      if (w.province) {
        const r = g.world.regions.find((x) => x.name === w.province && x.kind === 'land')!;
        g.ui.set({ panel: 'province', selectedProvince: r.id });
      } else {
        const c = g.state.countries.find((x) => x?.tag === w.country)!;
        g.ui.set({ panel: 'country', selectedCountry: c.index });
      }
    }, what);

  // Edinburgh, across the border in Scotland: a claim can be forged on it.
  await open({ province: 'Edinburgh' });
  await expect(page.locator('.side-panel .holder')).toContainText('Kingdom of Alba');
  await expect(page.locator('.side-panel button', { hasText: 'Forge a claim' })).toBeEnabled();

  // Scotland will ally with England.
  await page.locator('.side-panel .holder').click();
  await expect(page.getByRole('heading', { name: 'Kingdom of Alba' })).toBeVisible();
  await page.locator('.diplo-actions button', { hasText: 'Propose an alliance' }).click();
  await expect(page.locator('.fact-chip', { hasText: 'Allies' })).toBeVisible();

  await page.keyboard.press('u');
  await expect(page.getByRole('button', { name: 'Diplomacy map (U)' })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.nation-coa').click();
  await page.getByRole('tab', { name: 'Diplomacy' }).click();
  await expect(page.locator('.diplo-list')).toContainText('Kingdom of Alba');

  expect(errors).toEqual([]);
});

test('rules at home: laws, estates and the council', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');

  // Raise taxes: the commons grumble, and the laws must now rest for five years.
  await page.getByRole('tab', { name: 'Laws' }).click();
  await expect(page.locator('.side-panel')).toContainText('Legitimacy');
  const high = page.getByRole('radiogroup', { name: 'Taxation' }).getByRole('radio', { name: 'High' });
  await high.click();
  await expect(high).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.side-panel')).toContainText('Laws may change again on');
  await expect(
    page.getByRole('radiogroup', { name: 'Conscription' }).getByRole('radio', { name: 'Heavy' }),
  ).toBeDisabled();
  await expect(page.locator('.estate', { hasText: 'Commons' })).toBeVisible();

  // Set the steward to developing the land.
  await page.getByRole('tab', { name: 'Court' }).click();
  await expect(page.locator('.portrait').first()).toBeVisible();
  const develop = page.getByRole('radio', { name: 'Develop the land' });
  await develop.click();
  await expect(develop).toHaveAttribute('aria-checked', 'true');

  expect(errors).toEqual([]);
});

test('keeps the faith: missions, accepted peoples and the faith map', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.locator('.bookmark', { hasText: 'Byzantium' }).click();
  await page.getByRole('button', { name: 'Play as Byzantium' }).click();
  await expect(page.locator('.nation-name')).toHaveText('Byzantine Empire');

  // The emperor's church, its holy places and the peoples of the empire.
  await page.getByRole('tab', { name: 'Faith' }).click();
  await expect(page.locator('.faith-name')).toContainText('Orthodox');
  await expect(page.locator('.side-panel')).toContainText('Holy places');
  await expect(page.locator('.side-panel')).toContainText('Jerusalem');
  const armenians = page.locator('.shares li', { hasText: 'Armenian' });
  await armenians.getByRole('button', { name: 'Accept' }).click();
  await expect(armenians).toContainText('accepted');

  // Religious policy is a law like any other.
  await page.getByRole('tab', { name: 'Laws' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Religious policy' })).toBeVisible();

  // Missionaries to the richest province of another faith.
  await page.evaluate(() => {
    type G = {
      ui: { set: (p: object) => void };
      state: {
        player: number;
        countries: ({ religion: string } | null)[];
        provinces: ({ owner: number; religion: string | null; dev: number } | null)[];
      };
    };
    const g = (window as unknown as { game: G }).game;
    const faith = g.state.countries[g.state.player]!.religion;
    let best = 0,
      dev = -1;
    g.state.provinces.forEach((p, id) => {
      if (p && p.owner === g.state.player && p.religion && p.religion !== faith && p.dev > dev) {
        dev = p.dev;
        best = id;
      }
    });
    g.ui.set({ panel: 'province', selectedProvince: best });
  });
  await page.getByRole('button', { name: 'Send missionaries' }).click();
  await expect(page.locator('.side-panel')).toContainText('Missionaries at work');

  await page.keyboard.press('y');
  await expect(page.getByLabel('Faith legend')).toContainText('Orthodox');

  expect(errors).toEqual([]);
});

test('learns: the technology screen, a new era and its flag', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.locator('.bookmark', { hasText: 'France' }).click();
  await page.getByRole('button', { name: 'Play as France' }).click();
  await expect(page.locator('.nation-name')).toHaveText('Kingdom of France');
  await expect(page.locator('html')).toHaveAttribute('data-era', 'medieval');

  // Scholars favour the economy.
  await page.getByRole('button', { name: 'Technology' }).click();
  await expect(page.getByRole('heading', { name: 'Technology' })).toBeVisible();
  const economy = page.getByRole('region', { name: 'Economy' });
  await economy.getByRole('button', { name: 'Make this the focus' }).click();
  await expect(economy.getByRole('button', { name: 'The realm’s focus' })).toHaveAttribute('aria-pressed', 'true');
  await expect(economy).toContainText('Guilds');
  await page.keyboard.press('Escape');

  // The Laws tab shows the government and the reforms it may take.
  await page.locator('.nation-coa').click();
  await page.getByRole('tab', { name: 'Laws' }).click();
  await expect(page.locator('.side-panel')).toContainText('Feudal monarchy');

  // Centuries on, in the industrial era: a new look, and a flag in place of the arms.
  await page.evaluate(() => {
    type G = {
      state: { player: number; countries: ({ tech: Record<string, number> } | null)[] };
      runner: { sync(): void };
    };
    const g = (window as unknown as { game: G }).game;
    g.state.countries[g.state.player]!.tech = { economy: 20, military: 20, society: 20 };
    g.runner.sync();
  });
  await expect(page.locator('html')).toHaveAttribute('data-era', 'industrial');
  await expect(page.locator('.nation-coa .coa.flag')).toBeVisible();
  await page.getByRole('tab', { name: 'Army' }).click();
  await expect(page.locator('.recruit')).toContainText('Line infantry');

  expect(errors).toEqual([]);
});

test('sails: a fleet, the unknown lands and a colony', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.nation-name')).toHaveText('Kingdom of England');
  type G = {
    state: { player: number; countries: ({ tech: Record<string, number>; gold: number; known: string } | null)[] };
    world: { regions: { id: number; name: string }[] };
    map: { isUnknown(id: number): boolean };
    ui: { set(patch: Record<string, unknown>): void };
    runner: { sync(): void };
  };
  const region = (name: string) =>
    page.evaluate((n) => (window as unknown as { game: G }).game.world.regions.find((r) => r.name === n)!.id, name);
  const newYork = await region('New York');
  const london = await region('London');

  // The New World is unknown in 1066.
  expect(await page.evaluate((id) => (window as unknown as { game: G }).game.map.isUnknown(id), newYork)).toBe(true);

  // London's shipyard launches a galley for the fleet lying there.
  await page.evaluate(
    (id) => (window as unknown as { game: G }).game.ui.set({ panel: 'province', selectedProvince: id }),
    london,
  );
  await expect(page.locator('.side-panel')).toContainText('Shipyard');
  await page.locator('.recruit li', { hasText: 'Galleys' }).getByTitle('Build one').click();
  await expect(page.locator('.side-panel')).toContainText('6 ships');

  // The fleet, from the navy in the Army tab: its ships, and an order to chart the unknown.
  await page.locator('.nation-coa').click();
  await page.getByRole('tab', { name: 'Army' }).click();
  await expect(page.locator('.side-panel')).toContainText('cogs as transports');
  await page.locator('.side-panel').getByRole('button', { name: /First Fleet of England/ }).click();
  await expect(page.locator('.side-panel .sp-title')).toHaveText('First Fleet of England');
  await expect(page.locator('.side-panel')).toContainText('War cogs');
  await page.getByRole('button', { name: 'Explore' }).click();
  await expect(page.getByRole('button', { name: 'Stop exploring' })).toBeVisible();

  // Centuries on, the realm knows the world and can cross the ocean: a colony in America.
  await page.evaluate(() => {
    const g = (window as unknown as { game: G }).game;
    const c = g.state.countries[g.state.player]!;
    c.tech = { economy: 20, military: 18, society: 12 };
    c.gold = 5000;
    c.known = '*';
    g.runner.sync();
  });
  expect(await page.evaluate((id) => (window as unknown as { game: G }).game.map.isUnknown(id), newYork)).toBe(false);
  await page.evaluate(
    (id) => (window as unknown as { game: G }).game.ui.set({ panel: 'province', selectedProvince: id }),
    newYork,
  );
  await expect(page.locator('.side-panel')).toContainText('Iroquoian');
  await page.getByRole('button', { name: /Found a colony/ }).click();
  await expect(page.locator('.side-panel')).toContainText('Your colonists are settling it');

  expect(errors).toEqual([]);
});

test('meets events: a choice, a modifier, a nation to proclaim and spies abroad', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
  type E = {
    runner: { sync: () => void };
    ui: { set: (p: object) => void };
    state: {
      day: number;
      nextId: number;
      player: number;
      events: object[];
      countries: ({ tag: string; index: number; gold: number } | null)[];
    };
  };

  // The knights ask for a tournament; the game stops until the crown answers.
  await page.evaluate(() => {
    const g = (window as unknown as { game: E }).game;
    const s = g.state;
    s.countries[s.player]!.gold = 500;
    s.events.push({ id: s.nextId++, event: 'tournament', country: s.player, province: 0, other: 0, day: s.day });
    g.runner.sync();
  });
  const dialog = page.getByRole('dialog', { name: 'A Great Tournament' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('The knights of England');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Hold the tournament/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // The realm now carries the fervour for ten years, and one day may proclaim Great Britain.
  await page.locator('.nation-coa').click();
  await expect(page.locator('.modifier', { hasText: 'Martial fervour' })).toBeVisible();
  await expect(page.locator('.decision')).toContainText('Proclaim the Kingdom of Great Britain');
  await expect(page.locator('.decision').getByRole('button', { name: 'Proclaim' })).toBeDisabled();

  // Spies in France: the spymaster goes to work there.
  await page.evaluate(() => {
    const g = (window as unknown as { game: E }).game;
    const fra = g.state.countries.find((c) => c?.tag === 'FRA')!;
    g.ui.set({ panel: 'country', selectedCountry: fra.index });
  });
  await expect(page.locator('.intrigue')).toBeVisible();
  await page.getByRole('button', { name: 'Build a network here' }).click();
  await expect(page.getByRole('button', { name: 'Recall the agents' })).toBeVisible();
  await expect(page.locator('.plot', { hasText: 'Assassinate the ruler' }).getByRole('button')).toBeDisabled();

  expect(errors).toEqual([]);
});

test('shows a new ruler around with the guided tour, and explains the game', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'How to Play' }).click({ timeout: 120_000 });
  const help = page.getByRole('dialog', { name: 'How to play' });
  await expect(help).toContainText('There is no single way to win');
  await help.getByRole('button', { name: 'Keys and mouse' }).click();
  await expect(help.locator('.help-keys')).toContainText('Pause and resume');
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  await page.getByRole('button', { name: 'New Campaign' }).click();
  await page.getByRole('button', { name: 'Play as England' }).click();
  const tour = page.getByRole('dialog', { name: 'A thousand years to rule' });
  await expect(tour).toContainText('the Kingdom of England is yours to rule');
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'The game menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.locator('.tour')).toHaveCount(0);
  await expect(page.locator('.dateplate')).toHaveClass(/paused/);
  expect(await page.evaluate(() => localStorage.getItem('crowns-and-centuries:tour'))).toBe('done');

  // How to play is always a key away.
  await page.keyboard.press('h');
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('keeps the ledger of nations and ends the age in 2066', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.locator('.bookmark', { hasText: 'France' }).click();
  await page.getByRole('button', { name: 'Play as France' }).click();
  await expect(page.locator('.nation-name')).toHaveText('Kingdom of France');

  await page.keyboard.press('l');
  const ledger = page.getByRole('dialog', { name: 'The ledger of nations' });
  await expect(ledger.locator('.ledger-table tr.mine')).toContainText('Kingdom of France');
  await ledger.getByRole('tab', { name: 'Chronicle' }).click();
  await expect(ledger).toContainText('Harald Hardrada');
  await page.keyboard.press('Escape');

  // The last days of 2065: when the year turns, the age ends and the nations are ranked.
  await page.evaluate(
    (day) => {
      (window as unknown as { game: { state: { day: number } } }).game.state.day = day;
    },
    toDay(2065, 12, 30),
  );
  await page.keyboard.press('5');
  const end = page.getByRole('dialog', { name: 'The end of the age' });
  await expect(end).toBeVisible({ timeout: 30_000 });
  await expect(end).toContainText('The Kingdom of France stands');
  await end.getByRole('button', { name: 'Play on' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // The settings keep the sound.
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Sound' }).click();
  await page.locator('.sound-row', { hasText: 'Music' }).locator('input[type=checkbox]').check();
  expect(await page.evaluate(() => localStorage.getItem('crowns-and-centuries:audio'))).toContain('"music":true');
  expect(errors).toEqual([]);
});

test('weathers a failure: the clock stops, a report is saved, and the game carries on', async ({ page }) => {
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
  type G = {
    state: { scheduled: unknown; player: number; countries: ({ tech: unknown } | null)[] };
    runner: { sync(): void };
  };

  // The world cannot go on: the clock stops and the panel says why.
  await page.evaluate(() => {
    const g = (window as unknown as { game: G; kept: unknown }).game;
    (window as unknown as { kept: unknown }).kept = g.state.scheduled;
    g.state.scheduled = null;
  });
  await page.keyboard.press('3');
  const panel = page.getByRole('alertdialog', { name: 'Something went wrong' });
  await expect(panel).toContainText('The world could not go on to the next day.');
  await expect(page.locator('.dateplate')).toHaveClass(/paused/);

  // The report holds the error and the campaign's save.
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download a report' }).click();
  const file = await (await download).path();
  const report = JSON.parse(readFileSync(file, 'utf8'));
  expect(report.format).toBe('crowns-and-centuries-report');
  expect(report.failure.source).toBe('simulation');
  expect(report.campaign.realm).toBe('Kingdom of England');
  expect(report.save.format).toBe('crowns-and-centuries');

  // Mended, the game carries on.
  await page.evaluate(() => {
    const w = window as unknown as { game: G; kept: unknown };
    w.game.state.scheduled = w.kept;
  });
  await panel.getByRole('button', { name: 'Carry on' }).click();
  await expect(panel).toHaveCount(0);
  await page.keyboard.press('5');
  await expect(page.locator('.date-long')).not.toHaveText('15th of September, 1066 AD', { timeout: 30_000 });
  await page.keyboard.press(' ');

  // A part of the screen that cannot be drawn takes the panel's place, not the whole page.
  await page.evaluate(() => {
    const g = (window as unknown as { game: G; kept: unknown }).game;
    const c = g.state.countries[g.state.player]!;
    (window as unknown as { kept: unknown }).kept = c.tech;
    c.tech = null;
    g.runner.sync();
  });
  await expect(panel).toContainText('The interface failed to draw part of the screen.');
  await page.evaluate(() => {
    const w = window as unknown as { game: G; kept: unknown };
    w.game.state.countries[w.game.state.player]!.tech = w.kept;
  });
  await panel.getByRole('button', { name: 'Carry on' }).click();
  await expect(page.locator('.nation-name')).toHaveText('Kingdom of England');
});

test('settles in: a larger interface, a key of its own and a faster top speed', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Campaign' }).click({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play as England' }).click();
  await expect(page.locator('.date-long')).toHaveText('15th of September, 1066 AD');
  const plate = async () => (await page.locator('.panel.nation').boundingBox())!;
  const before = await plate();

  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });

  // The whole interface grows by a quarter; the map stays as it was.
  await dialog.getByRole('radiogroup', { name: 'Interface scale' }).getByRole('radio', { name: '125%' }).click();
  await expect(page.locator('html')).toHaveCSS('--ui-scale', '1.25');
  const after = await plate();
  expect(after.width / before.width).toBeCloseTo(1.25, 1);
  expect((await page.getByTestId('map').boundingBox())!.width).toBe(1600);

  // Pause moves from Space to P.
  await dialog.getByRole('button', { name: 'Keys' }).click();
  await dialog.getByRole('button', { name: 'Pause and resume, first key: Space' }).click();
  await expect(dialog.getByRole('button', { name: 'Pause and resume, first key: press a key' })).toHaveText(
    'Press a key…',
  );
  await page.keyboard.press('p');
  await expect(dialog.getByRole('button', { name: 'Pause and resume, first key: P' })).toBeVisible();

  // Speed 5 runs as fast as the machine allows.
  await dialog.getByRole('button', { name: 'Time and saving' }).click();
  await dialog.getByRole('radiogroup', { name: 'Fastest speed' }).getByRole('radio', { name: 'Unlimited' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('crowns-and-centuries:settings')!));
  expect(saved).toMatchObject({ uiScale: 1.25, topSpeed: 0, keys: { pause: ['P'] } });

  // Esc goes back to the game menu, and again to the game.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'The scriptorium' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.keyboard.press(' ');
  await expect(page.locator('.dateplate')).toHaveClass(/paused/);
  await page.keyboard.press('p');
  await expect(page.locator('.dateplate')).toHaveClass(/running/);
  await page.keyboard.press('p');
  await expect(page.locator('.dateplate')).toHaveClass(/paused/);
  await expect(page.getByRole('button', { name: 'Resume (P)' })).toBeVisible();

  // F3 shows what the frames and the days cost, and hides it again.
  await page.keyboard.press('F3');
  await expect(page.getByRole('complementary', { name: 'Performance' })).toContainText('fps');
  await page.keyboard.press('F3');
  await expect(page.getByRole('complementary', { name: 'Performance' })).toHaveCount(0);

  // How to play lists the new key.
  await page.keyboard.press('h');
  const help = page.getByRole('dialog', { name: 'How to play' });
  await help.getByRole('button', { name: 'Keys and mouse' }).click();
  await expect(help.locator('.help-keys tr', { hasText: 'Pause and resume' })).toContainText('P');
  expect(errors).toEqual([]);
});
