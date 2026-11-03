import { test, expect } from '@playwright/test';
import zh from '../../locales/zh.json' with { type: 'json' };

test('start and append persist separate series and playback order', async ({ page }) => {
  await page.goto('/');
  const name = `Series ${Date.now()}`;
  await page.getByRole('button', { name: 'Start a series' }).click();
  await page.getByRole('button', { name: 'Try an example recording' }).click();
  await page.getByLabel('Clip title').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.series-heading')).toContainText(name);
  await expect(page.locator('.series-meta')).toContainText('1 clip');
  await page.locator('.add-clip-button').click();
  await expect(page.getByRole('dialog')).toContainText(name);
  await page.getByRole('button', { name: 'Try an example recording' }).click();
  await page.getByLabel('Clip title').fill('Second voice');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.series-meta')).toContainText('2 clips');
  await expect(page.locator('.now-playing')).toContainText('Second voice');
  await expect(
    page.getByRole('region', { name: 'Translation: Second voice', exact: true }),
  ).toBeVisible();
  expect(
    await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  await page.locator('.processing summary').click();
  await expect(page.locator('.processing')).toContainText('Ollang');
  await page.getByRole('button', { name: 'Previous clip', exact: true }).click();
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = audio.duration - 0.15;
  });
  await expect(page.locator('.now-playing')).toContainText('Second voice');
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.series-heading')).toContainText(name);
  await expect(page.locator('.series-meta')).toContainText('2 clips');
  const library = page.getByRole('region', { name: 'All stories' });
  await expect(library.locator('.series-open').filter({ hasText: name })).toHaveAttribute(
    'aria-current',
    'true',
  );
  const playerBox = await page.locator('.listening-card').boundingBox();
  const libraryBox = await library.boundingBox();
  expect(libraryBox!.y).toBeGreaterThan(playerBox!.y + playerBox!.height);
  await library.locator('.series-open').filter({ hasNotText: name }).first().click();
  await page.reload();
  await expect(page.locator('.series-heading')).not.toContainText(name);
  await library.locator('.series-open').filter({ hasText: name }).click();
  await page.reload();
  await expect(page.locator('.series-heading')).toContainText(name);
  await page.getByRole('button', { name: 'Next clip' }).click();
  await expect(page.locator('.now-playing')).toContainText('Second voice');
  await expect(page.locator('.translation-job')).toHaveCount(2);
});

test('browser locale, explicit site override, audio preference and timed captions stay independent', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'pt-BR' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'pt');
  await page.locator('.site-language select').selectOption('zh');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'zh');
  await page.locator('.subtitle-language').selectOption('pt');
  await page.locator('.audio-language').selectOption('original');
  await expect(page.locator('.fallback-note')).toHaveCount(0);
  await page.getByRole('button', { name: zh.play, exact: true }).click();
  await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = 8;
  });
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'pt');
  await expect(page.locator('.caption')).not.toBeEmpty();
  await page.locator('.audio-language').selectOption('zh');
  await expect(page.locator('.caption')).toHaveAttribute('lang', 'pt');
  await page.getByRole('combobox', { name: zh.subtitles, exact: true }).selectOption('off');
  await expect(page.locator('.caption')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(page.locator('.audio-language')).toHaveValue('zh');
  await expect(page.locator('.caption')).toHaveCount(0);
  await context.close();
});

test('opening recorder pauses playback; closing during capture releases the microphone', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await page.locator('.add-clip-button').click();
  expect(
    await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Close recorder' }).click();
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testStream: MediaStream }).testStream
          .getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
});

test('local API failure leaves the sample player usable and reports connection loss', async ({
  page,
}) => {
  await page.route('**/api/clips', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Cannot reach the local app');
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await page.unroute('**/api/clips');
  await page.reload();
  await expect(page.locator('.notice')).toHaveCount(0);
});

test('rapid clip changes, final end state and replay keep only one audio element playing', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await page.getByRole('button', { name: 'Next clip' }).click();
  await page.getByRole('button', { name: 'Next clip' }).click();
  await expect(page.locator('.now-playing')).toContainText('Chen: Why the jobs multiply');
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  // Wait for the new media source to actually play before seeking to its end;
  // the button can update while the browser is still switching audio sources.
  await expect
    .poll(() =>
      page
        .locator('.listening-card audio')
        .evaluate(
          (audio: HTMLAudioElement) =>
            audio.currentSrc.endsWith('/03-chinese/dub-english.wav') &&
            audio.readyState >= 3 &&
            !audio.paused &&
            audio.currentTime > 0,
        ),
    )
    .toBe(true);
  await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = audio.duration - 0.15;
  });
  await expect(page.locator('.skip-controls')).toContainText('all caught up');
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(page.locator('.now-playing')).toContainText('Alex: One click, nine jobs');
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  expect(
    await page
      .locator('audio')
      .evaluateAll(
        (elements) => elements.filter((element) => !(element as HTMLAudioElement).paused).length,
      ),
  ).toBe(1);
  await expect(page.locator('.notice')).toHaveCount(0);
});

test('uncertain language automatically exposes correction without inventing captions', async ({
  page,
  request,
}) => {
  const title = `Needs confirmation ${Date.now()}`;
  await request.post('/__test/provider', { data: { confirmationRequired: true } });
  try {
    await page.goto('/');
    await page.locator('.start-series').click();
    await page.locator('.sample-button').click();
    await page.getByLabel('Clip title').fill(title);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.series-heading')).toContainText(title);
    const panel = page.getByRole('region', { name: `Translation: ${title}`, exact: true });
    await expect(panel.getByLabel(`Spoken language: ${title}`)).toBeVisible({ timeout: 15000 });
    await expect(
      panel.getByRole('button', { name: 'Confirm and translate', exact: true }),
    ).toBeVisible();
    await expect(panel.locator('.translation-job')).toHaveCount(0);
    await expect(page.locator('.caption')).toContainText('Captions will arrive');
    await expect(page.locator('.fallback-note')).toHaveCount(0);
  } finally {
    await request.post('/__test/provider', { data: { confirmationRequired: false } });
  }
});
