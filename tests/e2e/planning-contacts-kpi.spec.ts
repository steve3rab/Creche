import { test, expect } from './fixtures';

test('planning : création, modification et suppression récupérable d’un créneau', async ({
  page,
  workspace,
}) => {
  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  await page.getByRole('button', { name: 'Créneau', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nouveau créneau' });
  await dialog.getByLabel('Responsable', { exact: true }).selectOption({ label: 'Léa Martin' });
  await dialog.getByLabel('Heure de début', { exact: true }).fill('08:00');
  await dialog.getByLabel('Heure de fin', { exact: true }).fill('12:00');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Créneau enregistré');
  await expect(page.getByText('Léa Martin')).toBeVisible();
  await expect(page.getByText('08:00–12:00')).toBeVisible();

  await page.getByText('08:00–12:00').click();
  dialog = page.getByRole('dialog', { name: 'Modifier le créneau' });
  await dialog.getByLabel('Heure de fin', { exact: true }).fill('13:00');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Créneau enregistré');
  await expect(page.getByText('08:00–13:00')).toBeVisible();

  await page.getByText('08:00–13:00').click();
  dialog = page.getByRole('dialog', { name: 'Modifier le créneau' });
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmer l’action' });
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Créneau déplacé dans la corbeille');
  expect(await workspace.store.list('planning')).toEqual([]);
});

test('planning : refuse une heure de fin antérieure à l’heure de début', async ({ page }) => {
  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  await page.getByRole('button', { name: 'Créneau', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau créneau' });
  await dialog.getByLabel('Responsable', { exact: true }).selectOption({ label: 'Léa Martin' });
  await dialog.getByLabel('Heure de début', { exact: true }).fill('12:00');
  await dialog.getByLabel('Heure de fin', { exact: true }).fill('08:00');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('après l’heure de début');
});

test('contacts : création, recherche et suppression récupérable', async ({ page, workspace }) => {
  await page.getByRole('link', { name: 'Contacts', exact: true }).click();
  await page.getByRole('button', { name: 'Nouveau contact', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouveau contact' });
  await dialog.getByLabel('Nom', { exact: true }).fill('CAF de Paris');
  await dialog.getByLabel('Structure', { exact: true }).fill('CAF');
  await dialog.getByLabel('Téléphone', { exact: true }).fill('0102030405');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Contact enregistré');
  await expect(page.getByText('CAF de Paris')).toBeVisible();

  await page.getByLabel('Rechercher dans les contacts').fill('introuvable');
  await expect(page.getByText('Aucun contact ne correspond à la recherche.')).toBeVisible();
  await page.getByLabel('Rechercher dans les contacts').fill('CAF');
  await expect(page.getByText('CAF de Paris')).toBeVisible();
  await page.getByLabel('Rechercher dans les contacts').fill('');

  await page.getByRole('button', { name: 'Supprimer le contact' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmer l’action' });
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(
    page.getByText('Ajoutez votre premier contact utile à l’association.'),
  ).toBeVisible();
  expect(await workspace.store.list('contacts')).toEqual([]);
});

test('statistiques : reflètent les données de démonstration', async ({ page }) => {
  await page.getByRole('link', { name: 'Statistiques', exact: true }).click();
  await expect(page.locator('.kpi-tile', { hasText: 'Actions en retard' })).toContainText('1');
  await expect(page.locator('.kpi-tile', { hasText: 'Membres actifs' })).toContainText('5');
  await expect(page.locator('.kpi-panel', { hasText: 'Actions par statut' })).toContainText(
    'À faire',
  );
});

test('rappel automatique : apparaît quand une réunion approche, et se ferme', async ({ page }) => {
  const banner = page.locator('.reminder-banner');
  await expect(banner).toHaveCount(0);
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await page.getByLabel('Rappel avant une réunion (jours)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Paramètres enregistrés');
  await expect(banner).toContainText('réunion approche');
  await expect(banner).toContainText('Conseil d’administration');
  await page.getByRole('button', { name: 'Fermer le rappel' }).click();
  await expect(banner).toHaveCount(0);
});
