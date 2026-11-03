import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('sample editing sends the real trimmed WAV and permits source correction', async ({
  page,
  request,
}) => {
  await request.post('/__test/provider', { data: { confirmationRequired: true } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  await page.getByRole('button', { name: 'Try an example recording' }).click();
  const title = `Browser cut ${Date.now()}`;
  await page.getByLabel('Clip title').fill(title);
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  await page.getByRole('slider', { name: 'Selection start', exact: true }).fill('1000');
  await page.getByRole('slider', { name: 'Selection end', exact: true }).fill('4000');
  await page.getByRole('button', { name: 'Apply trim' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Selection end', exact: true })).not.toHaveValue(
    '3000',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Selection end', exact: true })).toHaveValue(
    '3000',
  );
  await page.getByRole('button', { name: 'Play your clip' }).click();
  await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/clips') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const clip = (await (await saved).json()) as { audioUrl: string };
  const body = await (await request.get(clip.audioUrl)).body();
  expect(body.length).toBe(44 + 3 * 96000);
  const panel = page.getByRole('region', { name: `Translation: ${title}`, exact: true });
  await expect(panel.getByRole('combobox')).toHaveValue('en', { timeout: 15000 });
  await panel.getByRole('combobox').selectOption('pt');
  await panel.getByRole('button', { name: 'Confirm and translate', exact: true }).click();
  await expect(page.locator('.recorded-language strong')).toContainText('Portuguese');
  await request.post('/__test/provider', { data: { confirmationRequired: false } });
  await page.reload();
  await expect(page.locator('.recorded-language strong')).toContainText('Portuguese');
  expect(errors).toEqual([]);
});

test('microphone supports pause/resume, finish, preview and cleanup', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium');
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause recording' })).toBeVisible();
  await expect(page.locator('[class*=timer]')).toContainText('0:02', { timeout: 10000 });
  await page.getByRole('button', { name: 'Pause recording' }).click();
  await expect(page.getByRole('button', { name: 'Resume recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume recording' }).click();
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(page.getByRole('button', { name: 'Play your clip' })).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeVisible();
});

test('denied microphone and malformed file recover without leaving a recording state', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('Microphone');
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Upload audio' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') });
  await expect(page.locator('.notice')).toContainText('audio');
  await page.locator('input[type=file]').setInputFiles(resolve('fixtures/short/pt.wav'));
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('cancel pending permission releases a stream that arrives later', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testStream?: MediaStream }).testStream
          ?.getTracks()
          .every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
});

test('player advances through original-language samples without provider traffic', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4315') && !request.url().startsWith('blob:'))
      external.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Setup', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await page.locator('.listening-card audio').evaluate((element: HTMLAudioElement) => {
    element.currentTime = element.duration - 0.15;
  });
  await expect(page.locator('.now-playing')).toContainText('Marina: The work never stopped');
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  expect(external).toEqual([]);
});

test('mobile layout and editor fit; modal restores focus and confirms discard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const start = page.getByRole('button', { name: 'Start a series' });
  await start.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Try an example recording' }).click();
  await expect(page.getByRole('button', { name: 'Play your clip' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  expect(
    await page
      .locator('.recorder-dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toContainText('Discard');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('button', { name: 'Play your clip' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard recording' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(start).toBeFocused();
});

test('device interruption preserves captured audio and releases tracks', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.locator('[class*=timer]')).toContainText('0:02', { timeout: 10000 });
  await page.evaluate(() =>
    (window as unknown as { testStream: MediaStream }).testStream
      .getTracks()[0]!
      .dispatchEvent(new Event('ended')),
  );
  await expect(page.getByRole('button', { name: 'Play your clip' })).toBeVisible();
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

test('MP3, M4A, OGG and WebM imports decode into an editable preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  for (const extension of ['mp3', 'm4a', 'ogg', 'webm']) {
    await page
      .locator('input[type=file]')
      .setInputFiles(resolve(`fixtures/media/sample.${extension}`));
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await page.getByRole('button', { name: 'Play your clip' }).click();
    await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause playback' }).click();
  }
});

test('recording stops at two minutes and remains editable', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'One real-time boundary run is sufficient; responsive recording is covered separately.',
  );
  test.setTimeout(150000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a series', exact: false }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play your clip' })).toBeVisible({
    timeout: 135000,
  });
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  const duration =
    Number(await page.getByRole('slider', { name: 'Selection end', exact: true }).inputValue()) /
    1000;
  expect(duration).toBeGreaterThan(119);
  expect(duration).toBeLessThanOrEqual(120);
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});
