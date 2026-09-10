import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
test('premier démarrage compilé, dossier choisi, persistance et ressources locales', async ({
  page,
}) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'filoustics-start-')),
    workspace = path.join(dir, 'association');
  let child: ChildProcess | undefined;
  async function start() {
    child = spawn(process.execPath, ['dist-server/server/index.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: '4398',
        APP_CONFIG_DIR: path.join(dir, 'config'),
        APP_WORKSPACE: '',
        NO_OPEN: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Serveur non démarré')), 10000);
      child!.stdout!.on('data', (data) => {
        if (String(data).includes('Filoustics :')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child!.once('error', reject);
      child!.once('exit', (code) => {
        if (code) {
          clearTimeout(timer);
          reject(new Error('Échec de démarrage : ' + code));
        }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const stopped = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
      child.kill();
      await stopped;
    }
  }
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4398') && !r.url().startsWith('data:'))
      external.push(r.url());
  });
  try {
    await start();
    await page.goto('http://127.0.0.1:4398');
    await expect(page.getByRole('heading', { name: /Un peu d’ordre/ })).toBeVisible();
    await page.getByLabel('Nom de l’association', { exact: true }).fill('Association de test');
    await page.getByLabel('Répertoire de travail', { exact: true }).fill(workspace);
    await page.getByRole('button', { name: 'Ouvrir mon espace' }).click();
    await expect(page.getByRole('heading', { name: 'Bonjour, et bienvenue.' })).toBeVisible();
    expect(
      JSON.parse(await fs.readFile(path.join(workspace, 'membres.json'), 'utf8')).items,
    ).toEqual([]);
    await stop();
    await start();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bonjour, et bienvenue.' })).toBeVisible();
    await page.route('**/*', (route) =>
      route.request().url().startsWith('http://127.0.0.1:4398') ? route.continue() : route.abort(),
    );
    await page.getByRole('link', { name: 'Réunions', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Réunions', exact: true })).toBeVisible();
    expect(external).toEqual([]);
  } finally {
    await stop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
