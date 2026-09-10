import { test, expect } from './fixtures';
import { pdfText } from './pdf-text';
import fs from 'node:fs/promises';
test('membre : un seul nom, prénom enfant facultatif, sans dates', async ({ page, workspace }) => {
  await page.getByRole('link', { name: 'Membres', exact: true }).click();
  await expect(page.getByText('Léa Martin', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Membre', exact: true }).click();
  await page.getByLabel('Nom et prénom', { exact: true }).fill('Alex Dominique Durand');
  await expect(page.getByLabel('Date d’entrée')).toHaveCount(0);
  await expect(page.getByLabel('Date de sortie')).toHaveCount(0);
  await expect(page.getByLabel('Prénom de l’enfant (facultatif)')).not.toHaveAttribute('required');
  await expect(page).toHaveScreenshot('membre-formulaire.png');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.locator('article').filter({ hasText: 'Alex Dominique Durand' });
  await row.getByRole('button', { name: 'Modifier le membre' }).click();
  await page.getByLabel('Prénom de l’enfant (facultatif)').fill('Noa');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Enfant : Noa', { exact: true })).toBeVisible();
  expect(
    (await workspace.store.list('membres')).find(
      (m) => 'nomComplet' in m && m.nomComplet === 'Alex Dominique Durand',
    ),
  ).toMatchObject({ prenomEnfant: 'Noa' });
});
test('réunion : deux types, lieu choisi ou libre et PDF cohérent', async ({ page, workspace }) => {
  await page.getByRole('button', { name: 'Réunion', exact: true }).click();
  await page.getByLabel('Deuxième type (facultatif)').selectOption('BUREAU');
  await expect(page.getByLabel('Titre (facultatif)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Choix du lieu')).toHaveValue('creche');
  await expect(page.getByLabel('Autre lieu', { exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot('reunion-formulaire.png');
  await page.getByRole('button', { name: 'Créer la réunion' }).click();
  await expect(page).toHaveURL(/\/reunions\/[\da-f-]+$/);
  const id = page.url().split('/').at(-1)!;
  // Sans titre personnalisé, l’intitulé affiché retombe sur les types combinés.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Conseil d’administration + Bureau',
  );
  await expect(page.getByLabel('Deuxième type (facultatif)')).toHaveValue('BUREAU');
  await page.getByLabel('Choix du lieu').selectOption('autre');
  await page.getByLabel('Autre lieu', { exact: true }).fill('Salle municipale');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Enregistré');
  await page.reload();
  await expect(page.getByLabel('Autre lieu', { exact: true })).toHaveValue('Salle municipale');
  await page.getByRole('button', { name: 'Convocation', exact: true }).click();
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir PDF', exact: true })).toBeVisible();
  const file = await workspace.store.safe(
    `${await workspace.store.meetingDir(id)}/Convocation_CA-BUREAU_2026-09-07.pdf`,
  );
  const text = await pdfText(await fs.readFile(file));
  expect(text).toContain('Conseil d’administration + Bureau');
  expect(text).toContain('Salle municipale');
});
test('agenda : vacances sur plusieurs jours et liens alignés', async ({ page, workspace }) => {
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Date importante' }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Vacances de septembre');
  await page.getByLabel('Date de début').fill('2026-09-06');
  await expect(page.getByLabel('Date de fin')).toHaveValue('2026-09-06');
  await page.getByLabel('Date de fin').fill('2026-09-09');
  await page.getByLabel('Catégorie', { exact: true }).selectOption('Vacances');
  const meeting = await page.getByLabel('Lié à une réunion').boundingBox(),
    action = await page.getByLabel('Lié à une action').boundingBox();
  expect(Math.abs(meeting!.y - action!.y)).toBeLessThan(2);
  expect(action!.x).toBeGreaterThan(meeting!.x);
  await expect(page).toHaveScreenshot('agenda-formulaire.png');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('.calendar-event').filter({ hasText: 'Vacances de septembre' }),
  ).toHaveCount(4);
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.getByRole('button', { name: /Vacances de septembre/ })).toContainText(
    'En cours',
  );
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByText('Vacances de septembre', { exact: true })).toBeVisible();
  await page.reload();
  expect(
    (await workspace.store.list('agenda')).find(
      (e) => 'titre' in e && e.titre === 'Vacances de septembre',
    ),
  ).toMatchObject({ date: '2026-09-06', dateFin: '2026-09-09' });
});
test('tableau de bord : toute la largeur disponible en grande fenêtre', async ({ page }) => {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(28, 34, 43)');
  await page.setViewportSize({ width: 1600, height: 900 });
  const geometry = await page.locator('.dashboard-grid').evaluate((el) => {
    const main = el.parentElement!,
      style = getComputedStyle(main);
    return {
      width: el.getBoundingClientRect().width,
      available: main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    };
  });
  expect(Math.abs(geometry.width - geometry.available)).toBeLessThan(2);
  await expect(page).toHaveScreenshot('dashboard-large.png');
});
