import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, 'demo-data');

const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const child = spawn(process.execPath, [tsxCli, 'server/index.ts', '--dev'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, APP_WORKSPACE: workspace },
});
child.on('exit', (code) => process.exit(code ?? 0));
