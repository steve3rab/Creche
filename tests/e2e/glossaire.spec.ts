import { test, expect } from './fixtures';

test('glossaire : création, clé en doublon refusée, recherche et suppression récupérable', async ({
  page,
  workspace,
}) => {
  await page.getByRole('link', { name: 'Glossaire', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle entrée' }).click();
  let dialog = page.getByRole('dialog', { name: 'Nouvelle entrée' });
  await dialog.getByLabel('Clé', { exact: true }).fill('pmi');
  await dialog.getByLabel('Valeur', { exact: true }).fill('Protection Maternelle et Infantile');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Service départemental qui délivre l’agrément.');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Entrée enregistrée');
  await expect(page.locator('.glossary-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.glossary-table code')).toHaveText('@pmi');

  await page.getByRole('button', { name: 'Nouvelle entrée' }).click();
  dialog = page.getByRole('dialog', { name: 'Nouvelle entrée' });
  await dialog.getByLabel('Clé', { exact: true }).fill('PMI');
  await dialog.getByLabel('Valeur', { exact: true }).fill('Doublon refusé');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert').locator('span')).toHaveText('Cette clé est déjà utilisée.');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.glossary-table tbody tr')).toHaveCount(1);

  await page.getByLabel('Rechercher dans le glossaire').fill('introuvable');
  await expect(page.getByText('Aucune entrée ne correspond à la recherche.')).toBeVisible();
  await page.getByLabel('Rechercher dans le glossaire').fill('agrément');
  await expect(page.locator('.glossary-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Rechercher dans le glossaire').fill('');

  await page.getByRole('button', { name: 'Supprimer l’entrée' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmer l’action' });
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByText('Ajoutez votre première entrée de glossaire.')).toBeVisible();
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: /Corbeille/ }).click();
  await page.locator('#corbeille').getByRole('button', { name: 'Restaurer' }).click();
  await confirm.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('#corbeille')).toContainText('La corbeille est vide.');
  expect(await workspace.store.list('glossaire')).toMatchObject([{ cle: 'pmi' }]);
});

test('glossaire : « @clé » se transforme en valeur pendant la rédaction du PV', async ({
  page,
  workspace,
}) => {
  await page.goto(workspace.url + '/glossaire');
  await page.getByRole('button', { name: 'Nouvelle entrée' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle entrée' });
  await dialog.getByLabel('Clé', { exact: true }).fill('pmi');
  await dialog.getByLabel('Valeur', { exact: true }).fill('Protection Maternelle et Infantile');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Entrée enregistrée');

  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  // The tag sits at the very end of what's typed so far, so a plain fill (cursor
  // lands at the end) reproduces "just typed a trigger character" faithfully.
  const discussion = page.getByLabel('Résumé des échanges', { exact: true }).first();
  await discussion.fill('Rencontre organisée avec la @pmi ');
  await expect(discussion).toHaveValue(
    'Rencontre organisée avec la Protection Maternelle et Infantile ',
  );

  // With more text typed after the tag, real keystroke-by-keystroke typing is
  // needed so the trigger character actually lands right after the key.
  const decision = page.getByLabel('Décision', { exact: true }).first();
  await decision.pressSequentially('Relancer la @PMI, avant la fin du mois.');
  await expect(decision).toHaveValue(
    'Relancer la Protection Maternelle et Infantile, avant la fin du mois.',
  );

  // An unknown key is left untouched — no accidental transformation.
  await decision.fill('');
  await decision.pressSequentially('Aucune clé ne correspond à @inconnu ici.');
  await expect(decision).toHaveValue('Aucune clé ne correspond à @inconnu ici.');

  await decision.fill('');
  await decision.pressSequentially('Relancer la @pmi avant la fin du mois.');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  await expect(page.getByRole('status')).toHaveText('Enregistré');
  const saved = await workspace.store.meeting(m.id);
  expect(saved.ordreDuJour[0].discussion).toBe(
    'Rencontre organisée avec la Protection Maternelle et Infantile ',
  );
  expect(saved.ordreDuJour[0].decision).toBe(
    'Relancer la Protection Maternelle et Infantile avant la fin du mois.',
  );
});
