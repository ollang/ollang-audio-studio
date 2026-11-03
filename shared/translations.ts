export const targetLanguages = ['en', 'pt', 'zh'] as const;
export type TargetLanguage = (typeof targetLanguages)[number];
export type TranslationState =
  | 'queued'
  | 'uploading'
  | 'submitting'
  | 'reconciling'
  | 'processing'
  | 'collecting'
  | 'ready'
  | 'unknown'
  | 'failed'
  | 'attention';
export type CaptionCue = { start: number; end: number; text: string };
export type CaptionTrack = {
  language: string;
  /** Audio rendition whose timestamps were delivered, preserved in storage. */
  audioLanguage: string;
  cues: CaptionCue[];
};
export type Translation = {
  id: string;
  target: string;
  state: TranslationState;
  providerStatus: string;
  error: string;
  checkedAt: string | null;
  canCheck: boolean;
  events: { at: string; state: TranslationState; providerStatus?: string }[];
  audioUrl?: string;
  duration?: number;
  captions: CaptionTrack[];
};
export const activeTranslation = (state: TranslationState) =>
  ['queued', 'uploading', 'submitting', 'reconciling', 'processing', 'collecting'].includes(state);

/** Audio is persisted independently of optional/late caption delivery. */
export const hasCollectedAudio = (job: Pick<Translation, 'state' | 'duration'>) =>
  job.state === 'ready' ||
  (['collecting', 'attention'].includes(job.state) &&
    typeof job.duration === 'number' &&
    Number.isFinite(job.duration) &&
    job.duration > 0);
