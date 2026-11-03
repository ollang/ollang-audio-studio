import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveredCaptions, playableLanguages, type Track } from '../src/playback.ts';
import type { CaptionTrack, Translation } from '../shared/translations.ts';

const cue = (text: string) => [{ start: 2, end: 4, text }];
const captions = (language: string, audioLanguage: string, text: string): CaptionTrack => ({
  language,
  audioLanguage,
  cues: cue(text),
});
const job = (
  target: string,
  duration: number | undefined,
  tracks: CaptionTrack[],
): Translation => ({
  id: `job-${target}`,
  target,
  duration,
  state: 'ready',
  providerStatus: 'completed',
  error: '',
  checkedAt: null,
  canCheck: false,
  events: [],
  audioUrl: `/dub-${target}.wav`,
  captions: tracks,
});
const track = (translations: Translation[], language = 'en', duration = 10): Track => ({
  id: 'clip',
  title: 'Test clip',
  url: '/original.wav',
  language,
  duration,
  translations,
});

test('exact-timeline captions win and keep their delivered cue times', () => {
  const exact = captions('pt', 'pt', 'Exacto');
  exact.cues = [{ start: 3.2, end: 7.1, text: 'Exacto' }];
  const selected = deliveredCaptions(
    track([job('pt', 15, [captions('pt', 'en', 'Original'), exact])]),
    'pt',
    'pt',
  )!;
  assert.equal(selected.timing, 'exact');
  assert.deepEqual(selected.cues, exact.cues);
});

test('preferred language on the original timeline wins over English on the playing timeline', () => {
  const source = captions('zh', 'zh', 'Bonjour\nle monde');
  const selected = deliveredCaptions(
    track([job('en', 15, [captions('en', 'en', 'Hello'), source])], 'zh'),
    'en',
    'zh',
  )!;
  assert.equal(selected.language, 'zh');
  assert.equal(selected.audioLanguage, 'en');
  assert.equal(selected.sourceAudioLanguage, 'zh');
  assert.equal(selected.timing, 'adjusted');
  assert.deepEqual(selected.cues, [{ start: 3, end: 6, text: 'Bonjour\nle monde' }]);
  assert.deepEqual(source.cues, cue('Bonjour\nle monde'));
});

test('a shorter dub compresses cue times, while equal durations still report adjusted provenance', () => {
  const source = captions('pt', 'en', 'Hola');
  assert.deepEqual(deliveredCaptions(track([job('pt', 5, [source])]), 'pt', 'pt')!.cues, [
    { start: 1, end: 2, text: 'Hola' },
  ]);
  const equal = deliveredCaptions(track([job('pt', 10, [source])]), 'pt', 'pt')!;
  assert.equal(equal.timing, 'adjusted');
  assert.deepEqual(equal.cues, source.cues);
});

test('scaling uses the caption audio timeline duration rather than the text language duration', () => {
  const translated = captions('zh', 'pt', 'Bonjour');
  translated.cues = [{ start: 3, end: 6, text: 'Bonjour' }];
  const selected = deliveredCaptions(
    track([job('pt', 15, []), job('zh', 20, [translated])]),
    'en',
    'zh',
  )!;
  assert.equal(selected.audioLanguage, 'en');
  assert.equal(selected.sourceAudioLanguage, 'pt');
  assert.deepEqual(selected.cues, [{ start: 2, end: 4, text: 'Bonjour' }]);
});

test('English fallback identifies its real text language and never picks another unrequested language', () => {
  const selected = deliveredCaptions(
    track([job('pt', 15, [captions('pt', 'en', 'Hola'), captions('en', 'en', 'Hello')])]),
    'pt',
    'zh',
  )!;
  assert.equal(selected.language, 'en');
  assert.equal(selected.timing, 'adjusted');
  assert.deepEqual(selected.cues, [{ start: 3, end: 6, text: 'Hello' }]);
  assert.equal(
    deliveredCaptions(track([job('zh', 15, [captions('pt', 'pt', 'Hola')])], 'pt'), 'zh', 'en'),
    undefined,
  );
});

test('invalid or missing durations prevent cross-timeline scaling; exact tracks remain usable', () => {
  for (const duration of [undefined, 0, -1, NaN, Infinity]) {
    const saved = track([job('pt', duration, [captions('pt', 'en', 'Hola')])]);
    assert.equal(deliveredCaptions(saved, 'pt', 'pt'), undefined);
    saved.translations![0]!.captions.push(captions('pt', 'pt', 'Exacto'));
    assert.equal(deliveredCaptions(saved, 'pt', 'pt')!.timing, 'exact');
  }
});

test('uncollected audio and empty exports cannot supply captions; partial collection retains valid tracks', () => {
  const pending = job('pt', 15, [captions('pt', 'en', 'Hola')]);
  pending.state = 'processing';
  assert.equal(deliveredCaptions(track([pending]), 'pt', 'pt'), undefined);
  pending.state = 'collecting';
  assert.equal(deliveredCaptions(track([pending]), 'pt', 'pt')!.language, 'pt');
  pending.state = 'attention';
  assert.equal(deliveredCaptions(track([pending]), 'pt', 'pt')!.language, 'pt');
  pending.duration = undefined;
  assert.equal(deliveredCaptions(track([pending]), 'pt', 'pt'), undefined);
  assert.equal(
    deliveredCaptions(
      track([job('pt', 15, [{ language: 'pt', audioLanguage: 'en', cues: [] }])]),
      'pt',
      'pt',
    ),
    undefined,
  );
});

test('playable languages exclude UI locales, unfinished jobs and audio-free receipts', () => {
  const ready = job('pt', 10, []);
  const collecting = { ...job('zh', 10, []), state: 'collecting' as const };
  const pending = { ...job('de', undefined, []), state: 'processing' as const };
  const missing = { ...job('pt', 10, []), audioUrl: undefined };
  assert.deepEqual(
    [...playableLanguages(track([ready, collecting, pending, missing]))],
    ['en', 'pt', 'zh'],
  );
  assert.deepEqual([...playableLanguages(track([], '', 10))], []);
});
