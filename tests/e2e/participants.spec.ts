import { test, expect } from './fixtures';
import { pdfText } from './pdf-text';
import { atomicJson } from '../../server/services/storage';
import { meetingSchema } from '../../src/domain/models';
test('membres, ajout groupé, enfants, réunion en ligne et votes bornés', async ({
  page,
  workspace,
}) => {
  test.setTimeout(60_000);
  for (const [index, member] of workspace.seeded.members.entries())
    await workspace.store.saveRecord('membres', {
      ...member,
      prenomEnfant: ['Milo', 'Noa', 'Lina', 'Zoé', 'Iris'][index],
      actif: index < 4,
    });
  await page.goto(workspace.url + '/membres');
  await expect(page.locator('.member-counts')).toHaveText('4 actifs · 1 inactif');
  await page
    .locator('.member-card')
    .filter({ hasText: 'Léa Martin' })
    .getByRole('button', { name: 'Modifier le membre' })
    .click();
  await expect(page.getByRole('dialog').getByLabel('Fonction')).toHaveValue('Présidente');
  await expect(page.getByRole('option', { name: 'Vice-trésorière', exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  const id = workspace.seeded.meetings[0].id;
  await page.goto(`${workspace.url}/reunions/${id}`);
  await page.getByLabel('Choix du lieu').selectOption('ligne');
  await expect(page.getByLabel('Autre lieu', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Convocation', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Sarah Robert (Zoé)', exact: true })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'Ajouter tous les membres actifs' }).click();
  await expect(page.locator('.participant')).toHaveCount(4);
  await expect(
    page.getByRole('button', { name: 'Ajouter tous les membres actifs' }),
  ).toBeDisabled();
  await expect(page.locator('.participant select')).toHaveCount(0);
  await expect(page.locator('.participant').filter({ hasText: 'Thomas Dubois' })).toHaveCount(0);
  await expect(page).toHaveScreenshot('convocation-participants.png');
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir PDF', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const convocation = await page.request.get(`${workspace.url}/api/reunions/${id}/pdf/convocation`);
  const text = await pdfText(await convocation.body());
  for (const child of ['Milo', 'Noa', 'Lina', 'Zoé']) expect(text).toContain(child);
  for (const parent of workspace.seeded.members) expect(text).not.toContain(parent.nomComplet);
  expect(text).toContain('En ligne');
  expect(text).not.toContain('Le bureau');
  expect(text).not.toContain('Présents :');
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByLabel('Présence de Hugo Petit').selectOption('ABSENT');
  await page.getByLabel('Présence de Sarah Robert').selectOption('PROCURATION');
  await page.getByLabel('Mandataire').selectOption(workspace.seeded.members[0].id);
  await expect(
    page.getByText('3 voix disponibles : membres présents et procurations.'),
  ).toBeVisible();
  const heading = await page
    .getByRole('heading', { name: 'Présences & procurations' })
    .boundingBox();
  const select = await page.getByLabel('Ajouter un participant').boundingBox();
  expect(select!.y - heading!.y - heading!.height).toBeGreaterThanOrEqual(10);
  await page.getByLabel('Consigner un vote').first().check();
  await page.getByLabel('Pour', { exact: true }).fill('2');
  await page.getByLabel('Contre', { exact: true }).fill('5');
  await expect(page.getByLabel('Contre', { exact: true })).toHaveValue('1');
  await page.getByLabel('Abstention', { exact: true }).fill('1');
  await expect(page.getByLabel('Abstention', { exact: true })).toHaveValue('0');
  await page.getByLabel('Présence de Camille Bernard').selectOption('ABSENT');
  await expect(page.getByRole('alert')).toContainText('ne peut pas dépasser 2 voix');
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await page.getByLabel('Pour', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  const open = page.getByRole('link', { name: 'Ouvrir le PV PDF' });
  await expect(open).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.document-toolbar')).toContainText('Ouvrir le PV PDF');
  const generateBox = await page
    .getByRole('button', { name: 'Générer PDF', exact: true })
    .boundingBox();
  const openBox = await open.boundingBox();
  expect(Math.abs(openBox!.y - generateBox!.y)).toBeLessThan(4);
  const generated = await page.request.get(`${workspace.url}/api/reunions/${id}/pdf/pv`);
  const pv = await pdfText(await generated.body());
  expect(pv).toContain('Milo');
  expect(pv).toContain('Zoé');
  expect(pv).not.toContain('Présidence');
  expect(pv).not.toContain('Secrétariat');
  const saved = await workspace.store.meeting(id);
  expect(saved.participants).toHaveLength(4);
  expect(saved.ordreDuJour[0].vote).toEqual({ pour: 1, contre: 1, abstention: 0 });
});

test('API : impossible d’enregistrer ou de générer un PV avec trop de votes', async ({
  page,
  workspace,
}) => {
  const meeting = await workspace.store.meeting(workspace.seeded.meetings[0].id);
  meeting.ordreDuJour[0].vote = { pour: 3, contre: 1, abstention: 0 };
  const result = await page.request.put(`${workspace.url}/api/reunions/${meeting.id}`, {
    data: meeting,
  });
  expect(result.status()).toBe(400);
  expect((await workspace.store.meeting(meeting.id)).ordreDuJour[0].vote).toBeNull();
  await atomicJson(
    await workspace.store.safe(await workspace.store.meetingFile(meeting.id)),
    meeting,
    meetingSchema,
  );
  expect((await page.request.get(`${workspace.url}/api/reunions/${meeting.id}`)).status()).toBe(
    200,
  );
  expect((await page.request.post(`${workspace.url}/api/reunions/${meeting.id}/pv`)).status()).toBe(
    400,
  );
  expect(
    (await page.request.post(`${workspace.url}/api/reunions/${meeting.id}/valider`)).status(),
  ).toBe(400);
});
