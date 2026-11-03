import { cp, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportFiles, exportDirectories, isPrivateFile } from './lib/repository.mjs';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const input = process.argv[2];
if (!input) throw new Error('Usage: npm run export -- /path/to/a/new-directory');
// Resolve the parent as well: a symlink must not bypass the in-project guard.
const destination = join(await realpath(dirname(resolve(input))), basename(resolve(input)));
if (destination === root || destination.startsWith(`${root}/`))
  throw new Error('Export destination must be outside this project.');
await mkdir(destination); // Never overwrite an existing directory.
async function copy(relative) {
  if (isPrivateFile(basename(relative))) return;
  const source = join(root, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Export rejects symlinks: ${relative}`);
  if (info.isDirectory()) {
    await mkdir(join(destination, relative), { recursive: true });
    for (const child of (await readdir(source)).sort()) await copy(`${relative}/${child}`);
  } else {
    await mkdir(dirname(join(destination, relative)), { recursive: true });
    await cp(source, join(destination, relative), { errorOnExist: true, force: false });
  }
}
for (const path of [...exportFiles, ...exportDirectories]) await copy(path);
try {
  await copy('LICENSE');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log(
  `Exported standalone source to ${destination}. Private data and internal QA history were excluded.`,
);
