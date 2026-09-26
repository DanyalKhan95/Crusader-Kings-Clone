import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.locator('.modal .ranked-row')).toContainText('Kingdom of England');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

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
