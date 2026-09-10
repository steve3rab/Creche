import { test, expect } from './fixtures';
import fs from 'node:fs/promises';
import { newBase } from '../../src/domain/models';
test('notes : texte fourni, filtres combinés, recherche et tri', async ({ page, workspace }) => {
  const notes = JSON.parse(await fs.readFile('scripts/data/notes-initiales.json', 'utf8'));
  for (const note of notes)
    await workspace.store.saveRecord('notes', { ...newBase(), ...note }, true);
  await page.goto(workspace.url + '/notes');
  await expect(page.locator('.note-card')).toHaveCount(8);
  await page.getByLabel('Trier par').selectOption('titre');
  await expect(page.locator('.note-title').first()).toHaveText(
    'Belami : logiciel de gestion de crèche',
  );
  await expect(page).toHaveScreenshot('notes.png');
  await page.getByLabel('Catégorie', { exact: true }).selectOption('Partenaires');
  await page.getByLabel('Niveau d’importance').selectOption('IMPORTANT');
  await expect(page.locator('.note-card')).toHaveCount(2);
  await page.getByLabel('Rechercher', { exact: true }).fill('securite');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.locator('.note-title')).toContainText('PMI');
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await page.getByLabel('Rechercher', { exact: true }).fill('PSU');
  await page.locator('.note-title').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Prestation de service unique');
  await expect(page).toHaveScreenshot('note-lecture.png');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.getByLabel('Recherche globale').fill('Belami');
  await page.getByRole('link', { name: 'Belami : logiciel de gestion de crèche Note' }).click();
  await expect(page.getByRole('dialog')).toContainText('taux de facturation');
});

test('notes : création, édition, annulation et suppression récupérable', async ({
  page,
  workspace,
}) => {
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle note' }).click();
  let dialog = page.getByRole('dialog', { name: 'Nouvelle note' });
  await dialog.getByLabel('Titre', { exact: true }).fill('Accueil des parents');
  await dialog.getByLabel('Catégorie', { exact: true }).fill('Vie des familles');
  await dialog.getByLabel('Niveau d’importance').selectOption('PRIORITAIRE');
  await dialog.getByLabel('Contenu').fill('Répartir les permanences.\nContacter les familles.');
  await expect(page).toHaveScreenshot('note-formulaire.png');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Note enregistrée');
  dialog = page.getByRole('dialog', { name: 'Accueil des parents' });
  await dialog.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Contenu').fill('Nouveau contenu conservé.');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Nouveau contenu conservé.');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.note-card')).toContainText('Nouveau contenu conservé.');
  await page.getByLabel('Trier par').selectOption('importance');
  await expect(page.locator('.note-importance').first()).toHaveText('Prioritaire');
  await page.getByRole('button', { name: 'Modifier la note' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Titre', { exact: true })
    .fill('Modification abandonnée');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmer l’action' });
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Modifier la note' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page.getByRole('button', { name: 'Supprimer la note' }).click();
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: /Corbeille/ }).click();
  await page.locator('#corbeille').getByRole('button', { name: 'Restaurer' }).click();
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('#corbeille')).toContainText('La corbeille est vide.');
  expect((await workspace.store.list('notes'))[0]).toMatchObject({
    titre: 'Accueil des parents',
    categorie: 'Vie des familles',
    importance: 'PRIORITAIRE',
    contenu: 'Nouveau contenu conservé.',
  });
});
