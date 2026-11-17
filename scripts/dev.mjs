import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const api = fileURLToPath(new URL('../server/index.mjs', import.meta.url));
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', api], { stdio: 'inherit' }),
  spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', process.env.VITE_PORT || '5173', '--strictPort'], { stdio: 'inherit' }),
];
for (const child of children) child.on('exit', code => { if (code) process.exitCode = code; });
process.on('SIGINT', () => { for (const child of children) child.kill('SIGINT'); });
process.on('SIGTERM', () => { for (const child of children) child.kill('SIGTERM'); });
