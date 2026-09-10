import { test, expect } from './fixtures';
test('références visuelles 879 × 645, sans débordement', async ({ page, workspace }) => {
  const screens = [
    ['dashboard', '/'],
    ['reunions', '/reunions'],
    ['fiche-reunion', '/reunions/' + workspace.seeded.meetings[0].id],
    ['agenda', '/agenda'],
    ['documents', '/documents'],
  ] as const;
  for (const [name, url] of screens) {
    await page.goto(workspace.url + url);
    await expect(page.locator('main')).toBeVisible();
    await expect(
      page.locator('main .panel, main .list-card, main .calendar').first(),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(name + '.png', { animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const sidebar = await page.locator('.sidebar').boundingBox();
    expect(sidebar?.width).toBe(170);
  }
  await page.goto(workspace.url + '/reunions/' + workspace.seeded.meetings[0].id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Valider le PV' })).toBeInViewport();
  await expect(page).toHaveScreenshot('pv.png');
  await page.keyboard.press('Control+n');
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(645);
  await expect(modal.getByRole('button', { name: 'Créer la réunion' })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
