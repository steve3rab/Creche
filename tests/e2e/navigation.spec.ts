import fs from 'node:fs/promises';
import { test, expect } from './fixtures';
test('topbar : le titre de l’espace change avec la navigation', async ({ page }) => {
  const topbar = page.locator('.topbar');
  await expect(topbar).toContainText('Les Filoustics');
  await expect(topbar).toContainText('Accueil');
  await page.getByRole('link', { name: 'Réunions', exact: true }).click();
  await expect(topbar).toContainText('Réunions');
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(topbar).toContainText('Documents');
  await expect(topbar).not.toContainText('Réunions');
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await expect(topbar).toContainText('Paramètres');
});
test('paramètres : ouverture du répertoire refusée proprement si le dossier a disparu', async ({
  page,
  workspace,
}) => {
  await fs.rm(workspace.store.root, { recursive: true, force: true });
  const response = await page.request.post(workspace.url + '/api/ouvrir-repertoire');
  expect(response.status()).toBe(404);
  expect((await response.json()).error).toContain('introuvable');
});
