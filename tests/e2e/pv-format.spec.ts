import { test, expect } from './fixtures';
import fs from 'node:fs/promises';

test('PV : la barre d’outils met en forme le texte et se retrouve dans le PDF généré', async ({
  page,
  workspace,
}) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();

  const discussionArea = page.getByLabel('Résumé des échanges', { exact: true }).first();
  const discussionToolbar = discussionArea.locator(
    'xpath=ancestor::div[contains(concat(" ", @class, " "), " rich-textarea ")][1]',
  );
  await discussionArea.fill('Point important à discuter');
  await discussionArea.evaluate((el: HTMLTextAreaElement) => {
    el.selectionStart = 0;
    el.selectionEnd = 5;
  });
  await discussionToolbar.getByRole('button', { name: 'Gras' }).click();
  await expect(discussionArea).toHaveValue('**Point** important à discuter');

  await discussionArea.evaluate((el: HTMLTextAreaElement) => {
    const start = el.value.indexOf('important');
    el.selectionStart = start;
    el.selectionEnd = start + 'important'.length;
  });
  await discussionToolbar.getByRole('button', { name: 'Surligné' }).click();
  await expect(discussionArea).toHaveValue('**Point** ==important== à discuter');

  const decisionArea = page.getByLabel('Décision', { exact: true }).first();
  const decisionToolbar = decisionArea.locator(
    'xpath=ancestor::div[contains(concat(" ", @class, " "), " rich-textarea ")][1]',
  );
  await decisionArea.fill('Contacter la mairie\nRelancer la CAF');
  await decisionArea.evaluate((el: HTMLTextAreaElement) => {
    el.selectionStart = 0;
    el.selectionEnd = el.value.length;
  });
  await decisionToolbar.getByRole('button', { name: 'Liste à puces' }).click();
  await expect(decisionArea).toHaveValue('- Contacter la mairie\n- Relancer la CAF');

  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  await expect(page.getByRole('status')).toHaveText('Enregistré');
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le PV PDF', exact: true })).toBeVisible();

  const file = await workspace.store.safe(
    `${await workspace.store.meetingDir(m.id)}/PV_CA_2026-09-15.pdf`,
  );
  const html = await fs.readFile(file.replace('.pdf', '.html'), 'utf8');
  expect(html).toContain('<strong>Point</strong> <mark>important</mark> à discuter');
  expect(html).toContain('<ul><li>Contacter la mairie</li><li>Relancer la CAF</li></ul>');

  const pdfBytes = await fs.readFile(file);
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
});

test('PV : un ancien texte brut sans mise en forme reste affiché tel quel', async ({
  page,
  workspace,
}) => {
  const m = workspace.seeded.meetings[0];
  const meeting = await workspace.store.meeting(m.id);
  meeting.ordreDuJour[0].discussion = 'Texte simple.\nDeuxième ligne, sans rien de spécial.';
  await workspace.store.saveMeeting(meeting);

  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le PV PDF', exact: true })).toBeVisible();

  const file = await workspace.store.safe(
    `${await workspace.store.meetingDir(m.id)}/PV_CA_2026-09-15.pdf`,
  );
  const html = await fs.readFile(file.replace('.pdf', '.html'), 'utf8');
  expect(html).toContain('Texte simple.<br>Deuxième ligne, sans rien de spécial.');
});

test('PV : les titres # à ### et les puces « * » sont reconnus comme en Markdown', async ({
  page,
  workspace,
}) => {
  const m = workspace.seeded.meetings[0];
  await page.goto(workspace.url + '/reunions/' + m.id);
  await page.getByRole('button', { name: 'PV', exact: true }).click();

  const discussionArea = page.getByLabel('Résumé des échanges', { exact: true }).first();
  await discussionArea.fill('## Point budgétaire\n* Premier axe\n* Deuxième axe');

  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  await expect(page.getByRole('status')).toHaveText('Enregistré');
  await page.getByRole('button', { name: 'Générer PDF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ouvrir le PV PDF', exact: true })).toBeVisible();

  const file = await workspace.store.safe(
    `${await workspace.store.meetingDir(m.id)}/PV_CA_2026-09-15.pdf`,
  );
  const html = await fs.readFile(file.replace('.pdf', '.html'), 'utf8');
  expect(html).toContain('<h2>Point budgétaire</h2>');
  expect(html).toContain('<ul><li>Premier axe</li><li>Deuxième axe</li></ul>');
});
