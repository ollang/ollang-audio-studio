import { test, expect } from '@playwright/test';
import { translatedStory } from './translated-story';

test('subtitle languages and Off stay independent from audio and persist across reload', async ({
  page,
  request,
}) => {
  await translatedStory(page, request);
  const before = await (await request.get('/__test/provider')).json();
  const subtitles = page.getByRole('combobox', { name: 'Subtitles', exact: true });
  const audio = page.locator('.listening-card audio');
  await expect(subtitles).toHaveValue('site');
  for (const language of ['en', 'pt', 'zh', 'off'])
    await expect(subtitles.locator(`option[value="${language}"]`)).toHaveCount(1);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  await audio.evaluate((element: HTMLAudioElement) => {
    element.currentTime = 1;
  });
  for (const [language, text] of [
    ['pt', 'Olá do teste.'],
    ['zh', '来自测试的问候。'],
    ['en', 'Hello from the fixture.'],
  ] as const) {
    await subtitles.selectOption(language);
    await expect(page.locator('.caption')).toHaveAttribute('lang', language);
    await expect(page.locator('.caption')).toContainText(text);
    await expect(audio).toHaveAttribute('src', /\/api\/clips\/.+\/audio$/);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBe(1);
  }
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await subtitles.selectOption('pt');
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  await page.getByLabel('Site language', { exact: true }).selectOption('zh');
  await expect(page.locator('.subtitle-language')).toHaveValue('pt');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'pt');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(page.locator('.subtitle-language')).toHaveValue('pt');
  await page.locator('.subtitle-language').selectOption('off');
  await expect(page.locator('.caption')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.subtitle-language')).toHaveValue('off');
  await expect(page.locator('.caption')).toHaveCount(0);
  await page.locator('.subtitle-language').selectOption('en');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  expect(await (await request.get('/__test/provider')).json()).toEqual(before);
});

test('missing subtitle selections identify the actual fallback and retired choices are absent', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ollang.subtitleLanguage', 'de'));
  await page.goto('/');
  await expect(page.locator('.subtitle-language')).toHaveValue('site');
  for (const code of ['de', 'es', 'fr'])
    await expect(page.locator(`.subtitle-language option[value="${code}"]`)).toHaveCount(0);
  await page.getByLabel('Site language', { exact: true }).selectOption('zh');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'zh');
  await expect(page.locator('.caption-note')).toHaveCount(0);
});

test('the former captions-off preference remains off until a language is selected', async ({
  page,
  request,
}) => {
  await translatedStory(page, request);
  await page.addInitScript(() => localStorage.setItem('ollang.captions', 'false'));
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Subtitles', exact: true })).toHaveValue('off');
  await expect(page.locator('.caption')).toHaveCount(0);
  await page.locator('.subtitle-language').selectOption('zh');
  await page.reload();
  await expect(page.locator('.subtitle-language')).toHaveValue('zh');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'zh');
});
