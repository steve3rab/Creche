import { test as base, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { Storage } from '../../server/services/storage';
import { createApp } from '../../server/app';
import { seed } from '../../scripts/seed';
type Fixture = {
  workspace: { store: Storage; url: string; seeded: Awaited<ReturnType<typeof seed>> };
};
export const test = base.extend<Fixture>({
  workspace: async ({}, use) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'filoustics-e2e-')),
      store = new Storage(path.join(dir, 'data'));
    let server: Server | undefined;
    try {
      const seeded = await seed(store);
      const app = await createApp({
        port: 4399,
        configDir: path.join(dir, 'config'),
        workspace: store.root,
      });
      app.use(express.static(path.resolve('dist')));
      app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
      server = await new Promise<Server>((resolve, reject) => {
        const s = app.listen(4399, '127.0.0.1', () => resolve(s));
        s.once('error', reject);
      });
      await use({ store, url: 'http://127.0.0.1:4399', seeded });
    } finally {
      await new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      });
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  page: async ({ page, workspace }, use) => {
    const nativeDialogs: string[] = [];
    page.on('dialog', (dialog) => {
      nativeDialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await page.clock.setFixedTime(new Date('2026-09-07T12:00:00+02:00'));
    await page.goto(workspace.url);
    await expect(page.getByRole('heading', { name: 'Bonjour, Camille.' })).toBeVisible();
    try {
      await use(page);
      expect(nativeDialogs, 'Aucun dialogue JavaScript natif').toEqual([]);
    } finally {
      await page.close();
    }
  },
});
export { expect };
