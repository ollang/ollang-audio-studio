import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Use Node entry points directly: no shell interpolation or platform-specific npm executable.
const root = fileURLToPath(new URL('..', import.meta.url));
const children = [
  ['node_modules/tsx/dist/cli.mjs', 'watch', 'server/index.ts'],
  ['node_modules/vite/bin/vite.js'],
].map((args) => spawn(process.execPath, args, { cwd: root, stdio: 'inherit' }));
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
