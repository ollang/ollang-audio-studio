import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.ts';
import { fixture } from './helpers.ts';

test('upload, local detection, idempotency, safe media ranges, secret redaction and origins', async () => {
  let calls = 0;
  const detector = createServer((req, res) => {
    if (req.url === '/health') {
      res.end(JSON.stringify({ status: 'ready' }));
      return;
    }
    calls++;
    req.resume();
    req.on('end', () => {
      res.end(
        JSON.stringify({
          language: 'en',
          confidence: 0.98,
          duration: 3,
          confirmationRequired: false,
          reason: 'detected',
        }),
      );
    });
  });
  await new Promise<void>((resolve) => detector.listen(0, '127.0.0.1', resolve));
  const address = detector.address() as { port: number };
  const dir = await mkdtemp(join(tmpdir(), 'audio-api-'));
  const app = await createApp({
    dataDir: dir,
    detectorUrl: `http://127.0.0.1:${address.port}`,
    apiKey: 'secret-must-never-leak',
  });
  const headers = {
    host: 'localhost:4310',
    'content-type': 'audio/wav',
    'x-submission-id': randomUUID(),
    'x-clip-title': 'Test%20audio',
  };
  try {
    const config = await app.inject({ url: '/api/config', headers: { host: 'localhost' } });
    assert.deepEqual(Object.keys(config.json()).sort(), [
      'apiKeyConfigured',
      'detector',
      'liveTranslationEnabled',
      'model',
    ]);
    assert.equal(config.json().apiKeyConfigured, true);
    assert.equal(config.json().liveTranslationEnabled, true);
    assert.equal(config.body.includes('secret-must-never-leak'), false);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { ...headers, origin: 'https://evil.example' },
      payload: fixture(),
    });
    assert.equal(denied.statusCode, 403);
    const [first, concurrent] = await Promise.all(
      [0, 1].map(() =>
        app.inject({ method: 'POST', url: '/api/clips', headers, payload: fixture() }),
      ),
    );
    assert.ok(first);
    assert.ok(concurrent);
    assert.equal(first.statusCode, 201);
    assert.ok([200, 409].includes(concurrent.statusCode));
    const id = first.json().id as string;
    for (let i = 0; i < 50; i++) {
      const clips = (
        await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })
      ).json();
      if (clips[0].status === 'ready') break;
      await delay(20);
    }
    const retry = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers,
      payload: fixture(),
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().sourceLanguage, 'en');
    assert.equal(calls, 1);
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers,
      payload: fixture(3, 0.5),
    });
    assert.equal(conflict.statusCode, 409);
    const missingSeries = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { ...headers, 'x-submission-id': randomUUID(), 'x-series-id': randomUUID() },
      payload: fixture(),
    });
    assert.equal(missingSeries.statusCode, 404);
    const appended = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { ...headers, 'x-submission-id': randomUUID(), 'x-series-id': id },
      payload: fixture(),
    });
    assert.equal(appended.statusCode, 201);
    assert.equal(appended.json().seriesId, id);
    assert.equal(appended.json().position, 2);
    const wrongSeriesRetry = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { ...headers, 'x-series-id': 'showcase' },
      payload: fixture(),
    });
    assert.equal(wrongSeriesRetry.statusCode, 409);
    const showcaseContinuation = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { ...headers, 'x-submission-id': randomUUID(), 'x-series-id': 'showcase' },
      payload: fixture(),
    });
    assert.equal(showcaseContinuation.statusCode, 201);
    assert.equal(showcaseContinuation.json().seriesId, 'showcase');
    const audio = await app.inject({
      url: `/api/clips/${id}/audio`,
      headers: { host: 'localhost', range: 'bytes=44-143' },
    });
    assert.equal(audio.statusCode, 206);
    assert.equal(audio.rawPayload.length, 100);
    const correction = await app.inject({
      method: 'PATCH',
      url: `/api/clips/${id}`,
      headers: { host: 'localhost' },
      payload: { sourceLanguage: 'pt' },
    });
    assert.equal(correction.json().sourceLanguage, 'pt');
    const forged = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: { ...headers, 'x-submission-id': randomUUID() },
      payload: Buffer.from('bad'),
    });
    assert.equal(forged.statusCode, 422);
    const unknown = await app.inject({
      url: '/api/clips/../../.env/audio',
      headers: { host: 'localhost' },
    });
    assert.equal(unknown.statusCode, 404);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => detector.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('unavailable detector leaves a recoverable local clip and accepts manual correction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'audio-unavailable-'));
  const app = await createApp({ dataDir: dir, detectorUrl: 'http://127.0.0.1:1' });
  try {
    const config = await app.inject({ url: '/api/config', headers: { host: 'localhost' } });
    assert.equal(config.json().apiKeyConfigured, false);
    assert.equal(config.json().liveTranslationEnabled, false);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/clips',
      headers: {
        host: 'localhost',
        'content-type': 'audio/wav',
        'x-submission-id': randomUUID(),
        'x-clip-title': 'Offline',
      },
      payload: fixture(),
    });
    const id = upload.json().id as string;
    await delay(50);
    const clips = (await app.inject({ url: '/api/clips', headers: { host: 'localhost' } })).json();
    assert.equal(clips[0].notice, 'detector_unavailable');
    assert.equal(clips[0].confirmationRequired, true);
    const correction = await app.inject({
      method: 'PATCH',
      url: `/api/clips/${id}`,
      headers: { host: 'localhost' },
      payload: { sourceLanguage: 'zh' },
    });
    assert.equal(correction.json().status, 'ready');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
