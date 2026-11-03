import data from '../fixtures/showcase.json';
import type { Track } from './playback';

/** Prerecorded Ollang outputs; visiting the example never submits provider work. */
export const showcase = {
  id: 'showcase',
  title: data.title,
  tracks: data.clips.map((clip): Track => ({
    id: clip.id,
    title: clip.title,
    language: clip.language,
    url: clip.url,
    duration: clip.duration,
    captionTracks: clip.captions,
    translations: clip.renditions.map((rendition) => ({
      id: `${clip.id}-${rendition.language}`,
      target: rendition.language,
      state: 'ready',
      providerStatus: 'completed',
      error: '',
      checkedAt: null,
      canCheck: false,
      events: [],
      audioUrl: rendition.url,
      duration: rendition.duration,
      captions: [],
    })),
  })),
};
