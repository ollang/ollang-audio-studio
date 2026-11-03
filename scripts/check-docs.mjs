import { access, readFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicDocs } from './lib/repository.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pending = new Set();
const failures = [];
for (const file of publicDocs) {
  const text = await readFile(resolve(root, file), 'utf8');
  for (const match of text.matchAll(/TODO\(([A-Z0-9_]+)\)/g)) pending.add(match[1]);
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1];
    if (link.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(link)) continue;
    const path = resolve(root, dirname(file), decodeURIComponent(link.split('#')[0]));
    if (relative(root, path).startsWith('..')) {
      failures.push(`${file}: link leaves the repository`);
      continue;
    }
    try {
      await access(path);
    } catch {
      failures.push(`${file}: missing ${link}`);
    }
  }
}
if (process.argv.includes('--release')) {
  if (pending.size) failures.push(`Unfilled maintainer inputs: ${[...pending].sort().join(', ')}`);
  try {
    await access(resolve(root, 'LICENSE'));
  } catch {
    failures.push('A maintainer-approved LICENSE is required before public release.');
  }
}
if (failures.length) {
  failures.forEach((message) => console.error(message));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${publicDocs.length} public documents; local links resolve. ${pending.size} maintainer inputs remain.`,
  );
