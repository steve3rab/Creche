import { pdfText } from './pdf-text';
import { test, expect } from './fixtures';
import fs from 'node:fs/promises';
import { atomicJson } from '../../server/services/storage';
import { meetingSchema } from '../../src/domain/models';
test('1 · créer un CA et vérifier le fichier JSON', async ({ page, workspace }) => {
  await page.getByRole('button', { name: 'Réunion', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date', { exact: true }).fill('2026-10-15');
  await dialog.getByLabel('Heure', { exact: true }).fill('19:30');
  await dialog.getByLabel('Choix du lieu').selectOption('autre');
  await dialog.getByLabel('Autre lieu', { exact: true }).fill('Salle verte');
  await dialog.getByRole('button', { name: 'Créer la réunion' }).click();
  await expect(page).toHaveURL(/\/reunions\/[a-f0-9-]+$/);
  await expect(
    page.getByRole('heading', { name: 'Conseil d’administration', exact: true, level: 1 }),
  ).toBeVisible();
  const all = await workspace.store.meetings(),
    m = all.find((m) => m.date === '2026-10-15');
  expect(m).toMatchObject({ heureDebut: '19:30', lieu: 'Salle verte', statut: 'BROUILLON' });
  expect(
    JSON.parse(
      await fs.readFile(
        await workspace.store.safe(await workspace.store.meetingFile(m!.id)),
        'utf8',
      ),
    ),
  ).toMatchObject({ id: m!.id });
});
test('2 · quatre points réordonnés restent persistés', async ({ page, workspace }) => {
  const m = workspace.seeded.meetings[1];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'Ordre du jour', exact: true }).click();
  for (const [i, t] of ['Validation', 'Budget', 'Organisation', 'Questions'].entries()) {
    await page.getByRole('button', { name: 'Ajouter un point' }).click();
    await page.getByLabel(`Point ${i + 1}`, { exact: true }).fill(t);
  }
  await page.getByRole('button', { name: 'Monter', exact: true }).nth(3).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');
  await page.reload();
  await page.getByRole('button', { name: 'Ordre du jour', exact: true }).click();
  await expect(page.getByLabel('Point 3', { exact: true })).toHaveValue('Questions');
  expect((await workspace.store.meeting(m.id)).ordreDuJour.map((p) => p.titre)).toEqual([
    'Validation',
    'Budget',
    'Questions',
    'Organisation',
  ]);
});
test('3 · convocation PDF réelle, nom et contenu HTML', async ({ page, workspace }) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'Convocation', exact: true }).click();
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir PDF', exact: true })).toBeVisible();
  const file = await workspace.store.safe(
    `${await workspace.store.meetingDir(m.id)}/Convocation_CA_2026-09-15.pdf`,
  );
  expect((await fs.readFile(file)).subarray(0, 5).toString()).toBe('%PDF-');
  const extracted = await pdfText(await fs.readFile(file));
  expect(extracted).toContain('Les Filoustics');
  expect(extracted).toContain('Salle des parents');
  expect(extracted).toContain('Enfant non renseigné');
  expect(extracted).not.toContain('Léa Martin');
  const html = await fs.readFile(file.replace('.pdf', '.html'), 'utf8');
  expect(html).toContain('Les Filoustics');
  expect(html).toContain('Salle des parents');
  expect(html).toContain('Enfant non renseigné');
  expect(html).not.toContain('Léa Martin');
  expect(html).toContain('Organisation de la rentrée');
});
test('4 · PV, présences, décision, vote et action persistent', async ({ page, workspace }) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByLabel('Présence de Hugo Petit').selectOption('ABSENT');
  await page
    .getByLabel('Résumé des échanges', { exact: true })
    .first()
    .fill('Le conseil examine la demande.');
  await page
    .getByLabel('Décision', { exact: true })
    .first()
    .fill('Contacter la mairie pour la convention.');
  await page.getByLabel('Consigner un vote', { exact: true }).first().check();
  await page.getByLabel('Pour', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Créer une action liée' }).first().click();
  await expect(page.getByRole('status')).toContainText('Action créée');
  await page.goto(workspace.url + '/');
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await expect(page.getByLabel('Décision', { exact: true }).first()).toHaveValue(
    'Contacter la mairie pour la convention.',
  );
  await expect(page.getByLabel('Pour', { exact: true })).toHaveValue('2');
  expect((await workspace.store.meeting(m.id)).participants[1].etat).toBe('ABSENT');
  expect(
    (await workspace.store.list('actions')).filter(
      (a) => 'reunionSource' in a && a.reunionSource === m.id,
    ),
  ).toHaveLength(1);
});
test('5 · validation du PV protège aussi l’API', async ({ page, workspace }) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByRole('button', { name: 'Valider le PV', exact: true }).click();
  await expect(page.getByText('modifications protégées')).toBeVisible();
  await expect(page.getByLabel('Résumé des échanges', { exact: true }).first()).toBeDisabled();
  const locked = await workspace.store.meeting(m.id);
  const result = await page.request.put(workspace.url + '/api/reunions/' + m.id, {
    data: { ...locked, notes: 'Interdit' },
  });
  expect(result.status()).toBe(409);
});
test('6 · importer, déplacer, renommer, supprimer et restaurer un document', async ({
  page,
  workspace,
}) => {
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un fichier', exact: true }).click();
  await page.getByLabel('Fichier (20 Mo maximum)').setInputFiles({
    name: 'Essai.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Un document de test'),
  });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.locator('article').filter({ hasText: 'Essai.txt' });
  await row.getByRole('button', { name: 'Renommer ou déplacer' }).click();
  await page.getByLabel('Nom du fichier').fill('Convention.txt');
  await page.getByLabel('Catégorie', { exact: true }).selectOption('conventions');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const moved = (await workspace.store.list('documents')).find(
    (d) => 'nom' in d && d.nom === 'Convention.txt',
  );
  expect(moved).toMatchObject({ categorie: 'conventions' });
  await page
    .locator('article')
    .filter({ hasText: 'Convention.txt' })
    .getByRole('button', { name: 'Supprimer le document' })
    .click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByText('Convention.txt', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: /Corbeille/ }).click();
  await page.locator('#corbeille').getByRole('button', { name: 'Restaurer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('#corbeille').getByText('La corbeille est vide.')).toBeVisible();
  expect(
    (await workspace.store.list('documents')).some((d) => 'nom' in d && d.nom === 'Convention.txt'),
  ).toBe(true);
});
test('7 · événement visible dans mois, liste et accueil', async ({ page }) => {
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Date importante', exact: true }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Rendez-vous mairie');
  await page.getByLabel('Date de début', { exact: true }).fill('2026-09-08');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('.calendar-event').filter({ hasText: 'Rendez-vous mairie' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.getByRole('button', { name: /Rendez-vous mairie/ })).toBeVisible();
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.getByText('Rendez-vous mairie', { exact: true })).toBeVisible();
});
test('8 · action créée avec échéance dépassée', async ({ page }) => {
  await page.getByRole('link', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Action', exact: true }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Relancer la signature');
  await page.getByLabel('Échéance', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('button', { name: /Relancer la signature/ })).toContainText(
    'En retard',
  );
});
test('9 · JSON corrompu : erreur claire, aucun écrasement et restauration', async ({
  page,
  workspace,
}) => {
  const file = await workspace.store.safe('agenda.json');
  await fs.writeFile(file, '{CORROMPU');
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Fichier invalide');
  expect(await fs.readFile(file, 'utf8')).toBe('{CORROMPU');
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await page
    .locator('#sauvegardes')
    .getByRole('button', { name: 'Restaurer', exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Sauvegarde restaurée');
  expect(await workspace.store.list('agenda')).toHaveLength(4);
});
test('10 · interruption d’écriture simulée, relecture Edge de l’original', async ({
  page,
  workspace,
}) => {
  const m = workspace.seeded.meetings[0],
    file = await workspace.store.safe(await workspace.store.meetingFile(m.id));
  await expect(
    atomicJson(file, { ...m, lieu: 'Ne doit pas apparaître' }, meetingSchema, async () => {
      throw new Error('Interruption de test');
    }),
  ).rejects.toThrow();
  await page.goto(workspace.url + '/reunions/' + m.id);
  await expect(page.getByLabel('Autre lieu', { exact: true })).toHaveValue('Salle des parents');
  expect(meetingSchema.parse(JSON.parse(await fs.readFile(file, 'utf8'))).lieu).toBe(
    'Salle des parents',
  );
});
test('11 · titre facultatif et point ajouté en séance dans le PV', async ({ page, workspace }) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await expect(page.getByRole('heading', { name: m.titre, level: 1 })).toBeVisible();
  await page.getByLabel('Titre (facultatif)', { exact: true }).fill('Réunion de rentrée du CA');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enregistré');
  await expect(
    page.getByRole('heading', { name: 'Réunion de rentrée du CA', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un point non prévu' }).click();
  await page.getByLabel('Intitulé du point ajouté', { exact: true }).fill('Achat de matériel');
  await page
    .getByLabel('Résumé des échanges', { exact: true })
    .last()
    .fill('Un parent propose un achat groupé de matériel de motricité.');
  await expect(page.getByText('Ajouté en séance', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le PV PDF', exact: true })).toBeVisible();
  const saved = await workspace.store.meeting(m.id);
  expect(saved.titre).toBe('Réunion de rentrée du CA');
  const added = saved.ordreDuJour.find((p) => p.titre === 'Achat de matériel');
  expect(added).toMatchObject({ spontanee: true });
  expect(saved.ordreDuJour.filter((p) => !p.spontanee)).toHaveLength(4);
  const file = await workspace.store.safe(
    `${await workspace.store.meetingDir(m.id)}/PV_CA_2026-09-15.pdf`,
  );
  const text = await pdfText(await fs.readFile(file));
  expect(text).toContain('Achat de matériel');
  expect(text).toContain('AJOUTÉ EN SÉANCE');
  expect(text).toContain('Un parent propose un achat groupé de matériel de motricité.');
});
test('12 · responsable d’une action choisi parmi les membres', async ({ page, workspace }) => {
  await page.getByRole('link', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Action', exact: true }).click();
  await page.getByLabel('Titre', { exact: true }).fill('Organiser la kermesse');
  await page.getByLabel('Responsable', { exact: true }).selectOption({ label: 'Hugo Petit' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Organiser la kermesse/ })).toContainText(
    'Hugo Petit',
  );
  const hugo = workspace.seeded.members.find((m) => m.nomComplet === 'Hugo Petit')!;
  const saved = (await workspace.store.list('actions')).find(
    (a) => 'titre' in a && a.titre === 'Organiser la kermesse',
  );
  expect(saved).toMatchObject({ responsable: 'Hugo Petit', responsableId: hugo.id });
});
test('13 · PV validé apparaît dans Documents puis disparaît si le PV est rouvert', async ({
  page,
  workspace,
}) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByRole('button', { name: 'Valider le PV', exact: true }).click();
  await expect(page.getByText('modifications protégées')).toBeVisible();
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByText('PV_CA_2026-09-15.pdf', { exact: true })).toBeVisible();
  const linked = (await workspace.store.list('documents')).find(
    (d) => 'reunionSource' in d && d.reunionSource === m.id,
  );
  expect(linked).toMatchObject({ categorie: 'proces-verbaux', nom: 'PV_CA_2026-09-15.pdf' });
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'Rouvrir le PV', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('PV rouvert');
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByText('PV_CA_2026-09-15.pdf', { exact: true })).toHaveCount(0);
  expect(
    (await workspace.store.list('documents')).find(
      (d) => 'reunionSource' in d && d.reunionSource === m.id,
    ),
  ).toBeUndefined();
});
test('14 · une note « à affiner » génère une action, qui la ramène à Normal une fois terminée', async ({
  page,
  workspace,
}) => {
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle note' });
  await dialog.getByLabel('Titre', { exact: true }).fill('Revoir le barème CNAF');
  await dialog.getByLabel('Catégorie', { exact: true }).fill('Réglementation');
  await dialog.getByLabel('Niveau d’importance').selectOption('AFFINER');
  await dialog.getByLabel('Contenu').fill('À reformuler avec le trésorier.');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Note enregistrée');
  await expect(page.locator('.note-importance').first()).toHaveText('À affiner');
  await page.getByRole('dialog').getByRole('link', { name: 'Voir l’action liée' }).click();
  await expect(page).toHaveURL(/\/actions\?q=/);
  const row = page.locator('.list-card').filter({ hasText: 'Affiner la note' });
  await expect(row).toContainText('À faire');
  await row.click();
  await page.getByRole('dialog').getByLabel('Statut', { exact: true }).selectOption('TERMINE');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Enregistré');
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.note-importance').first()).toHaveText('Normal');
  await expect(page.getByRole('link', { name: 'Voir l’action liée' })).toHaveCount(0);
  const [note] = await workspace.store.list('notes');
  expect(note).toMatchObject({ importance: 'NORMAL', actionId: '' });
});
test('sécurité : origine étrangère et chemins arbitraires refusés', async ({ page, workspace }) => {
  const r = await page.request.post(workspace.url + '/api/sauvegardes', {
    headers: { Origin: 'https://hostile.example' },
  });
  expect(r.status()).toBe(403);
  expect((await page.request.get(workspace.url + '/api/reunions/..%5C..%5Csecret')).status()).toBe(
    400,
  );
});
