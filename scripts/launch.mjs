import fs from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.local');
const url = 'http://127.0.0.1:4317';
const lock = path.join(local, 'launch.lock');
const marker = path.join(local, 'build.sha256');
const pidFile = path.join(local, 'server.pid');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function health() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    const result = await response.json();
    if (response.ok && result.application === 'filoustics-secretariat' && result.status === 'ok')
      return true;
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
  }
  throw new Error(
    'Le port 4317 est occupé par un service non reconnu ou qui ne répond pas. Fermez l’ancienne instance de Filoustics puis réessayez.',
  );
}
async function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  const edge = path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Microsoft',
    'Edge',
    'Application',
    'msedge.exe',
  );
  await fs.access(edge);
  const child = spawn(edge, [url], { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
}
async function npm(args) {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  await fs.access(cli);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} a échoué (code ${code}).`)),
    );
  });
}
async function fingerprint() {
  const hash = createHash('sha256');
  async function scan(relative) {
    const file = path.join(root, relative);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error(`Lien inattendu dans le code : ${relative}`);
    if (stat.isDirectory())
      for (const entry of (await fs.readdir(file)).sort()) await scan(path.join(relative, entry));
    else {
      hash.update(relative);
      hash.update(await fs.readFile(file));
    }
  }
  for (const file of [
    'src',
    'server',
    'public',
    'package.json',
    'package-lock.json',
    'index.html',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.server.json',
  ])
    await scan(file);
  return hash.digest('hex');
}
async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
async function dependenciesReady() {
  try {
    const expected = JSON.parse(
      await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'),
    ).packages;
    const installed = JSON.parse(
      await fs.readFile(path.join(root, 'node_modules', '.package-lock.json'), 'utf8'),
    ).packages;
    return Object.entries(expected).every(
      ([name, info]) => !name || info.optional || installed[name]?.version === info.version,
    );
  } catch {
    return false;
  }
}
// Asks the running instance to stop through its own shutdown route — this runs its
// normal cleanup (closing the shared PDF browser) from inside that process, which a
// cross-process kill signal cannot reliably trigger on Windows. Falls back to a hard
// stop only if the instance does not actually go away.
async function stopRunningServer() {
  try {
    await fetch(`${url}/api/arreter`, { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch {
    /* The instance may already be gone, or briefly unresponsive; the poll below decides. */
  }
  // A process actively shutting down can make a request fail in ways health() doesn't
  // recognize (reset mid-response, timeout) as well as the plain "port closed" it does;
  // either is expected here, so keep waiting instead of treating it as fatal.
  const confirmedDown = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!(await health().catch(() => true))) return true;
      await sleep(300);
    }
    return false;
  };
  if (await confirmedDown()) return;
  const pid = Number(await fs.readFile(pidFile, 'utf8').catch(() => ''));
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  if (await confirmedDown()) return;
  throw new Error('Impossible d’arrêter l’instance précédente de Filoustics.');
}
async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 13))
    throw new Error('Node.js 24.13 ou ultérieur est nécessaire.');
  if (process.argv.includes('--check')) {
    console.log((await health()) ? 'Filoustics est disponible.' : 'Filoustics est arrêté.');
    return;
  }
  await fs.mkdir(local, { recursive: true });
  // Computed once and reused: cheap (a source-tree hash), but still only worth doing
  // when we might actually skip work because of it.
  const digest = await fingerprint();
  const fresh = async () =>
    (await exists(path.join(root, 'dist', 'index.html'))) &&
    (await exists(path.join(root, 'dist-server', 'server', 'index.js'))) &&
    (await fs.readFile(marker, 'utf8').catch(() => '')) === digest;
  if (await health()) {
    if (await fresh()) {
      await openBrowser();
      return;
    }
    console.log('Le code a changé depuis le dernier démarrage : reconstruction et redémarrage…');
  }
  let owned = false;
  try {
    for (let attempt = 0; attempt < 180; attempt++) {
      try {
        const handle = await fs.open(lock, 'wx');
        owned = true;
        try {
          await handle.writeFile(String(process.pid));
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if ((await health()) && (await fresh())) {
          await openBrowser();
          return;
        }
        const owner = Number(await fs.readFile(lock, 'utf8').catch(() => ''));
        if (Number.isInteger(owner) && owner > 0) {
          try {
            process.kill(owner, 0);
          } catch (check) {
            if (check.code === 'ESRCH')
              await fs.unlink(lock).catch((e) => {
                if (e.code !== 'ENOENT') throw e;
              });
          }
        } else if (Date.now() - (await fs.stat(lock)).mtimeMs > 30_000) await fs.unlink(lock);
        await sleep(1000);
      }
    }
    if (!owned)
      throw new Error('Un démarrage est déjà en cours. Réessayez dans quelques instants.');
    if (await health()) {
      if (await fresh()) {
        await openBrowser();
        return;
      }
      await stopRunningServer();
    }
    if (!(await dependenciesReady())) await npm(['ci']);
    if (!(await fresh())) {
      console.log('Préparation de l’application…');
      await npm(['run', 'build']);
      await fs.writeFile(marker, digest);
    }
    const log = path.join(local, 'demarrage.log');
    const fd = openSync(log, 'a');
    let child;
    try {
      child = spawn(process.execPath, ['dist-server/server/index.js'], {
        cwd: root,
        env: {
          ...process.env,
          PORT: '4317',
          NO_OPEN: '1',
          APP_CONFIG_DIR: local,
          APP_WORKSPACE: '',
        },
        detached: true,
        stdio: ['ignore', fd, fd],
        windowsHide: true,
      });
    } finally {
      closeSync(fd);
    }
    let failure;
    child.once('error', (error) => {
      failure = error;
    });
    child.unref();
    if (child.pid) await fs.writeFile(pidFile, String(child.pid));
    for (let attempt = 0; attempt < 60; attempt++) {
      if (failure) throw failure;
      if (await health()) {
        console.log(`Filoustics : ${url}`);
        await openBrowser();
        return;
      }
      if (child.exitCode !== null) throw new Error(`Le serveur n’a pas démarré. Consultez ${log}`);
      await sleep(500);
    }
    throw new Error(`Le démarrage prend trop de temps. Consultez ${log}`);
  } finally {
    if (owned) await fs.unlink(lock).catch(() => {});
  }
}
main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
});
