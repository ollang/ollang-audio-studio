import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('library play switches stories, stops the old audio and starts the first clip in the selected language', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Audio language', { exact: true }).selectOption({ label: 'English' });
  await page.getByRole('button', { name: 'Start a series' }).click();
  await page.locator('input[type=file]').setInputFiles(resolve('fixtures/short/en.wav'));
  const title = `Library play ${Date.now()}`;
  await page.getByLabel('Clip title').fill(title);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const audio = page.locator('.listening-card audio');
  const library = page.getByRole('region', { name: 'All stories' });
  const showcase = library.locator('.series-open').filter({ hasText: 'The Five-Minute Fix' });
  const saved = library.locator('.series-open').filter({ hasText: title });
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);

  await showcase.click();
  await expect(page.locator('.series-heading')).toContainText('The Five-Minute Fix');
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentSrc))
    .toContain('/01-english/original.wav');
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 0),
    )
    .toBe(true);
  const oldAudio = await audio.elementHandle();
  expect(oldAudio).not.toBeNull();
  await saved.click();
  await expect(page.locator('.series-heading')).toContainText(title);
  await expect
    .poll(() => oldAudio!.evaluate((element: HTMLAudioElement) => element.paused))
    .toBe(true);
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 0),
    )
    .toBe(true);
  await expect(audio).toHaveCount(1);

  // Repeated clicks are new play requests even when the series is unchanged.
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  await audio.evaluate((element: HTMLAudioElement) => {
    element.currentTime = 2;
  });
  await saved.click();
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime < 1),
    )
    .toBe(true);

  await showcase.click();
  await page.getByRole('button', { name: 'Next clip', exact: true }).click();
  await expect(page.locator('.now-playing')).toContainText('Marina');
  await showcase.click();
  await expect(page.locator('.now-playing')).toContainText('Alex');
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 0),
    )
    .toBe(true);
  await expect(audio).toHaveAttribute('src', /01-english\/original\.wav$/);
  await oldAudio?.dispose();
});

test('library play restarts a finished story and supports keyboard activation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Next clip', exact: true }).click();
  await page.getByRole('button', { name: 'Next clip', exact: true }).click();
  const audio = page.locator('.listening-card audio');
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await audio.evaluate((element: HTMLAudioElement) => {
    element.currentTime = element.duration - 0.1;
  });
  await expect(page.locator('.skip-controls')).toContainText('You’re all caught up');
  await page.locator('.series-open').filter({ hasText: 'The Five-Minute Fix' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.now-playing')).toContainText('Alex');
  await expect
    .poll(() =>
      audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 0),
    )
    .toBe(true);
  await expect(audio).toHaveAttribute('src', /01-english\/original\.wav$/);
});
