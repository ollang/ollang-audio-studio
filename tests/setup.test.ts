import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('setup creates private configuration, preserves existing keys and reports the configured Docker port without secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-setup-'));
  const environment = { ...process.env };
  // Do not let the caller's unrelated configuration change this isolated fixture.
  for (const key of ['APP_PORT', 'OLLANG_API_KEY']) delete environment[key];
  try {
    await mkdir(join(root, 'scripts'));
    await copyFile('scripts/setup.mjs', join(root, 'scripts/setup.mjs'));
    await copyFile('.env.example', join(root, '.env.example'));
    const run = () =>
      execute(process.execPath, ['scripts/setup.mjs'], { cwd: root, env: environment });
    const first = await run();
    assert.equal(
      await readFile(join(root, '.env'), 'utf8'),
      await readFile('.env.example', 'utf8'),
    );
    if (process.platform !== 'win32')
      assert.equal((await stat(join(root, '.env'))).mode & 0o777, 0o600);
    assert.match(first.stdout, /https:\/\/developers\.ollang\.com/);
    assert.match(first.stdout, /http:\/\/localhost:4310/);
    assert.match(first.stdout, /automatically/);
    const privateValue = 'fixture-key-must-stay-private';
    const existing = `OLLANG_API_KEY=${privateValue}\nAPP_PORT=4327\n`;
    await writeFile(join(root, '.env'), existing);
    const second = await run();
    assert.equal(await readFile(join(root, '.env'), 'utf8'), existing);
    assert.match(second.stdout, /existing .env was preserved/);
    assert.match(second.stdout, /http:\/\/localhost:4327/);
    assert.equal((second.stdout + second.stderr).includes(privateValue), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
