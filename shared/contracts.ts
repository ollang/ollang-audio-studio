import { z } from 'zod';
import type { Translation } from './translations';

export const MAX_AUDIO_SECONDS = 120;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const LanguageCode = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
export const Detection = z.object({
  language: z.string(),
  confidence: z.number().min(0).max(1),
  duration: z.number().positive().max(MAX_AUDIO_SECONDS),
  confirmationRequired: z.boolean(),
  reason: z.enum(['detected', 'low_confidence', 'no_speech']),
});
export type DetectionResult = z.infer<typeof Detection>;
export type Clip = {
  id: string;
  title: string;
  seriesId: string;
  position: number;
  duration: number;
  sourceLanguage: string;
  detectedLanguage: string;
  confidence: number | null;
  confirmationRequired: boolean;
  status: 'analyzing' | 'ready' | 'needs_language';
  notice: string;
  createdAt: string;
  audioUrl: string;
  /** Persisted consent to translate this recording after source confirmation. */
  automaticTranslation?: boolean;
  translations?: Translation[];
};
export type Configuration = {
  apiKeyConfigured: boolean;
  liveTranslationEnabled: boolean;
  detector: 'ready' | 'loading' | 'unavailable';
  model: string;
};
