import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import express from 'express';
import { createApp } from './app.js';
import { closeBrowser } from './services/pdf-branding.js';
const port = Number(process.env.PORT || 4317),
  dev = process.argv.includes('--dev');
const app = await createApp({
  port,
  configDir: path.resolve(process.env.APP_CONFIG_DIR || '.local'),
  workspace: process.env.APP_WORKSPACE,
});
if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, host: '127.0.0.1', hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const dist = path.resolve('dist');
  await fs.access(path.join(dist, 'index.html'));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
const server = app.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Filoustics : ${url}`);
  if (!dev && process.env.NO_OPEN !== '1' && process.platform === 'win32') {
    const edge = path.join(
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    );
    const child = spawn(edge, [url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`Ouvrez Microsoft Edge à l’adresse ${url}`));
    child.unref();
  }
});
server.on('error', (e) => {
  console.error('Impossible de démarrer le serveur local :', e.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void closeBrowser().finally(() => process.exit(0)));
