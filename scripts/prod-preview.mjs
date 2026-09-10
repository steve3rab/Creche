import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(process.execPath, ['dist-server/server/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: '4317', NO_OPEN: '1', APP_CONFIG_DIR: path.join(root, '.local') },
});
child.on('exit', (code) => process.exit(code ?? 0));
