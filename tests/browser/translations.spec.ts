import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

async function saveClip(page: import('@playwright/test').Page, title: string, append = false) {
  if (append)
    await page
      .locator('.listening-card')
      .getByRole('button', { name: 'Add a clip to continue the series' })
      .click();
  else await page.getByRole('button', { name: 'Start a series' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ollang credits');
  await page.locator('input[type=file]').setInputFiles(resolve('fixtures/short/en.wav'));
  await page.getByLabel('Clip title').fill(title);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return page.getByRole('region', { name: `Translation: ${title}`, exact: true });
}

test('save shows Whisper detection, automatically translates both languages, survives refresh and plays translated audio/subtitles', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/__test/provider')).json();
  await request.post('/__test/provider', {
    data: {
      ready: false,
      lostCreate: false,
      noDubCaptions: false,
      dubDuration: 3,
      confirmationRequired: false,
      detectionDelay: 1800,
    },
  });
  try {
    await page.goto('/');
    const title = `Automatic ${Date.now()}`;
    const panel = await saveClip(page, title);
    await expect(panel).toContainText('Whisper is detecting the source language');
    await page.screenshot({
      path: `.data/automatic-detection-${test.info().project.name}.png`,
      fullPage: true,
    });
    await expect(panel.getByRole('checkbox')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Translate audio', exact: true })).toHaveCount(
      0,
    );
    await expect(panel.locator('.translation-job')).toHaveCount(2, { timeout: 15000 });
    await expect(panel).toContainText('Ollang is processing');
    await page.screenshot({
      path: `.data/automatic-processing-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect((await (await request.get('/__test/provider')).json()).creates - before.creates).toBe(2);
    await page.locator('.processing summary').click();
    await expect(page.locator('.job-events').first()).toContainText('Uploading audio to Ollang');
    for (const locale of ['en', 'pt', 'zh']) {
      await page.locator('.site-language select').selectOption(locale);
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
      );
    }
    await page.locator('.site-language select').selectOption('en');
    await page.reload();
    await expect(panel).toContainText('Ollang is processing');
    await request.post('/__test/provider', { data: { ready: true } });
    await expect(
      panel.locator('.translation-job-heading').filter({ hasText: 'Ready to listen' }),
    ).toHaveCount(2, { timeout: 15000 });
    await page.getByLabel('Audio language', { exact: true }).selectOption('pt');
    await page.getByRole('combobox', { name: 'Subtitles', exact: true }).selectOption('pt');
    const audio = page.locator('.listening-card audio');
    await expect(audio).toHaveAttribute('src', /\/api\/translations\/.+\/audio$/);
    await expect(page.locator('.caption')).toContainText('Olá do teste.');
    await page.getByRole('button', { name: 'Play audio', exact: true }).click();
    await expect
      .poll(() => audio.evaluate((e: HTMLAudioElement) => !e.paused && e.currentTime > 0))
      .toBe(true);
    await page.getByLabel('Audio language', { exact: true }).selectOption('zh');
    await expect
      .poll(() => audio.evaluate((e: HTMLAudioElement) => !e.paused && e.currentTime > 0))
      .toBe(true);
    await page.getByLabel('Audio language', { exact: true }).selectOption('original');
    await expect(audio).toHaveAttribute('src', /\/api\/clips\/.+\/audio$/);
    await expect(page.locator('.caption')).toContainText('Olá do teste.');
    const after = await (await request.get('/__test/provider')).json();
    expect(after.uploads - before.uploads).toBe(1);
    expect(after.creates - before.creates).toBe(2);
  } finally {
    await request.post('/__test/provider', { data: { ready: true, detectionDelay: 0 } });
  }
});

test('uncertain detection presents confirmation in the player and cannot submit before the user confirms', async ({
  page,
  request,
}) => {
  await request.post('/__test/provider', {
    data: { ready: false, confirmationRequired: true, detectionDelay: 0 },
  });
  const before = await (await request.get('/__test/provider')).json();
  try {
    await page.goto('/');
    const title = `Confirm ${Date.now()}`,
      panel = await saveClip(page, title);
    await expect(
      panel.getByRole('button', { name: 'Confirm and translate', exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(panel.getByRole('combobox', { name: `Spoken language: ${title}` })).toBeVisible();
    expect(
      await panel
        .getByRole('combobox')
        .locator('option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
    ).toEqual(expect.arrayContaining(['', 'en', 'pt', 'zh', 'de', 'fr']));
    await page.screenshot({
      path: `.data/automatic-confirmation-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(await (await request.get('/__test/provider')).json()).toEqual(before);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.reload();
    await expect(
      panel.getByRole('button', { name: 'Confirm and translate', exact: true }),
    ).toBeVisible();
    expect(await (await request.get('/__test/provider')).json()).toEqual(before);
    await panel.getByRole('combobox').selectOption('en');
    await panel.getByRole('button', { name: 'Confirm and translate', exact: true }).click();
    await expect(panel).toContainText('Ollang is processing');
    expect((await (await request.get('/__test/provider')).json()).creates - before.creates).toBe(2);
  } finally {
    await request.post('/__test/provider', { data: { confirmationRequired: false, ready: true } });
  }
});

test('a continuation stays in the existing story and starts translation automatically', async ({
  page,
  request,
}) => {
  await request.post('/__test/provider', {
    data: { ready: true, confirmationRequired: false, detectionDelay: 0 },
  });
  await page.goto('/');
  const title = `Continuation ${Date.now()}`;
  try {
    // The existing player CTA is the continuation entry point.
    await page.locator('.continue-series').click();
    await page.locator('input[type=file]').setInputFiles(resolve('fixtures/short/en.wav'));
    await page.getByLabel('Clip title').fill(title);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.series-heading')).toContainText('The Five-Minute Fix');
    await expect(page.locator('.series-meta')).toContainText('4 clips');
    await expect(page.locator('.now-playing')).toContainText(title);
    const panel = page.getByRole('region', { name: `Translation: ${title}`, exact: true });
    await expect(
      panel.locator('.translation-job-heading').filter({ hasText: 'Ready to listen' }),
    ).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('.series-meta')).toContainText('4 clips');
    await page.locator('.site-language select').selectOption('pt');
    await page.locator('.site-language select').selectOption('en');
    await expect(page.locator('.series-meta')).toContainText('4 clips');
    await page.reload();
    await expect(page.locator('.series-meta')).toContainText('4 clips');
  } finally {
    const clips = await (await request.get('/api/clips')).json();
    const clip = clips.find((item: { title: string }) => item.title === title);
    if (clip) expect((await request.delete(`/__test/clips/${clip.id}`)).ok()).toBe(true);
  }
});

test('late captions leave both dubbed files playable and recover without repeating paid writes', async ({
  page,
  request,
}) => {
  await request.post('/__test/provider', {
    data: { ready: true, missingCaptions: true, confirmationRequired: false, detectionDelay: 0 },
  });
  const before = await (await request.get('/__test/provider')).json();
  try {
    await page.goto('/');
    const title = `Late captions ${Date.now()}`,
      panel = await saveClip(page, title);
    await expect(
      panel.locator('.translation-job-heading').filter({ hasText: 'Ready to listen' }),
    ).toHaveCount(2, { timeout: 15000 });
    await expect(panel).toContainText('Subtitles are not yet available');
    await page.getByLabel('Audio language', { exact: true }).selectOption('pt');
    const audio = page.locator('.listening-card audio');
    await page.getByRole('button', { name: 'Play audio', exact: true }).click();
    await expect
      .poll(() => audio.evaluate((e: HTMLAudioElement) => !e.paused && e.currentTime > 0))
      .toBe(true);
    await request.post('/__test/provider', { data: { missingCaptions: false } });
    await page.reload();
    await expect(panel).not.toContainText('Subtitles are not yet available', { timeout: 15000 });
    const after = await (await request.get('/__test/provider')).json();
    expect(after.uploads - before.uploads).toBe(1);
    expect(after.creates - before.creates).toBe(2);
  } finally {
    await request.post('/__test/provider', { data: { missingCaptions: false } });
  }
});

for (const scenario of [
  { source: 'de', detected: 'de', unavailable: true },
  { source: 'fr', detected: 'en', unavailable: false },
]) {
  test(`confirm ${scenario.source} after ${scenario.unavailable ? 'unavailable' : 'incorrect'} detection before automatic translation`, async ({
    page,
    request,
  }) => {
    await request.post('/__test/provider', {
      data: {
        ready: true,
        source: scenario.detected,
        confirmationRequired: true,
        detectorUnavailable: scenario.unavailable,
      },
    });
    const before = await (await request.get('/__test/provider')).json();
    try {
      await page.goto('/');
      const title = `Source recovery ${scenario.source} ${Date.now()}`,
        panel = await saveClip(page, title);
      const picker = panel.getByRole('combobox', { name: `Spoken language: ${title}` });
      await expect(picker).toBeVisible({ timeout: 15000 });
      expect(await (await request.get('/__test/provider')).json()).toEqual(before);
      await page.reload();
      await expect(picker).toBeVisible();
      await picker.selectOption(scenario.source);
      await request.post('/__test/provider', {
        data: { source: scenario.source, detectorUnavailable: false },
      });
      await panel.getByRole('button', { name: 'Confirm and translate', exact: true }).click();
      await expect
        .poll(
          async () => {
            const clips = await (await request.get('/api/clips')).json();
            const clip = clips.find((entry: { title: string }) => entry.title === title);
            return {
              source: clip?.sourceLanguage,
              states: clip?.translations?.map((job: { state: string }) => job.state),
            };
          },
          { timeout: 15000 },
        )
        .toEqual({ source: scenario.source, states: ['ready', 'ready', 'ready'] });
      await page.reload();
      await expect(
        panel.getByRole('button', { name: 'Confirm and translate', exact: true }),
      ).toHaveCount(0);
      const after = await (await request.get('/__test/provider')).json();
      expect(after.uploads - before.uploads).toBe(1);
      expect(after.creates - before.creates).toBe(3);
      expect(after.sources.slice(before.sources.length)).toEqual([scenario.source]);
    } finally {
      await request.post('/__test/provider', {
        data: {
          source: 'en',
          confirmationRequired: false,
          detectorUnavailable: false,
          ready: true,
        },
      });
    }
  });
}
