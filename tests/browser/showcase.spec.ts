import { test, expect } from '@playwright/test';

test('three mixed-source clips play originals and English dubs with captions and no orders', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/__test/provider')).json();
  await page.goto('/');
  await expect(page.locator('.series-heading')).toContainText('The Five-Minute Fix');
  await expect(page.locator('.series-meta')).toContainText('3 clips');
  await page.getByLabel('Audio language', { exact: true }).selectOption('original');
  const languages = ['English', 'Portuguese', 'Chinese'];
  const folders = ['01-english', '02-portuguese', '03-chinese'];
  for (let index = 0; index < 3; index++) {
    await expect(page.locator('.recorded-language strong')).toHaveText(languages[index]!);
    await page.getByRole('button', { name: 'Play audio', exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator('.listening-card audio')
          .evaluate(
            (audio: HTMLAudioElement) =>
              !audio.paused && audio.currentTime > 0 && audio.readyState >= 3,
          ),
      )
      .toBe(true);
    expect(await page.locator('.listening-card audio').getAttribute('src')).toContain(
      `/${folders[index]}/original.wav`,
    );
    await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => {
      audio.currentTime = 1;
    });
    await expect(page.locator('.caption')).not.toBeEmpty();
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
    await page.getByLabel('Audio language', { exact: true }).selectOption({ label: 'English' });
    const englishFile = index === 0 ? 'original.wav' : 'dub-english.wav';
    await expect(page.locator('.listening-card audio')).toHaveAttribute(
      'src',
      new RegExp(`/${folders[index]}/${englishFile}$`),
    );
    await page.getByRole('button', { name: 'Play audio', exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator('.listening-card audio')
          .evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
    if (index < 2) {
      await page.getByLabel('Audio language', { exact: true }).selectOption('original');
      await page.getByRole('button', { name: 'Next clip', exact: true }).click();
    }
  }
  await page.getByLabel('Audio language', { exact: true }).selectOption({ label: 'English' });
  await page.reload();
  await expect(page.getByLabel('Audio language', { exact: true })).toHaveValue('en');
  await expect(page.locator('.listening-card audio')).toHaveAttribute(
    'src',
    /01-english\/original.wav$/,
  );
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.listening-card audio')
        .evaluate((audio: HTMLAudioElement) => audio.currentTime > 0 && !audio.paused),
    )
    .toBe(true);
  await page.locator('.listening-card audio').evaluate((audio: HTMLAudioElement) => {
    audio.currentTime = audio.duration - 0.15;
  });
  await expect(page.locator('.now-playing')).toContainText('Marina');
  await expect(page.locator('.listening-card audio')).toHaveAttribute(
    'src',
    /02-portuguese\/dub-english.wav$/,
  );
  const after = await (await request.get('/__test/provider')).json();
  expect(after).toEqual(before);
});

test('a saved legacy selection cannot restore retired voices or audio URLs', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => localStorage.setItem('ollang.series', 'example'));
  await page.goto('/');
  await expect(page.locator('.series-heading')).toContainText('The Five-Minute Fix');
  await expect(
    page.locator('.series-open').filter({ hasText: 'A little inspiration, passed along.' }),
  ).toHaveCount(0);
  for (const code of ['en', 'pt', 'zh']) {
    const response = await request.get(`/samples/${code}.wav`);
    expect(response.status()).toBe(404);
  }
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.listening-card audio')
        .evaluate((element: HTMLAudioElement) => element.currentSrc),
    )
    .toContain('/samples/conversations/');
});
