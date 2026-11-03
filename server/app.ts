import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  Detection,
  LanguageCode,
  MAX_AUDIO_BYTES,
  type Configuration,
} from '../shared/contracts.ts';
import { Store } from './storage.ts';
import { validateWav } from './wav.ts';
import { saveOriginal } from './media.ts';
import { TranslationStore } from './translation-store.ts';
import { TranslationWorker } from './translation-worker.ts';
import { Provider } from './provider.ts';
import { targetLanguages, hasCollectedAudio } from '../shared/translations.ts';

type Options = {
  dataDir: string;
  detectorUrl: string;
  apiKey?: string;
  staticDir?: string;
  providerUrl?: string;
  pollInterval?: number;
  localTestAssetOrigin?: string;
};
const Id = z.string().uuid();

export async function createApp(options: Options) {
  const app = Fastify({ logger: false, bodyLimit: MAX_AUDIO_BYTES, requestTimeout: 15000 });
  const store = new Store(options.dataDir);
  const translations = new TranslationStore(store);
  const provider = options.apiKey ? new Provider(options.apiKey, options.providerUrl) : null;
  const worker = provider
    ? new TranslationWorker(
        translations,
        provider,
        options.detectorUrl,
        options.pollInterval,
        options.localTestAssetOrigin,
      )
    : null;
  app.addHook('onReady', async () => {
    // Repair a crash between confirmed detection and queue persistence. The
    // unique clip/target receipts make this safe across restarts and retries.
    for (const clip of store.list()) translateAutomatically(clip.id);
    worker?.start();
  });
  function translateAutomatically(id: string) {
    const clip = store.get(id);
    if (
      !provider ||
      !clip?.automaticTranslation ||
      clip.status !== 'ready' ||
      !clip.sourceLanguage ||
      clip.confirmationRequired
    )
      return;
    const source = translations.source(id);
    if (source && source.scope !== provider.scope) return;
    translations.enqueue(
      id,
      targetLanguages.filter((target) => target !== clip.sourceLanguage),
      provider.scope,
    );
    worker?.wake();
  }
  const pending: string[] = [];
  const saving = new Set<string>();
  let draining: Promise<void> | null = null;
  let closing = false;
  const controller = new AbortController();
  async function drain() {
    while (pending.length && !closing) {
      const id = pending.shift()!;
      try {
        const data = await readFile(join(store.media, `${id}.wav`));
        const response = await fetch(`${options.detectorUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: new Uint8Array(data),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
        });
        if (!response.ok) throw new Error('detector_unavailable');
        const result = Detection.parse(await response.json());
        store.detected(id, result);
        translateAutomatically(id);
      } catch {
        if (!closing) store.failed(id);
      }
    }
  }
  function enqueue(id: string) {
    pending.push(id);
    if (!draining)
      draining = drain().finally(() => {
        draining = null;
      });
  }
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host?.split(':')[0];
    if (!host || !['localhost', '127.0.0.1'].includes(host))
      return reply.code(403).send({ error: 'untrusted_origin' });
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.origin;
      if (
        request.headers['sec-fetch-site'] === 'cross-site' ||
        (origin &&
          ![
            `http://${request.headers.host}`,
            'http://localhost:4311',
            'http://127.0.0.1:4311',
          ].includes(origin))
      )
        return reply.code(403).send({ error: 'untrusted_origin' });
    }
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
    );
    reply.header('Cache-Control', 'no-store');
  });
  app.addContentTypeParser('audio/wav', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    return reply
      .code(status && status < 500 ? status : 500)
      .send({ error: status === 413 ? 'too_large' : 'request_failed' });
  });
  app.get('/api/health', async () => ({
    status: 'ok',
    stage: 'provider-integration',
    providerCallsEnabled: Boolean(provider),
  }));
  app.get('/api/config', async (): Promise<Configuration> => {
    let detector: Configuration['detector'] = 'unavailable';
    try {
      const response = await fetch(`${options.detectorUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const health = z
        .object({ status: z.enum(['ready', 'loading', 'unavailable']) })
        .parse(await response.json());
      detector = health.status;
    } catch {
      /* Sample player and editing stay usable without detection. */
    }
    return {
      apiKeyConfigured: Boolean(options.apiKey),
      liveTranslationEnabled: Boolean(provider),
      detector,
      model: 'Whisper tiny · CPU',
    };
  });
  app.get('/api/clips', async () =>
    store.list().map((clip) => ({ ...clip, translations: translations.public(clip.id) })),
  );
  app.post('/api/clips', async (request, reply) => {
    const id = Id.safeParse(request.headers['x-submission-id']);
    const automatic = z
      .enum(['true', 'false'])
      .safeParse(request.headers['x-auto-translate'] ?? 'false');
    if (!automatic.success) return reply.code(400).send({ error: 'invalid_request' });
    const rawTitle = request.headers['x-clip-title'];
    let title: string;
    try {
      title = decodeURIComponent(typeof rawTitle === 'string' ? rawTitle : '').trim();
    } catch {
      return reply.code(400).send({ error: 'invalid_title' });
    }
    if (!id.success || !title || title.length > 80 || !Buffer.isBuffer(request.body))
      return reply.code(400).send({ error: 'invalid_request' });
    let duration: number;
    try {
      duration = validateWav(request.body);
    } catch (error) {
      return reply.code(422).send({ error: (error as Error).message });
    }
    const series = z
      .union([Id, z.literal('showcase')])
      .safeParse(request.headers['x-series-id'] ?? id.data);
    if (!series.success) return reply.code(400).send({ error: 'invalid_series' });
    if (series.data !== id.data && series.data !== 'showcase' && !store.hasSeries(series.data))
      return reply.code(404).send({ error: 'series_not_found' });
    const hash = createHash('sha256').update(request.body).digest('hex');
    const existing = store.get(id.data);
    if (existing)
      return store.hash(id.data) === hash &&
        existing.seriesId === series.data &&
        Boolean(existing.automaticTranslation) === (automatic.data === 'true') &&
        existing.title === title
        ? reply.send(existing)
        : reply.code(409).send({ error: 'submission_conflict' });
    if (saving.has(id.data)) return reply.code(409).send({ error: 'submission_in_progress' });
    if (pending.length + saving.size >= 8) return reply.code(429).send({ error: 'queue_full' });
    const file = join(store.media, `${id.data}.wav`);
    saving.add(id.data);
    try {
      if (!(await saveOriginal(file, request.body)))
        return reply.code(409).send({ error: 'submission_conflict' });
      // Keep a complete orphan if SQLite fails: the same submission can recover it.
      store.add(id.data, title, hash, duration, series.data, automatic.data === 'true');
      enqueue(id.data);
      return reply.code(201).send(store.get(id.data));
    } finally {
      saving.delete(id.data);
    }
  });
  app.patch<{ Params: { id: string } }>('/api/clips/:id', async (request, reply) => {
    const id = Id.safeParse(request.params.id);
    const body = z.object({ sourceLanguage: LanguageCode }).strict().safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    const clip = store.get(id.data);
    if (!clip) return reply.code(404).send({ error: 'not_found' });
    if (translations.source(id.data)) return reply.code(409).send({ error: 'source_locked' });
    if (clip.status === 'analyzing') return reply.code(409).send({ error: 'still_analyzing' });
    const confirmed = store.confirm(id.data, body.data.sourceLanguage);
    translateAutomatically(id.data);
    return confirmed;
  });
  app.post<{ Params: { id: string } }>('/api/clips/:id/detect', async (request, reply) => {
    const id = Id.safeParse(request.params.id);
    if (!id.success) return reply.code(400).send({ error: 'invalid_request' });
    const clip = store.get(id.data);
    if (!clip) return reply.code(404).send({ error: 'not_found' });
    if (translations.source(id.data)) return reply.code(409).send({ error: 'source_locked' });
    if (clip.status !== 'analyzing') {
      if (pending.length + saving.size >= 8) return reply.code(429).send({ error: 'queue_full' });
      store.detecting(id.data);
      enqueue(id.data);
    }
    return reply.code(202).send(store.get(id.data));
  });
  app.post<{ Params: { id: string } }>('/api/clips/:id/translations', async (request, reply) => {
    const id = Id.safeParse(request.params.id);
    const body = z
      .object({ targets: z.array(z.enum(targetLanguages)).min(1).max(3) })
      .strict()
      .safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    if (!provider) return reply.code(503).send({ error: 'provider_not_configured' });
    const clip = store.get(id.data);
    if (!clip) return reply.code(404).send({ error: 'not_found' });
    if (clip.status !== 'ready' || !clip.sourceLanguage || clip.confirmationRequired)
      return reply.code(409).send({ error: 'language_required' });
    const targets = [...new Set(body.data.targets)].filter(
      (target) => target !== clip.sourceLanguage,
    );
    if (!targets.length) return reply.code(400).send({ error: 'targets_required' });
    const source = translations.source(clip.id);
    if (source && source.scope !== provider.scope)
      return reply.code(409).send({ error: 'configuration_changed' });
    translations.enqueue(clip.id, targets, provider.scope);
    worker?.wake();
    return reply.code(202).send(translations.public(clip.id));
  });
  app.post<{ Params: { id: string } }>('/api/translations/:id/check', async (request, reply) => {
    const job = Id.safeParse(request.params.id).success
      ? translations.get(request.params.id)
      : undefined;
    if (!job) return reply.code(404).send({ error: 'not_found' });
    if (!provider) return reply.code(503).send({ error: 'provider_not_configured' });
    const source = translations.source(job.clipId)!;
    if (source.scope !== provider.scope)
      return reply.code(409).send({ error: 'configuration_changed' });
    if (!source.projectId || !['attention', 'unknown'].includes(job.state))
      return reply.code(409).send({ error: 'cannot_reconcile' });
    translations.update(
      job,
      hasCollectedAudio(job) ? 'collecting' : job.parentId ? 'processing' : 'reconciling',
      {
        attempts: 0,
        nextCheck: 0,
        createdAt: Date.now(),
        error: '',
      },
    );
    worker?.wake();
    return reply.code(202).send(translations.public(job.clipId));
  });
  await app.register(staticFiles, { root: resolve(options.staticDir ?? 'dist'), wildcard: false });
  app.get<{ Params: { id: string } }>('/api/clips/:id/audio', async (request, reply) => {
    const id = Id.safeParse(request.params.id);
    if (!id.success || !store.get(id.data)) return reply.code(404).send({ error: 'not_found' });
    return reply.sendFile(`${id.data}.wav`, store.media);
  });
  app.get<{ Params: { id: string } }>('/api/translations/:id/audio', async (request, reply) => {
    const job = Id.safeParse(request.params.id).success
      ? translations.get(request.params.id)
      : undefined;
    if (!job || !hasCollectedAudio(job)) return reply.code(404).send({ error: 'not_found' });
    return reply.sendFile(`${job.id}-dub.wav`, store.media);
  });
  app.setNotFoundHandler((request, reply) =>
    request.url.split('?')[0] === '/'
      ? reply.sendFile('index.html')
      : reply.code(404).send({ error: 'not_found' }),
  );
  app.addHook('onClose', async () => {
    closing = true;
    controller.abort();
    await draining;
    await worker?.stop();
    store.close();
  });
  return app;
}
