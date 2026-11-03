import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.ts';
import { fixture } from './helpers.ts';

test('retry after a partial local save recovers exact audio and retains committed idempotency', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'audio-torn-save-'));
  const media = join(dataDir, 'media');
  await mkdir(media);
  const id = randomUUID(),
    bytes = fixture();
  await writeFile(join(media, `${id}.wav`), bytes.subarray(0, 100));
  // A staging file left by a stopped process must never become playable audio.
  await writeFile(join(media, `${id}.wav.old.tmp`), bytes.subarray(0, 20));
  const options = { dataDir, detectorUrl: 'http://127.0.0.1:1' };
  let app = await createApp(options);
  const request = {
    method: 'POST' as const,
    url: '/api/clips',
    headers: {
      host: 'localhost',
      'content-type': 'audio/wav',
      'x-submission-id': id,
      'x-clip-title': 'Recovered save',
    },
    payload: bytes,
  };
  try {
    assert.equal((await app.inject(request)).statusCode, 201);
    await app.close();
    app = await createApp(options);
    assert.equal((await app.inject(request)).statusCode, 200);
    assert.deepEqual(await readFile(join(media, `${id}.wav`)), bytes);
    const changed = Buffer.from(bytes);
    changed[100] = changed[100]! ^ 1;
    assert.equal((await app.inject({ ...request, payload: changed })).statusCode, 409);
    assert.deepEqual(await readFile(join(media, `${id}.wav`)), bytes);
    assert.equal(
      (await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })).json().length,
      1,
    );
    assert.deepEqual((await readdir(media)).sort(), [`${id}.wav`, `${id}.wav.old.tmp`].sort());
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a complete uncommitted WAV is recovered only by matching submission bytes', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'audio-orphan-save-'));
  const media = join(dataDir, 'media');
  await mkdir(media);
  const bytes = fixture(),
    id = randomUUID();
  await writeFile(join(media, `${id}.wav`), bytes);
  const app = await createApp({ dataDir, detectorUrl: 'http://127.0.0.1:1' });
  const request = {
    method: 'POST' as const,
    url: '/api/clips',
    headers: {
      host: 'localhost',
      'content-type': 'audio/wav',
      'x-submission-id': id,
      'x-clip-title': 'Orphan recovery',
    },
    payload: bytes,
  };
  try {
    const changed = Buffer.from(bytes);
    changed[100] = changed[100]! ^ 1;
    assert.equal((await app.inject({ ...request, payload: changed })).statusCode, 409);
    assert.deepEqual(await readFile(join(media, `${id}.wav`)), bytes);
    assert.equal(
      (await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })).json().length,
      0,
    );
    assert.equal((await app.inject(request)).statusCode, 201);
    assert.deepEqual(await readFile(join(media, `${id}.wav`)), bytes);
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
