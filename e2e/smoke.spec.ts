import { expect, test } from '@playwright/test';

test('loads the world of 1066, takes a realm and inspects the map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

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
