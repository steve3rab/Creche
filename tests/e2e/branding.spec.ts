import { test, expect } from './fixtures';
import { pdfText } from './pdf-text';
import fs from 'node:fs/promises';
test('paramètres : logo unique, signature filtrée, sauvegarde et PDF', async ({
  page,
  workspace,
}) => {
  await page.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await expect(page.getByLabel('Secrétaire', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Président', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Signature HTML')).toHaveValue(/Crèche parentale/);
  const logo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 140;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e8efdf';
    context.fillRect(0, 0, 420, 140);
    context.fillStyle = '#405e44';
    context.font = 'bold 44px Arial';
    context.fillText('LES FILOUSTICS', 20, 85);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Logo de l’association', { exact: true }).setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(logo, 'base64'),
  });
  await expect(page.getByAltText('Logo de l’association')).toBeVisible();
  await page
    .getByLabel('Signature HTML')
    .fill(
      '<p><strong>Le secrétariat des Filoustics</strong><br><em>Ensemble pour nos enfants</em></p><script>alert(1)</script>',
    );
  await expect(page.locator('.signature-preview strong')).toHaveText(
    'Le secrétariat des Filoustics',
  );
  await expect(page.locator('.signature-preview script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  // Saving branding includes a real Edge image/layout validation, which may need a cold start.
  await expect(page.getByRole('status')).toHaveText('Paramètres enregistrés', { timeout: 30_000 });
  await page.reload();
  await expect(page.getByAltText('Logo de l’association')).toBeVisible();
  await expect(page.getByLabel('Signature HTML')).not.toHaveValue(/script/);
  await page.getByLabel('Signature HTML').scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot('parametres-signature.png');
  const id = workspace.seeded.meetings[0].id;
  const preview = await page.context().newPage();
  try {
    await preview.goto(`${workspace.url}/api/reunions/${id}/preview/pv`);
    await expect(preview.locator('img.logo')).toBeVisible();
    expect(
      await preview
        .locator('img.logo')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    ).toBe(true);
  } finally {
    await preview.close();
  }
  const result = await page.request.post(`${workspace.url}/api/reunions/${id}/pv`);
  expect(result.ok()).toBe(true);
  const generated = await result.json();
  const pdf = await page.request.get(workspace.url + generated.url);
  expect(await pdfText(await pdf.body())).toContain('Le secrétariat des Filoustics');
  expect(await pdfText(await pdf.body())).toContain('Page 1');
  const html = await fs.readFile(
    await workspace.store.safe(
      `${await workspace.store.meetingDir(id)}/${generated.name.replace('.pdf', '.html')}`,
    ),
    'utf8',
  );
  expect(html).toContain('<img class="logo"');
  expect(html).not.toContain('<div class="brand">');
  const config = await workspace.store.config();
  expect(config.signatureHtml).not.toContain('script');
  const [backup] = await workspace.store.backups();
  await workspace.store.saveConfig({ ...config, logoDataUrl: '', signatureHtml: '<p>Autre</p>' });
  await workspace.store.restore(backup.id);
  expect((await workspace.store.config()).logoDataUrl).toBe(config.logoDataUrl);
});

test('confirmations intégrées : annulation, Échap et reprise du brouillon', async ({
  page,
  workspace,
}) => {
  await page.goto(`${workspace.url}/reunions/${workspace.seeded.meetings[0].id}`);
  await page.getByLabel('Titre (facultatif)', { exact: true }).fill('Réunion modifiée');
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmer l’action' });
  await expect(dialog).toContainText('Quitter sans enregistrer');
  await expect(page).toHaveScreenshot('confirmation.png');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Titre (facultatif)', { exact: true })).toHaveValue('Réunion modifiée');
  await page.reload();
  await expect(dialog).toContainText('brouillon');
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByLabel('Titre (facultatif)', { exact: true })).toHaveValue('Réunion modifiée');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Enregistré');
  await page.reload();
  await expect(dialog).toHaveCount(0);
  expect((await workspace.store.meeting(workspace.seeded.meetings[0].id)).titre).toBe(
    'Réunion modifiée',
  );
});

test('API : logo interdit refusé sans modifier les paramètres', async ({ page, workspace }) => {
  const before = await workspace.store.config();
  const response = await page.request.put(workspace.url + '/api/config', {
    data: { ...before, logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
  });
  expect(response.status()).toBe(400);
  expect(await workspace.store.config()).toEqual(before);
  const malformed = await page.request.put(workspace.url + '/api/config', {
    headers: { 'Content-Type': 'application/json' },
    data: '{invalid',
  });
  expect(malformed.status()).toBe(400);
  const brokenPng = Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'),
    Buffer.alloc(40),
  ]).toString('base64');
  const broken = await page.request.put(workspace.url + '/api/config', {
    data: { ...before, logoDataUrl: 'data:image/png;base64,' + brokenPng },
  });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toContain('illisible');
  const tall = await page.request.put(workspace.url + '/api/config', {
    data: { ...before, signatureHtml: '<p>Signature' + '<br />'.repeat(60) + '</p>' },
  });
  expect(tall.status()).toBe(400);
  expect((await tall.json()).error).toContain('trop haute');
  expect(await workspace.store.config()).toEqual(before);
});
