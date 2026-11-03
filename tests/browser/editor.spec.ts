import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fixture } from '../helpers';

async function openDraft(page: Page) {
  await page.goto('/');
  await page.locator('.start-series').click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: fixture(4) });
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
}
async function saveAudio(page: Page, request: APIRequestContext, apply: boolean) {
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/clips') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  if (apply) await page.getByRole('button', { name: 'Apply and save', exact: true }).click();
  const clip = (await (await saved).json()) as { audioUrl: string };
  return (await request.get(clip.audioUrl)).body();
}

test('remove selection and volume edits produce the exact saved audio with a single undo step', async ({
  page,
  request,
}) => {
  await openDraft(page);
  await page.getByRole('button', { name: 'Remove selection', exact: true }).click();
  await page.getByRole('slider', { name: 'Selection start' }).fill('1000');
  await page.getByRole('slider', { name: 'Selection end' }).fill('2000');
  await page.getByRole('button', { name: 'Cut this section' }).click();
  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await page.getByRole('dialog').getByRole('slider', { name: 'Volume', exact: true }).fill('50');
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await page.getByRole('button', { name: 'Apply and continue' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const body = await saveAudio(page, request, false);
  expect(body.length).toBe(44 + 3 * 96000);
  expect(body.readInt16LE(44 + 48000 * 2)).toBeCloseTo(4096, -1);
});

test('fade preview, instant undo, apply/discard and save preserve the selected version', async ({
  page,
  request,
}) => {
  await openDraft(page);
  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await page.getByRole('button', { name: 'Gradual', exact: true }).click();
  await page.getByRole('button', { name: 'Fade out', exact: true }).click();
  await page.getByRole('button', { name: 'Play your clip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset volume', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Gradual', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Start volume' })).toHaveValue('100');
  await expect(page.getByRole('slider', { name: 'End volume' })).toHaveValue('100');
  await page.getByRole('button', { name: 'Fade in', exact: true }).click();
  await page.getByRole('button', { name: 'Keep selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to editing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('slider', { name: 'Start volume' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await page.getByRole('button', { name: 'Discard and continue' }).click();
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await page.getByRole('button', { name: 'Gradual', exact: true }).click();
  await page.getByRole('button', { name: 'Fade in', exact: true }).click();
  const body = await saveAudio(page, request, true);
  expect(body.length).toBe(44 + 4 * 96000);
  expect(body.readInt16LE(44)).toBe(0);
  expect(body.readInt16LE(44 + 2 * 48000 * 2)).toBeCloseTo(4096, -1);
});

test('failed replacement and cancelled source switch preserve edits; save failure remains retryable', async ({
  page,
}) => {
  await openDraft(page);
  await page.getByRole('slider', { name: 'Selection start' }).fill('1000');
  await page.getByRole('button', { name: 'Apply trim' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') });
  await expect(page.locator('.notice')).toContainText('could not read');
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await page.getByRole('tab', { name: 'Record', exact: true }).click();
  await page.getByRole('button', { name: 'Back to editing' }).click();
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  const ids: string[] = [];
  await page.route('**/api/clips', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ids.push(route.request().headers()['x-submission-id']!);
    if (ids.length === 1) return route.fulfill({ status: 503, body: '{}' });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('could not be saved');
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test('keep recording appends a second take and undo removes only that take', async ({ page }) => {
  await page.goto('/');
  await page.locator('.start-series').click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.locator('[class*=timer]')).toContainText('0:02');
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  const first = Number(await page.getByRole('slider', { name: 'Selection end' }).inputValue());
  await page.getByRole('button', { name: 'Keep recording' }).click();
  await expect(page.getByRole('button', { name: 'Pause recording' })).toBeVisible();
  await expect(page.locator('[class*=timer]')).toContainText('0:04');
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  const second = Number(await page.getByRole('slider', { name: 'Selection end' }).inputValue());
  expect(second).toBeGreaterThan(first + 1000);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Selection end' })).toHaveValue(String(first));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Selection end' })).toHaveValue(String(second));
});

test('requested typography and labeled borderless controls remain accessible while editing', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  await expect(page.getByText('A conversation, one clip at a time.', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: 'All stories', exact: true })).toBeVisible();
  const captionLayout = await page.locator('.playback-captions').evaluate((element) => {
    const caption = element.querySelector('.caption')!;
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(caption).lineHeight),
    };
  });
  expect(captionLayout.height).toBeGreaterThanOrEqual(3 * captionLayout.lineHeight + 28);
  for (const selector of ['.hero p', '.library-heading h2', '.library-heading > span']) {
    const size = await page
      .locator(selector)
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(size).toBeCloseTo(17.3333, 2);
  }
  await expect(page.locator('.voice-toolbar')).toContainText('Recorded in');
  await expect(page.locator('.voice-toolbar')).toContainText('Listen in');
  await expect(page.locator('.voice-toolbar')).toContainText('Subtitles in');
  await expect(
    page.getByRole('combobox', { name: 'Audio language' }).locator('option:checked'),
  ).toHaveText('English');
  await page.locator('.start-series').click();
  await page.locator('.sample-button').click();
  await page.getByRole('button', { name: 'Edit audio', exact: true }).click();
  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await page.getByRole('button', { name: 'Gradual', exact: true }).click();
  const borders = await page
    .locator('.recorder-dialog button,.recorder-dialog input')
    .evaluateAll((elements) =>
      elements
        .filter((element) => parseFloat(getComputedStyle(element).borderWidth) > 0)
        .map((element) => element.getAttribute('aria-label') || element.textContent),
    );
  expect(borders).toEqual([]);
  await page.getByRole('slider', { name: 'End volume', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Fade in', exact: true })).toBeFocused();
  expect(
    await page
      .getByRole('button', { name: 'Fade in', exact: true })
      .evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Fade in', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('undo discards pending cuts before applied history and redo restores the edit', async ({
  page,
}) => {
  await openDraft(page);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await page.getByRole('slider', { name: 'Selection end' }).fill('3000');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('.editor-history')).toContainText('0:04');
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await page.getByRole('button', { name: 'Remove selection', exact: true }).click();
  await page.getByRole('slider', { name: 'Selection start' }).fill('500');
  await page.getByRole('slider', { name: 'Selection end' }).fill('1500');
  await expect(page.locator('.editor-history')).toContainText('0:02');
  await undo.click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await undo.click();
  await expect(page.locator('.editor-history')).toContainText('0:04');
  await redo.click();
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await page.getByRole('dialog').getByRole('slider', { name: 'Volume', exact: true }).fill('50');
  await undo.click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(
    page.getByRole('dialog').getByRole('slider', { name: 'Volume', exact: true }),
  ).toHaveValue('100');
  await expect(page.locator('.editor-history')).toContainText('0:03');
  await redo.click();
  await expect(
    page.getByRole('dialog').getByRole('slider', { name: 'Volume', exact: true }),
  ).toHaveValue('50');
});

test('continuation CTA sits below playback and upload/menu colors have explicit contrast', async ({
  page,
}) => {
  await page.goto('/');
  const continuation = page.getByRole('button', {
    name: 'Add a clip to continue the series',
    exact: true,
  });
  await expect(page.locator('.series-heading button')).toHaveCount(0);
  const controls = await page.locator('.player-bottom').boundingBox();
  const cta = await continuation.boundingBox();
  expect(cta!.y).toBeGreaterThanOrEqual(controls!.y + controls!.height);
  const colors = await page.locator('.voice-toolbar option').evaluateAll((elements) =>
    elements.map((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    })),
  );
  expect(colors.length).toBeGreaterThanOrEqual(4);
  for (const color of colors)
    expect(color).toEqual({ color: 'rgb(240, 245, 233)', background: 'rgb(49, 75, 60)' });
  await continuation.click();
  await page.getByRole('tab', { name: 'Upload audio', exact: true }).click();
  await expect(page.locator('.upload-choose')).toHaveText('Choose an audio file');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('imported PCM keeps exact frames when the device default is 44.1 kHz', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const decoded: { rate: number; frames: number }[] = [];
    Object.defineProperty(window, 'decodedImportBuffers', { value: decoded });
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super({ sampleRate: 44100, ...options });
        const decode = this.decodeAudioData.bind(this);
        this.decodeAudioData = async (data: ArrayBuffer) => {
          const buffer = await decode(data);
          decoded.push({ rate: buffer.sampleRate, frames: buffer.length });
          return buffer;
        };
      }
    };
  });
  await openDraft(page);
  const decoded = await page.evaluate(
    () =>
      (window as unknown as { decodedImportBuffers: { rate: number; frames: number }[] })
        .decodedImportBuffers,
  );
  expect(decoded).toContainEqual({ rate: 48000, frames: 4 * 48000 });
  await expect(page.locator('.editor-history')).toContainText('0:04');
  const bytes = await saveAudio(page, request, false);
  expect(bytes.length).toBe(44 + 4 * 96000);
  expect(bytes.readUInt32LE(24)).toBe(48000);
  expect(bytes.readInt16LE(44 + 2 * 48000 * 2)).toBeCloseTo(8192, -1);
});
