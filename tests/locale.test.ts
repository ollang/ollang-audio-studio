import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveLocale } from '../src/locale.ts';
import { captionAt } from '../src/playback.ts';
import { i18n, t } from '../src/i18n.ts';

test('locale mapping respects preference order, base languages and unsupported fallback', () => {
  assert.equal(resolveLocale(['pt-BR', 'zh']), 'pt');
  assert.equal(resolveLocale(['zz', 'zh-CN']), 'zh');
  assert.equal(resolveLocale(['EN_us']), 'en');
  assert.equal(resolveLocale(['ja']), 'en');
});
test('catalogs have complete keys and preserve interpolation placeholders', () => {
  const read = (language: string) =>
    JSON.parse(readFileSync(`locales/${language}.json`, 'utf8')) as Record<string, string>;
  const en = read('en');
  for (const locale of ['pt', 'zh']) {
    const translated = read(locale);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      assert.ok(translated[key]?.trim());
      assert.deepEqual(
        translated[key]!.match(/\{\{\w+\}\}/g)?.sort(),
        en[key]!.match(/\{\{\w+\}\}/g)?.sort(),
      );
    }
  }
});
test('i18next resolves flat keys, locale plurals, placeholders and English fallback', async () => {
  await i18n.changeLanguage('en');
  assert.equal(t('clipCount', { count: 1 }), '1 clip');
  assert.equal(t('clipCount', { count: 2 }), '2 clips');
  assert.equal(t('editor.clipLength', { time: '0:03' }), '0:03 finished clip');
  const isolated = i18n.cloneInstance({ lng: 'pt', forkResourceStore: true });
  isolated.addResource('en', 'translation', 'only', 'English fallback');
  assert.equal(isolated.t('only'), 'English fallback');
  assert.equal(
    t('subtitleLanguageFallback', { language: '<b>English</b>', requested: 'Chinese' }),
    'Subtitles in <b>English</b>; Chinese is not available yet.',
  );
});
test('caption selection follows time and site language without HTML rendering', () => {
  const cues = [{ start: 0, end: 2, text: { en: 'Hello', pt: 'Hola', zh: '<b>Bonjour</b>' } }];
  assert.equal(captionAt(cues, 0, 'pt'), 'Hola');
  assert.equal(captionAt(cues, 1.5, 'zh'), '<b>Bonjour</b>');
  assert.equal(captionAt(cues, 2, 'en'), '');
});
