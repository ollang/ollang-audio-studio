import { test, expect } from '@playwright/test';
import { translatedStory } from './translated-story';

test('listening-language changes preserve playing or paused state, including Original audio', async ({
  page,
  request,
}) => {
  await translatedStory(page, request);
  const baseline = await (await request.get('/__test/provider')).json();
  const audio = page.locator('.listening-card audio');
  const language = page.getByLabel('Audio language', { exact: true });
  const play = page.getByRole('button', { name: 'Play audio', exact: true });
  const pause = page.getByRole('button', { name: 'Pause audio', exact: true });

  // A selection before the first play must only prepare the chosen source.
  await language.selectOption('pt');
  await expect(audio).toHaveAttribute('src', /\/api\/translations\/.+\/audio$/);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await language.selectOption('original');
  await expect(audio).toHaveAttribute('src', /\/api\/clips\/.+\/audio$/);
  await expect(play).toBeVisible();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);

  await play.click();
  await expect(pause).toBeVisible();
  for (const [value, file] of [
    ['pt', '/api/translations/'],
    ['zh', '/api/translations/'],
    ['original', '/api/clips/'],
  ] as const) {
    await language.selectOption(value);
    expect(await audio.getAttribute('src')).toContain(file);
    await expect(pause).toBeVisible();
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentSrc))
      .toContain(file);
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
      .toBeGreaterThan(0.1);
  }

  // Choosing the source language when Original already uses that file must not
  // interrupt playback or wait for a metadata event that will never fire.
  await language.selectOption({ label: 'English' });
  await expect(pause).toBeVisible();
  await pause.click();
  for (const [value, file] of [
    ['pt', '/api/translations/'],
    ['original', '/api/clips/'],
  ] as const) {
    await language.selectOption(value);
    expect(await audio.getAttribute('src')).toContain(file);
    await expect
      .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
      .toBeGreaterThanOrEqual(1);
    await expect(play).toBeVisible();
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  }
  await play.click();
  await expect(pause).toBeVisible();

  // Several selections while a new source loads must settle on the last one.
  await language.selectOption('pt');
  await language.selectOption('pt');
  await language.selectOption('zh');
  await expect(audio).toHaveAttribute('src', /\/api\/translations\/.+\/audio$/);
  await expect(pause).toBeVisible();
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0.1);
  await pause.click();
  const end = await (await request.get('/__test/provider')).json();
  expect(end).toEqual(baseline);
});

test('changing listening language after the series ends stays stopped until Play', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Next clip', exact: true }).click();
  await page.getByRole('button', { name: 'Next clip', exact: true }).click();
  const audio = page.locator('.listening-card audio');
  const play = page.getByRole('button', { name: 'Play audio', exact: true });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  await play.click();
  await audio.evaluate((element: HTMLAudioElement) => {
    element.currentTime = element.duration - 0.1;
  });
  await expect(page.locator('.skip-controls')).toContainText('You’re all caught up');
  await page.getByLabel('Audio language', { exact: true }).selectOption('original');
  await expect(audio).toHaveAttribute('src', /03-chinese\/original\.wav$/);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(play).toBeVisible();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await play.click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await expect(audio).toHaveAttribute('src', /03-chinese\/original\.wav$/);
});

test('retired preferences are cleared; listening menus offer only supported playable languages and Original audio', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ollang.audio', 'de'));
  await page.goto('/');
  const language = page.getByLabel('Audio language', { exact: true });
  for (const code of ['es', 'fr', 'de'])
    await expect(language.locator(`option[value="${code}"]`)).toHaveCount(0);
  await expect(language.locator('option[value="original"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next clip', exact: true }).click();
  await language.selectOption('original');
  await expect(language).toHaveValue('original');
  await expect(page.locator('.listening-card audio')).toHaveAttribute(
    'src',
    /02-portuguese\/original\.wav$/,
  );
});
