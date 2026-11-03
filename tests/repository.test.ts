import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { isPrivateFile } from '../scripts/lib/repository.mjs';

const execute = promisify(execFile);
test('public export includes its guides/CI and excludes credentials, databases and historical QA', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'studio-export-'));
  const destination = join(temporary, 'source');
  try {
    await execute(process.execPath, ['scripts/export.mjs', destination]);
    for (const file of [
      'README.md',
      'LICENSE',
      'MEDIA_NOTICE.md',
      'AGENTS.md',
      'CLAUDE.md',
      '.github/copilot-instructions.md',
      'docs/usage.md',
      'docs/agent-runbook.md',
      'docs/ollang.md',
      'docs/integration.md',
      'examples/README.md',
      'examples/translate-clip.mjs',
      '.github/workflows/ci.yml',
      'scripts/check-docs.mjs',
      'scripts/build-showcase.ts',
      'fixtures/showcase.json',
      'src/showcase.ts',
      'public/samples/conversations/03-chinese/dub-english.wav',
    ])
      await access(join(destination, file));
    for (const file of [
      '.env',
      '.data',
      'node_modules',
      'docs/qa',
      'docs/status.md',
      'src/samples.ts',
      'fixtures/samples.json',
      'fixtures/captions.json',
      'public/samples/en.wav',
      'public/samples/es.wav',
      'public/samples/fr.wav',
      'scripts/generate-samples.py',
    ])
      await assert.rejects(access(join(destination, file)));
    assert.match(await readFile(join(destination, 'README.md'), 'utf8'), /docker compose up/);
    await assert.rejects(execute(process.execPath, ['scripts/export.mjs', destination]));
    await execute(process.execPath, ['scripts/check-docs.mjs'], { cwd: destination });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
test('private files are excluded at any nesting depth', () => {
  for (const name of [
    '.env',
    '.env.local',
    '.data',
    'secrets.key',
    'local.sqlite-wal',
    'preview.tmp',
    '__pycache__',
  ])
    assert.equal(isPrivateFile(name), true);
  for (const name of ['.env.example', 'en.json', 'short.wav'])
    assert.equal(isPrivateFile(name), false);
});

test('the CLI example explains itself and refuses a translation without explicit submission', async () => {
  const help = await execute(process.execPath, ['examples/translate-clip.mjs', '--help']);
  assert.match(help.stdout, /--submit/);
  await assert.rejects(
    execute(process.execPath, [
      'examples/translate-clip.mjs',
      '--clip',
      '00000000-0000-4000-8000-000000000000',
      '--target',
      'pt',
    ]),
    (error) => error instanceof Error && error.message.includes('explicit --submit'),
  );
});
