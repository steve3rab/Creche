import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { Storage } from '../server/services/storage';
import { configSchema } from '../src/domain/models';

// Binds an ephemeral port so parallel test files/workers never collide, unlike the
// fixed port the Playwright e2e suite uses under its single-worker constraint.
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

let dir: string, port: number, server: Server, base: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'filoustics-app-'));
  const store = new Storage(path.join(dir, 'data'));
  await store.init(configSchema.parse({ schemaVersion: 1, association: 'Association test' }));
  port = await freePort();
  const app = await createApp({
    port,
    configDir: path.join(dir, 'config'),
    workspace: store.root,
  });
  server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
    s.once('error', reject);
  });
  base = `http://127.0.0.1:${port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(dir, { recursive: true, force: true });
});

describe('Serveur Express réel : garde-fous réseau', () => {
  it('répond en bonne santé et refuse un en-tête Host inattendu', async () => {
    const health = await fetch(base + '/api/health');
    expect(health.ok).toBe(true);
    expect(await health.json()).toMatchObject({ status: 'ok' });

    // fetch() forbids overriding the Host header, so exercise the guard through
    // Node's low-level http client, the way a non-browser client would try to.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/health', headers: { Host: 'evil.example' } },
        (res) => resolve(res.statusCode || 0),
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});

describe('Sauvegarde hors-site en .zip', () => {
  it('télécharge une sauvegarde existante et refuse une sauvegarde inconnue', async () => {
    await fetch(base + '/api/sauvegardes', { method: 'POST' });
    const list = (await (await fetch(base + '/api/sauvegardes')).json()) as { id: string }[];
    expect(list.length).toBeGreaterThan(0);

    const zip = await fetch(base + `/api/sauvegardes/${list[0].id}/export`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    expect(zip.headers.get('content-disposition')).toContain('.zip');
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K' — ZIP local-file-header signature
    expect(bytes.length).toBeGreaterThan(100);

    const missing = await fetch(base + '/api/sauvegardes/introuvable/export');
    expect(missing.status).toBe(404);
  });

  it('refuse un identifiant de sauvegarde mal formé', async () => {
    const res = await fetch(base + '/api/sauvegardes/..%2f..%2fetc/export');
    expect([400, 404]).toContain(res.status);
  });
});

describe('Planning et contacts : routes REST génériques', () => {
  it('crée, modifie, refuse un doublon et supprime un créneau de garde', async () => {
    const membreId = crypto.randomUUID();
    const create = await fetch(base + '/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        date: '2026-09-15',
        heureDebut: '08:00',
        heureFin: '12:00',
        membreId,
        membre: 'Léa Martin',
        notes: '',
      }),
    });
    expect(create.status).toBe(200);
    const shift = (await create.json()) as { id: string; updatedAt: string };

    const duplicate = await fetch(base + '/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: shift.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        date: '2026-09-16',
        heureDebut: '08:00',
        heureFin: '12:00',
        membreId,
        membre: 'Léa Martin',
        notes: '',
      }),
    });
    expect(duplicate.status).toBe(409);

    const invalid = await fetch(base + '/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        date: '2026-09-15',
        heureDebut: '12:00',
        heureFin: '08:00',
        membreId,
        membre: 'Léa Martin',
        notes: '',
      }),
    });
    expect(invalid.status).toBe(400);

    const update = await fetch(base + `/api/planning/${shift.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...shift, heureFin: '13:00' }),
    });
    expect(update.status).toBe(200);
    expect((await update.json()).heureFin).toBe('13:00');

    const list = (await (await fetch(base + '/api/planning')).json()) as unknown[];
    expect(list).toHaveLength(1);

    const remove = await fetch(base + `/api/planning/${shift.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    expect(remove.status).toBe(200);
    expect(await (await fetch(base + '/api/planning')).json()).toEqual([]);
  });

  it('crée, liste et supprime un contact, et refuse un contact sans nom', async () => {
    const missingName = await fetch(base + '/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nom: '',
      }),
    });
    expect(missingName.status).toBe(400);

    const create = await fetch(base + '/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nom: 'CAF de Paris',
        structure: 'CAF',
      }),
    });
    expect(create.status).toBe(200);
    const contact = (await create.json()) as { id: string };

    expect(await (await fetch(base + '/api/contacts')).json()).toHaveLength(1);
    const remove = await fetch(base + `/api/contacts/${contact.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    expect(remove.status).toBe(200);
    expect(await (await fetch(base + '/api/contacts')).json()).toEqual([]);
  });
});

describe('Réglage du rappel automatique', () => {
  it('applique la valeur par défaut puis persiste une valeur modifiée', async () => {
    const initial = (await (await fetch(base + '/api/config')).json()) as {
      rappelJours: number;
      association: string;
    };
    expect(initial.rappelJours).toBe(3);

    const saved = await fetch(base + '/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...initial, rappelJours: 7 }),
    });
    expect(saved.status).toBe(200);
    expect((await (await fetch(base + '/api/config')).json()).rappelJours).toBe(7);

    const outOfRange = await fetch(base + '/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...initial, rappelJours: 99 }),
    });
    expect(outOfRange.status).toBe(400);
  });
});
