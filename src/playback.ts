import type { Locale } from './locale';
import type { CaptionTrack, Translation } from '../shared/translations';
import { hasCollectedAudio, targetLanguages } from '../shared/translations';
/** A sequence distinguishes repeated play requests for the same clip. */
export type PlaybackRequest = {
  id: string;
  request: number;
  autoplay?: boolean;
  restart?: boolean;
};
export type Cue = { start: number; end: number; text: Record<Locale, string> };
export type Track = {
  id: string;
  title: string;
  language: string;
  url: string;
  duration: number;
  captions?: Cue[];
  /** Bundled source-caption tracks also exist when no dubbed audio is available. */
  captionTracks?: CaptionTrack[];
  sample?: boolean;
  translations?: Translation[];
};
export function captionAt(cues: Cue[], time: number, locale: Locale): string {
  return cues.find((cue) => cue.start <= time && time < cue.end)?.text[locale] ?? '';
}

/** Only offer voices that can actually be played for this clip. */
export function playableLanguages(track: Track): Set<string> {
  const languages = new Set<string>();
  if (targetLanguages.some((code) => code === track.language)) languages.add(track.language);
  for (const job of track.translations ?? [])
    if (
      targetLanguages.some((code) => code === job.target) &&
      hasCollectedAudio(job) &&
      job.audioUrl
    )
      languages.add(job.target);
  return languages;
}

export function rendition(track: Track, requested: string) {
  const translated =
    requested !== 'original' && requested !== track.language
      ? track.translations?.find(
          (job) => job.target === requested && hasCollectedAudio(job) && job.audioUrl,
        )
      : undefined;
  return {
    url: translated?.audioUrl ?? track.url,
    language: translated?.target ?? track.language,
    duration: translated?.duration ?? track.duration,
  };
}
export type PlaybackCaptions = CaptionTrack & {
  sourceAudioLanguage: string;
  timing: 'exact' | 'adjusted';
};

export function deliveredCaptions(
  track: Track,
  audioLanguage: string,
  locale: string,
): PlaybackCaptions | undefined {
  const ready = track.translations?.filter(hasCollectedAudio) ?? [];
  const captions = [...(track.captionTracks ?? []), ...ready.flatMap((job) => job.captions)].filter(
    (caption) => caption.cues.length,
  );
  const durationFor = (language: string) =>
    language === track.language
      ? track.duration
      : ready.find((job) => job.target === language)?.duration;

  // Exhaust the listener's language before the English fallback. Within each
  // language prefer the playing timeline, then original, then other renditions.
  for (const language of new Set([locale, 'en'])) {
    const available = captions.filter((caption) => caption.language === language);
    const timelines = new Set([
      audioLanguage,
      track.language,
      language,
      ...available.map((caption) => caption.audioLanguage),
    ]);
    for (const timeline of timelines) {
      const caption = available.find((item) => item.audioLanguage === timeline);
      if (!caption) continue;
      if (timeline === audioLanguage)
        return { ...caption, sourceAudioLanguage: timeline, timing: 'exact' };
      const sourceDuration = durationFor(timeline);
      const audioDuration = durationFor(audioLanguage);
      if (
        !sourceDuration ||
        !audioDuration ||
        !Number.isFinite(sourceDuration) ||
        !Number.isFinite(audioDuration) ||
        sourceDuration <= 0 ||
        audioDuration <= 0
      )
        continue;
      const ratio = audioDuration / sourceDuration;
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      return {
        ...caption,
        audioLanguage,
        sourceAudioLanguage: timeline,
        timing: 'adjusted',
        cues: caption.cues.map((cue) => ({
          ...cue,
          start: cue.start * ratio,
          end: cue.end * ratio,
        })),
      };
    }
  }
}
