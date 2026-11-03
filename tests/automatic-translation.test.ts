import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.ts';
import { Store } from '../server/storage.ts';
import type { Clip } from '../shared/contracts.ts';
import { fixture } from './helpers.ts';
import { fakeProvider } from './provider-fixture.ts';

async function until(check: () => Promise<boolean>) {
  for (let n = 0; n < 250; n++) {
    if (await check()) return;
    await delay(20);
  }
  assert.fail('Automatic translation did not settle');
}

for (const source of ['en', 'de']) {
  test(`automatic ${source} upload queues only supported non-source languages, survives restart and never repeats provider writes`, async () => {
    const fake = await fakeProvider();
    fake.state.source = source;
    fake.state.ready = true;
    const dir = await mkdtemp(join(tmpdir(), 'audio-auto-'));
    const options = {
      dataDir: dir,
      detectorUrl: fake.origin,
      apiKey: 'test-key',
      providerUrl: fake.origin,
      localTestAssetOrigin: fake.origin,
      pollInterval: 20,
    };
    let app = await createApp(options);
    const id = randomUUID();
    const upload = {
      method: 'POST' as const,
      url: '/api/clips',
      headers: {
        host: 'localhost',
        'content-type': 'audio/wav',
        'x-submission-id': id,
        'x-clip-title': 'Automatic test',
        'x-auto-translate': 'true',
      },
      payload: fixture(),
    };
    const clip = async () =>
      (
        (await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })).json() as Clip[]
      ).find((c) => c.id === id)!;
    try {
      assert.equal((await app.inject(upload)).statusCode, 201);
      await until(
        async () =>
          (await clip()).translations?.every((j) => j.state === 'ready') === true &&
          Boolean((await clip()).translations?.length),
      );
      const expected = ['en', 'pt', 'zh'].filter((c) => c !== source);
      assert.deepEqual(
        (await clip()).translations!.map((j) => j.target),
        expected,
      );
      assert.equal((await clip()).automaticTranslation, true);
      assert.equal((await app.inject(upload)).statusCode, 200);
      await app.close();
      app = await createApp(options);
      await app.ready();
      await delay(100);
      assert.equal(fake.state.uploads, 1);
      assert.equal(fake.state.creates, expected.length);
      assert.deepEqual(
        (await clip()).translations!.map((j) => j.state),
        expected.map(() => 'ready'),
      );
      assert.equal(
        (
          await app.inject({
            ...upload,
            headers: { ...upload.headers, 'x-auto-translate': 'false' },
          })
        ).statusCode,
        409,
      );
    } finally {
      await app.close();
      await fake.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test('uncertain detection cannot submit before confirmation; confirmation automatically queues translations', async () => {
  const fake = await fakeProvider();
  fake.state.confirmationRequired = true;
  const dir = await mkdtemp(join(tmpdir(), 'audio-auto-confirm-'));
  const app = await createApp({
    dataDir: dir,
    detectorUrl: fake.origin,
    apiKey: 'test-key',
    providerUrl: fake.origin,
    pollInterval: 20,
  });
  const id = randomUUID(),
    headers = { host: 'localhost' };
  const clip = async () =>
    ((await app.inject({ url: '/api/clips', headers })).json() as Clip[])[0]!;
  try {
    await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: {
        ...headers,
        'content-type': 'audio/wav',
        'x-submission-id': id,
        'x-clip-title': 'Confirm me',
        'x-auto-translate': 'true',
      },
      payload: fixture(),
    });
    await until(async () => (await clip()).status === 'needs_language');
    assert.equal(fake.state.uploads, 0);
    assert.equal(fake.state.creates, 0);
    assert.deepEqual((await clip()).translations, []);
    const result = await app.inject({
      method: 'PATCH',
      url: `/api/clips/${id}`,
      headers,
      payload: { sourceLanguage: 'en' },
    });
    assert.equal(result.statusCode, 200);
    await until(async () => fake.state.creates === 2);
    assert.equal(fake.state.uploads, 1);
    assert.deepEqual(
      (await clip()).translations!.map((j) => j.target),
      ['pt', 'zh'],
    );
  } finally {
    await app.close();
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('no key preserves automatic intent and original audio; later configured restart repairs the unqueued intent', async () => {
  const fake = await fakeProvider();
  const dir = await mkdtemp(join(tmpdir(), 'audio-auto-repair-'));
  const id = randomUUID();
  let app = await createApp({ dataDir: dir, detectorUrl: fake.origin });
  try {
    await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: {
        host: 'localhost',
        'content-type': 'audio/wav',
        'x-submission-id': id,
        'x-clip-title': 'No key',
        'x-auto-translate': 'true',
      },
      payload: fixture(),
    });
    await until(
      async () =>
        (
          (await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })).json() as Clip[]
        )[0]?.status === 'ready',
    );
    assert.equal(fake.state.uploads, 0);
    assert.equal(
      (await app.inject({ url: `/api/clips/${id}/audio`, headers: { host: 'localhost' } }))
        .statusCode,
      200,
    );
    await app.close();
    const store = new Store(dir);
    store.add('legacy', 'Never opted in', 'hash', 3);
    store.confirm('legacy', 'en');
    store.close();
    app = await createApp({
      dataDir: dir,
      detectorUrl: fake.origin,
      apiKey: 'test-key',
      providerUrl: fake.origin,
      pollInterval: 20,
    });
    await app.ready();
    await until(async () => fake.state.creates === 2);
    const clips = (
      await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })
    ).json() as Clip[];
    assert.deepEqual(clips.find((c) => c.id === 'legacy')!.translations, []);
    assert.equal(fake.state.uploads, 1);
  } finally {
    await app.close();
    await fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});
