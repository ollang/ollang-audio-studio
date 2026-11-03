import { randomUUID } from 'node:crypto';
import type { Store } from './storage.ts';
import type { CaptionTrack, Translation, TranslationState } from '../shared/translations.ts';
import { hasCollectedAudio } from '../shared/translations.ts';

export type Source = {
  clipId: string;
  state: 'queued' | 'uploading' | 'uploaded' | 'unknown' | 'failed';
  sourceLanguage: string;
  scope: string;
  projectId?: string;
};
export type Job = {
  id: string;
  clipId: string;
  target: string;
  state: TranslationState;
  orderIds: string[];
  parentId?: string;
  providerStatus: string;
  error: string;
  attempts: number;
  nextCheck: number;
  createdAt: number;
  checkedAt: string | null;
  events: Translation['events'];
  captions: CaptionTrack[];
  duration?: number;
};
export class TranslationStore {
  constructor(readonly store: Store) {
    // An interrupted POST may have succeeded. Never send it a second time.
    for (const job of this.all()) {
      if (job.state === 'uploading')
        this.update(job, this.source(job.clipId)?.projectId ? 'queued' : 'unknown', {
          error: this.source(job.clipId)?.projectId ? '' : 'upload_uncertain',
        });
      if (job.state === 'submitting') this.update(job, 'reconciling', { error: 'order_uncertain' });
    }
    for (const row of this.store.db
      .prepare("SELECT data FROM provider_sources WHERE state='uploading'")
      .all()) {
      this.saveSource({ ...JSON.parse(row.data as string), state: 'unknown' });
    }
  }
  all(): Job[] {
    return this.store.db
      .prepare('SELECT data FROM translation_jobs ORDER BY rowid')
      .all()
      .map((row) => JSON.parse(row.data as string) as Job);
  }
  get(id: string): Job | undefined {
    const row = this.store.db.prepare('SELECT data FROM translation_jobs WHERE id=?').get(id);
    return row ? (JSON.parse(row.data as string) as Job) : undefined;
  }
  forClip(id: string): Job[] {
    return this.store.db
      .prepare('SELECT data FROM translation_jobs WHERE clip_id=? ORDER BY rowid')
      .all(id)
      .map((row) => JSON.parse(row.data as string) as Job);
  }
  source(id: string): Source | undefined {
    const row = this.store.db.prepare('SELECT data FROM provider_sources WHERE clip_id=?').get(id);
    return row ? (JSON.parse(row.data as string) as Source) : undefined;
  }
  saveSource(source: Source) {
    this.store.db
      .prepare(
        'INSERT INTO provider_sources(clip_id,state,data) VALUES(?,?,?) ON CONFLICT(clip_id) DO UPDATE SET state=excluded.state,data=excluded.data',
      )
      .run(source.clipId, source.state, JSON.stringify(source));
  }
  enqueue(clipId: string, targets: string[], scope: string) {
    const clip = this.store.get(clipId)!;
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.source(clipId))
        this.saveSource({ clipId, sourceLanguage: clip.sourceLanguage, scope, state: 'queued' });
      for (const target of targets) {
        if (this.forClip(clipId).some((job) => job.target === target)) continue;
        const job: Job = {
          id: randomUUID(),
          clipId,
          target,
          state: 'queued',
          orderIds: [],
          providerStatus: '',
          error: '',
          attempts: 0,
          nextCheck: Date.now(),
          createdAt: Date.now(),
          checkedAt: null,
          events: [],
          captions: [],
        };
        this.update(job, 'queued');
      }
      this.store.db.exec('COMMIT');
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }
  update(job: Job, state: TranslationState, patch: Partial<Job> = {}) {
    const next = { ...job, ...patch, state };
    if (
      job.state !== state ||
      !job.events.length ||
      (patch.providerStatus && patch.providerStatus !== job.providerStatus)
    )
      next.events = [
        ...job.events,
        {
          at: new Date().toISOString(),
          state,
          ...(patch.providerStatus ? { providerStatus: patch.providerStatus } : {}),
        },
      ].slice(-40);
    this.store.db
      .prepare(
        'INSERT INTO translation_jobs(id,clip_id,target,state,next_check,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,next_check=excluded.next_check,data=excluded.data',
      )
      .run(next.id, next.clipId, next.target, next.state, next.nextCheck, JSON.stringify(next));
    Object.assign(job, next);
  }
  public(id: string): Translation[] {
    return this.forClip(id).map((job) => ({
      id: job.id,
      target: job.target,
      state: job.state,
      providerStatus: job.providerStatus,
      error: job.error,
      checkedAt: job.checkedAt,
      canCheck:
        Boolean(this.source(job.clipId)?.projectId) && ['attention', 'unknown'].includes(job.state),
      events: job.events,
      captions: job.captions,
      ...(hasCollectedAudio(job)
        ? { audioUrl: `/api/translations/${job.id}/audio`, duration: job.duration }
        : {}),
    }));
  }
}
