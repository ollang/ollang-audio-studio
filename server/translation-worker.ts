import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { Provider, ProviderError, type ProviderOrder } from './provider.ts';
import { download, parseCaptions } from './provider-assets.ts';
import { TranslationStore, type Job } from './translation-store.ts';
import { validateWav } from './wav.ts';
import { activeTranslation, type CaptionTrack } from '../shared/translations.ts';

/**
 * One durable queue consumer. Provider POST intents are persisted before I/O;
 * polling/collection may repeat, but ambiguous submissions are only reconciled.
 * See docs/provider-recovery.md for states and operator recovery boundaries.
 */
export class TranslationWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private running: Promise<void> | null = null;
  private closed = false;
  private controller = new AbortController();
  constructor(
    readonly store: TranslationStore,
    readonly provider: Provider,
    readonly detectorUrl: string,
    readonly interval = 5000,
    readonly localTestOrigin?: string,
  ) {}
  start() {
    this.wake();
  }
  wake() {
    clearTimeout(this.timer);
    if (this.closed || this.running) return;
    this.running = this.tick()
      .catch(() => {
        // A failed persistence write must never lead to repeating an external POST.
        this.closed = true;
        console.error(
          'Translation worker stopped after a local persistence failure. Restart after checking storage.',
        );
      })
      .finally(() => {
        this.running = null;
        if (!this.closed) this.timer = setTimeout(() => this.wake(), this.interval);
      });
  }
  async stop() {
    this.closed = true;
    clearTimeout(this.timer);
    this.controller.abort();
    await this.running;
  }
  async tick() {
    for (const job of this.store.all()) {
      if (this.closed) return;
      if (!activeTranslation(job.state) || job.nextCheck > Date.now()) continue;
      await this.process(job);
    }
  }
  private async process(job: Job) {
    const signal = this.controller.signal;
    const source = this.store.source(job.clipId)!;
    const clip = this.store.store.get(job.clipId)!;
    if (source.scope !== this.provider.scope) {
      this.store.update(job, 'attention', { error: 'configuration_changed' });
      return;
    }
    if (Date.now() - job.createdAt > 2 * 60 * 60 * 1000) {
      this.store.update(job, 'attention', { error: 'poll_timeout' });
      return;
    }
    try {
      if (source.state === 'unknown' || source.state === 'failed') {
        this.store.update(job, source.state, {
          error: source.state === 'unknown' ? 'upload_uncertain' : 'upload_failed',
        });
        return;
      }
      if (!source.projectId) {
        this.store.update(job, 'uploading');
        source.state = 'uploading';
        this.store.saveSource(source);
        try {
          const bytes = await readFile(join(this.store.store.media, `${job.clipId}.wav`));
          source.projectId = await this.provider.upload(
            bytes,
            job.clipId,
            source.sourceLanguage,
            signal,
          );
          source.state = 'uploaded';
          this.store.saveSource(source);
        } catch (error) {
          source.state = error instanceof ProviderError && !error.uncertain ? 'failed' : 'unknown';
          this.store.saveSource(source);
          throw error;
        }
      }
      if (job.state === 'queued' || job.state === 'uploading') {
        this.store.update(job, 'submitting');
        // Commit the POST intent before sending. Commit every returned ID before reads.
        const orderIds = await this.provider.create(
          source.projectId,
          source.sourceLanguage,
          job.target,
          signal,
        );
        this.store.update(job, 'reconciling', { orderIds });
      }
      let orders: ProviderOrder[];
      if (!job.parentId) {
        orders = [];
        for (const id of job.orderIds) orders.push(await this.provider.order(id, signal));
        const matches = orders.filter(
          (order) =>
            order.projectId === source.projectId &&
            order.type === 'aiDubbing' &&
            order.targetLanguage === job.target &&
            order.sourceLanguage === source.sourceLanguage,
        );
        if (!matches.length) {
          orders = await this.provider.projectOrders(source.projectId, signal);
          matches.push(
            ...orders.filter(
              (order) =>
                order.type === 'aiDubbing' &&
                order.targetLanguage === job.target &&
                order.sourceLanguage === source.sourceLanguage,
            ),
          );
        }
        if (matches.length !== 1)
          throw new ProviderError(matches.length ? 'duplicate_parents' : 'order_not_visible');
        this.store.update(job, 'processing', { parentId: matches[0]!.id, error: '' });
      }
      const parent = await this.provider.order(job.parentId!, signal);
      if (
        parent.projectId !== source.projectId ||
        parent.targetLanguage !== job.target ||
        parent.sourceLanguage !== source.sourceLanguage ||
        parent.type !== 'aiDubbing'
      )
        throw new ProviderError('provider_contract');
      if (['cancelled', 'canceled', 'failed', 'error', 'rejected'].includes(parent.status)) {
        this.store.update(job, 'failed', {
          error: 'provider_failed',
          providerStatus: parent.status,
        });
        return;
      }
      this.store.update(job, parent.status === 'completed' ? 'collecting' : 'processing', {
        providerStatus: parent.status,
        checkedAt: new Date().toISOString(),
        attempts: parent.status === 'completed' ? job.attempts : 0,
        error: '',
        nextCheck: Date.now() + this.interval,
      });
      if (parent.status !== 'completed') return;
      const duration = await this.collectAudio(job, parent, signal);
      const captions: CaptionTrack[] = [...job.captions];
      const saveCaption = (caption: CaptionTrack) => {
        const index = captions.findIndex(
          (item) =>
            item.language === caption.language && item.audioLanguage === caption.audioLanguage,
        );
        if (index < 0) captions.push(caption);
        else captions[index] = caption;
        // A later download can fail; keep every independently validated track.
        this.store.update(job, 'collecting', { captions: [...captions] });
      };
      orders = await this.provider.projectOrders(source.projectId, signal);
      for (const order of orders) {
        const language =
          order.type === 'cc'
            ? order.sourceLanguage
            : order.type === 'subtitle'
              ? order.targetLanguage
              : undefined;
        if (
          !language ||
          ![source.sourceLanguage, job.target].includes(language) ||
          order.status !== 'completed' ||
          captions.some(
            (caption) =>
              caption.language === language && caption.audioLanguage === source.sourceLanguage,
          )
        )
          continue;
        const detail = await this.provider.order(order.id, signal);
        if (
          detail.projectId !== source.projectId ||
          detail.type !== order.type ||
          detail.sourceLanguage !== source.sourceLanguage ||
          (detail.type === 'subtitle' && detail.targetLanguage !== language) ||
          detail.status !== 'completed' ||
          !detail.vttUrl
        )
          continue;
        const data = await download(detail.vttUrl, 2 * 1024 * 1024, signal, this.localTestOrigin);
        saveCaption({
          language,
          audioLanguage: source.sourceLanguage,
          cues: parseCaptions(data.toString('utf8'), clip.duration),
        });
      }
      if (
        ![source.sourceLanguage, job.target].every((language) =>
          captions.some((caption) => caption.language === language),
        )
      )
        throw new ProviderError('captions_pending');
      // Only an export attached to the dubbing parent is assigned to its audio timeline.
      // Child transcription/subtitle exports remain on the original timeline.
      if (
        parent.vttUrl &&
        !captions.some(
          (caption) => caption.language === job.target && caption.audioLanguage === job.target,
        )
      ) {
        const data = await download(parent.vttUrl, 2 * 1024 * 1024, signal, this.localTestOrigin);
        saveCaption({
          language: job.target,
          audioLanguage: job.target,
          cues: parseCaptions(data.toString('utf8'), duration),
        });
      }
      this.store.update(job, 'ready', { captions, duration, error: '', attempts: 0 });
    } catch (error) {
      if (this.closed) return; // Startup handles interrupted POST intents.
      const code = error instanceof ProviderError ? error.code : 'provider_unavailable';
      if (job.state === 'uploading') {
        this.store.update(job, source.state === 'failed' ? 'failed' : 'unknown', { error: code });
      } else if (job.state === 'submitting') {
        const uncertain = !(error instanceof ProviderError) || error.uncertain;
        this.store.update(job, uncertain ? 'reconciling' : 'failed', {
          error: uncertain ? 'order_uncertain' : code,
          nextCheck: Date.now() + this.interval,
        });
      } else {
        const attempts = job.attempts + 1;
        const terminal =
          [
            'provider_auth',
            'provider_forbidden',
            'provider_credits',
            'provider_contract',
            'duplicate_parents',
            'asset_invalid',
            'audio_invalid',
            'captions_invalid',
          ].includes(code) || attempts >= 10;
        this.store.update(job, terminal ? (job.parentId ? 'attention' : 'unknown') : job.state, {
          error: code,
          attempts,
          nextCheck: Date.now() + Math.min(this.interval * 2 ** Math.min(attempts, 5), 60000),
        });
      }
    }
  }

  private async collectAudio(job: Job, parent: ProviderOrder, signal: AbortSignal) {
    const destination = join(this.store.store.media, `${job.id}-dub.wav`);
    if (job.duration) {
      try {
        return validateWav(await readFile(destination));
      } catch {
        // A missing/damaged local file may be recovered with a safe asset GET.
      }
    }
    const audioType = (type: string) => type.toLowerCase().replace(/[^a-z]/g, '');
    const asset =
      parent.orderDocs?.find((doc) => audioType(doc.type) === 'createdaidubaudio' && doc.url) ??
      parent.orderDocs?.find(
        (doc) => audioType(doc.type) === 'createdaidubvocalsonlyaudio' && doc.url,
      );
    if (!asset?.url) throw new ProviderError('audio_pending');
    const bytes = await download(asset.url, 24 * 1024 * 1024, signal, this.localTestOrigin);
    const normalized = await fetch(`${this.detectorUrl}/normalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    });
    if (!normalized.ok)
      throw new ProviderError(
        [429, 503].includes(normalized.status) ? 'audio_service_unavailable' : 'audio_invalid',
      );
    const wav = Buffer.from(await normalized.arrayBuffer());
    let duration: number;
    try {
      duration = validateWav(wav);
    } catch {
      throw new ProviderError('audio_invalid');
    }
    await writeFile(`${destination}.tmp`, wav, { mode: 0o600 });
    await rename(`${destination}.tmp`, destination);
    // Publish only after the complete validated file has been atomically saved.
    this.store.update(job, 'collecting', { duration });
    return duration;
  }
}
