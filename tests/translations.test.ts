import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.ts';
import { Store } from '../server/storage.ts';
import { TranslationStore } from '../server/translation-store.ts';
import { Provider } from '../server/provider.ts';
import { parseCaptions, publicAddress } from '../server/provider-assets.ts';
import type { Clip } from '../shared/contracts.ts';
import { fakeProvider } from './provider-fixture.ts';
import { fixture } from './helpers.ts';
import { validateWav } from '../server/wav.ts';
import { deliveredCaptions, rendition, type Track } from '../src/playback.ts';

const headers = { host: 'localhost' };
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 250; i++) {
    if (await check()) return;
    await delay(20);
  }
  assert.fail('State did not settle');
}
async function setup() {
  const fake = await fakeProvider();
  const dir = await mkdtemp(join(tmpdir(), 'audio-jobs-'));
  const options = {
    dataDir: dir,
    detectorUrl: fake.origin,
    apiKey: 'test-secret',
    providerUrl: fake.origin,
    localTestAssetOrigin: fake.origin,
    pollInterval: 20,
  };
  let app = await createApp(options);
  await app.ready();
  const id = randomUUID();
  await app.inject({
    method: 'POST',
    url: '/api/clips',
    headers: {
      ...headers,
      'content-type': 'audio/wav',
      'x-submission-id': id,
      'x-clip-title': 'Short test',
    },
    payload: fixture(),
  });
  const clip = async () =>
    ((await app.inject({ url: '/api/clips', headers })).json() as Clip[]).find(
      (item) => item.id === id,
    )!;
  await until(async () => (await clip()).status === 'ready');
  return {
    fake,
    dir,
    options,
    id,
    clip,
    get app() {
      return app;
    },
    restart: async (beforeStart?: (store: Store) => void) => {
      await app.close();
      if (beforeStart) {
        const store = new Store(dir);
        try {
          beforeStart(store);
        } finally {
          store.close();
        }
      }
      app = await createApp(options);
      await app.ready();
    },
    close: async () => {
      await app.close();
      await fake.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('restart resumes the saved parent; repeated clicks and multiple targets never duplicate uploads/orders', async () => {
  const ctx = await setup();
  try {
    const submit = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/api/clips/${ctx.id}/translations`,
        headers,
        payload: { targets: ['pt', 'pt', 'en'] },
      });
    const responses = await Promise.all([submit(), submit()]);
    assert.ok(responses.every((response) => response.statusCode === 202));
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'processing');
    assert.equal(ctx.fake.state.uploads, 1);
    assert.equal(ctx.fake.state.creates, 1);
    await ctx.restart();
    ctx.fake.state.ready = true;
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'ready');
    const job = (await ctx.clip()).translations![0]!;
    assert.equal(job.target, 'pt');
    assert.equal(job.captions.length, 3);
    const audio = await ctx.app.inject({ url: job.audioUrl!, headers });
    assert.equal(audio.statusCode, 200);
    assert.equal(validateWav(audio.rawPayload), 3);
    assert.equal(JSON.stringify(await ctx.clip()).includes('test-secret'), false);
    assert.equal(ctx.fake.state.assetKeyLeak, false);
    const locked = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/clips/${ctx.id}`,
      headers,
      payload: { sourceLanguage: 'zh' },
    });
    assert.equal(locked.statusCode, 409);
    await submit();
    await ctx.restart();
    assert.equal(ctx.fake.state.creates, 1);
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['zh'] },
    });
    await until(
      async () =>
        (await ctx.clip()).translations?.filter((job) => job.state === 'ready').length === 2,
    );
    assert.equal(ctx.fake.state.uploads, 1);
    assert.equal(ctx.fake.state.creates, 2);
  } finally {
    await ctx.close();
  }
});

test('lost order response reconciles by project and does not resubmit after restart', async () => {
  const ctx = await setup();
  ctx.fake.state.lostCreate = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'processing');
    await ctx.restart();
    ctx.fake.state.ready = true;
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'ready');
    assert.equal(ctx.fake.state.creates, 1);
    assert.equal(ctx.fake.state.uploads, 1);
  } finally {
    await ctx.close();
  }
});

test('uncertain uploads stop durably; duplicates and restart cannot create another project', async () => {
  const ctx = await setup();
  ctx.fake.state.lostUpload = true;
  try {
    const submit = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/api/clips/${ctx.id}/translations`,
        headers,
        payload: { targets: ['pt'] },
      });
    await submit();
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'unknown');
    await ctx.restart();
    await submit();
    await delay(100);
    assert.equal(ctx.fake.state.uploads, 1);
    assert.equal(ctx.fake.state.creates, 0);
  } finally {
    await ctx.close();
  }
});

test('late captions do not withhold audio; restart reuses saved media and safe reads recover', async () => {
  const ctx = await setup();
  ctx.fake.state.ready = true;
  ctx.fake.state.missingCaptions = true;
  ctx.fake.state.failReads = 1;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => Boolean((await ctx.clip()).translations?.[0]?.audioUrl));
    let job = (await ctx.clip()).translations![0]!;
    assert.equal(job.state, 'collecting');
    assert.equal(job.captions.length, 0);
    assert.equal((await ctx.app.inject({ url: job.audioUrl!, headers })).statusCode, 200);
    await ctx.restart();
    job = (await ctx.clip()).translations![0]!;
    assert.ok(job.audioUrl);
    assert.equal((await ctx.app.inject({ url: job.audioUrl!, headers })).statusCode, 200);
    ctx.fake.state.missingCaptions = false;
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'ready');
    assert.equal(ctx.fake.state.creates, 1);
    assert.equal(ctx.fake.state.audioReads, 1);
    assert.equal(ctx.fake.state.normalizations, 1);
  } finally {
    await ctx.close();
  }
});

test('live-shaped response without parent VTT keeps dub audio and original-timeline captions distinct', async () => {
  const ctx = await setup();
  ctx.fake.state.ready = true;
  ctx.fake.state.noDubCaptions = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'ready');
    const clip = await ctx.clip();
    const track: Track = {
      id: clip.id,
      title: clip.title,
      language: 'en',
      url: `/api/clips/${clip.id}/audio`,
      duration: clip.duration,
      translations: clip.translations,
    };
    assert.equal(clip.translations![0]!.captions.length, 2);
    assert.equal(rendition(track, 'pt').url, clip.translations![0]!.audioUrl);
    assert.equal(deliveredCaptions(track, 'en', 'pt')!.cues[0]!.text, 'Olá do teste.');
    const fallback = deliveredCaptions(track, 'pt', 'pt')!;
    assert.equal(fallback.cues[0]!.text, 'Olá do teste.');
    assert.equal(fallback.audioLanguage, 'pt');
    assert.equal(fallback.sourceAudioLanguage, 'en');
    assert.equal(fallback.timing, 'adjusted');
    assert.ok(clip.translations![0]!.captions.every((caption) => caption.audioLanguage === 'en'));
    assert.equal(ctx.fake.state.creates, 1);
  } finally {
    await ctx.close();
  }
});

test('invalid account stops without exposing provider diagnostics', async () => {
  const ctx = await setup();
  ctx.fake.state.authError = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'failed');
    assert.equal((await ctx.clip()).translations![0]!.error, 'provider_auth');
    assert.equal(JSON.stringify(await ctx.clip()).includes('private diagnostic'), false);
  } finally {
    await ctx.close();
  }
});

test('startup converts interrupted write intents to uncertainty, while preserving queued work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'job-crash-'));
  const id = randomUUID();
  let store = new Store(dir);
  try {
    store.add(id, 'Test', 'hash', 3);
    store.confirm(id, 'en');
    const jobs = new TranslationStore(store);
    const scope = new Provider('key').scope;
    jobs.enqueue(id, ['pt', 'zh'], scope);
    const source = jobs.source(id)!;
    jobs.saveSource({ ...source, state: 'uploading' });
    jobs.update(jobs.forClip(id)[0]!, 'uploading');
    store.close();
    store = new Store(dir);
    const restored = new TranslationStore(store);
    assert.equal(restored.source(id)!.state, 'unknown');
    assert.equal(restored.forClip(id)[0]!.state, 'unknown');
    restored.saveSource({ ...source, state: 'uploaded', projectId: 'project' });
    restored.update(restored.forClip(id)[1]!, 'submitting');
    store.close();
    store = new Store(dir);
    const again = new TranslationStore(store);
    assert.equal(again.forClip(id)[1]!.state, 'reconciling');
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('short provider fixtures are canonical WAVs at or below five seconds', async () => {
  const manifest = JSON.parse(await readFile('fixtures/short/manifest.json', 'utf8')) as {
    file: string;
    seconds: number;
    sha256: string;
    source: string;
    sourceSha256: string;
  }[];
  for (const row of manifest) {
    assert.ok(row.seconds <= 5);
    const audio = await readFile(row.file);
    assert.equal(validateWav(audio), row.seconds);
    assert.equal(createHash('sha256').update(audio).digest('hex'), row.sha256);
    assert.ok(row.source.startsWith('public/samples/conversations/'));
    assert.equal(
      createHash('sha256')
        .update(await readFile(row.source))
        .digest('hex'),
      row.sourceSha256,
    );
  }
});

test('captions reject malformed/out-of-range cues and assets reject private addresses', () => {
  assert.equal(
    parseCaptions('WEBVTT\n\n00:00.000 --> 00:02.000\nHello\nthere', 3)[0]!.text,
    'Hello\nthere',
  );
  for (const text of [
    '00:00.000 --> 00:05.000\nx',
    '00:04.000 --> 00:02.000\nx',
    '00:70.000 --> 01:20.000\nx',
  ])
    assert.throws(() => parseCaptions(text, 3));
  for (const host of ['127.0.0.1', '10.1.1.1', '169.254.169.254', '192.168.1.1', '::1', '0.0.0.0'])
    assert.equal(publicAddress(host), false);
  assert.equal(publicAddress('8.8.8.8'), true);
});

test('changed parent identity never publishes audio and changed credentials never resume writes', async () => {
  const ctx = await setup();
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'processing');
    ctx.fake.state.invalidParent = true;
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'attention');
    assert.equal((await ctx.clip()).translations![0]!.audioUrl, undefined);
    assert.equal((await ctx.clip()).translations![0]!.error, 'provider_contract');
    ctx.options.apiKey = 'different-key';
    await ctx.restart();
    const result = await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['zh'] },
    });
    assert.equal(result.statusCode, 409);
    assert.equal(ctx.fake.state.creates, 1);
  } finally {
    await ctx.close();
  }
});

test('missing captions reach bounded attention while audio stays playable; recheck never resubmits', async () => {
  const ctx = await setup();
  ctx.fake.state.ready = true;
  ctx.fake.state.missingTargetCaptions = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.captions.length === 1);
    const initial = (await ctx.clip()).translations![0]!;
    assert.equal(initial.captions[0]!.language, 'en');
    assert.ok(initial.audioUrl);
    await ctx.restart((store) => {
      const jobs = new TranslationStore(store);
      jobs.update(jobs.forClip(ctx.id)[0]!, 'collecting', { attempts: 9, nextCheck: 0 });
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'attention');
    const stopped = (await ctx.clip()).translations![0]!;
    assert.equal(stopped.error, 'captions_pending');
    assert.ok(stopped.canCheck);
    assert.equal(stopped.captions[0]!.language, 'en');
    const audio = await ctx.app.inject({
      url: stopped.audioUrl!,
      headers: { ...headers, range: 'bytes=0-43' },
    });
    assert.equal(audio.statusCode, 206);
    assert.equal(ctx.fake.state.audioReads, 1);
    ctx.fake.state.missingTargetCaptions = false;
    const check = await ctx.app.inject({
      method: 'POST',
      url: `/api/translations/${stopped.id}/check`,
      headers,
      payload: {},
    });
    assert.equal(check.statusCode, 202);
    assert.ok(check.json()[0].audioUrl);
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'ready');
    assert.equal(ctx.fake.state.uploads, 1);
    assert.equal(ctx.fake.state.creates, 1);
    assert.equal(ctx.fake.state.normalizations, 1);
  } finally {
    await ctx.close();
  }
});

test('a malformed late caption retains validated audio and source captions for safe recovery', async () => {
  const ctx = await setup();
  ctx.fake.state.ready = true;
  ctx.fake.state.noDubCaptions = true;
  ctx.fake.state.malformedTargetCaptions = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'attention');
    let job = (await ctx.clip()).translations![0]!;
    assert.equal(job.error, 'captions_invalid');
    assert.equal(job.captions.length, 1);
    assert.equal(job.captions[0]!.language, 'en');
    assert.equal((await ctx.app.inject({ url: job.audioUrl!, headers })).statusCode, 200);
    await ctx.restart();
    job = (await ctx.clip()).translations![0]!;
    assert.ok(job.audioUrl);
    ctx.fake.state.malformedTargetCaptions = false;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/translations/${job.id}/check`,
      headers,
      payload: {},
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'ready');
    assert.equal(ctx.fake.state.audioReads, 1);
    assert.equal(ctx.fake.state.creates, 1);
  } finally {
    await ctx.close();
  }
});

test('overall polling timeout preserves collected audio without creating replacement work', async () => {
  const ctx = await setup();
  ctx.fake.state.ready = true;
  ctx.fake.state.missingCaptions = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => Boolean((await ctx.clip()).translations?.[0]?.audioUrl));
    await ctx.restart((store) => {
      const jobs = new TranslationStore(store);
      jobs.update(jobs.forClip(ctx.id)[0]!, 'collecting', {
        createdAt: Date.now() - 2 * 60 * 60 * 1000 - 1,
        nextCheck: 0,
      });
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'attention');
    const job = (await ctx.clip()).translations![0]!;
    assert.equal(job.error, 'poll_timeout');
    assert.equal((await ctx.app.inject({ url: job.audioUrl!, headers })).statusCode, 200);
    assert.equal(ctx.fake.state.uploads, 1);
    assert.equal(ctx.fake.state.creates, 1);
  } finally {
    await ctx.close();
  }
});

test('invalid normalized audio is never exposed as a playable rendition', async () => {
  const ctx = await setup();
  ctx.fake.state.ready = true;
  ctx.fake.state.invalidNormalizedAudio = true;
  try {
    await ctx.app.inject({
      method: 'POST',
      url: `/api/clips/${ctx.id}/translations`,
      headers,
      payload: { targets: ['pt'] },
    });
    await until(async () => (await ctx.clip()).translations?.[0]?.state === 'attention');
    const job = (await ctx.clip()).translations![0]!;
    assert.equal(job.error, 'audio_invalid');
    assert.equal(job.audioUrl, undefined);
    assert.equal(
      (await ctx.app.inject({ url: `/api/translations/${job.id}/audio`, headers })).statusCode,
      404,
    );
    assert.equal(ctx.fake.state.creates, 1);
  } finally {
    await ctx.close();
  }
});
