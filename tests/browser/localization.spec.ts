import { test, expect } from '@playwright/test';
import pt from '../../locales/pt.json' with { type: 'json' };
import zh from '../../locales/zh.json' with { type: 'json' };

test.use({ locale: 'pt-BR' });

test('generated app catalogs render throughout the editor, persist the choice and make no provider requests', async ({
  page,
}) => {
  const providerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('api-integration.ollang.com')) providerRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
  for (const [language, catalog] of [
    ['pt', pt],
    ['zh', zh],
  ] as const) {
    await page.locator('.site-language select').selectOption(language);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(catalog.headline);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(catalog.headlineAccent);
    await expect(page.locator('.series-meta')).not.toContainText('{{');
    await page.locator('.start-series').click();
    await expect(
      page.getByRole('button', { name: catalog.closeRecorder, exact: true }),
    ).toBeVisible();
    await page.locator('.sample-button').click();
    await page
      .getByRole('button', { name: catalog['recorder.editor.edit_audio'], exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: catalog['recorder.editor.trim'], exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: catalog['recorder.editor.cut'], exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: catalog['recorder.editor.volume_mode'], exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText('{{');
    await page.getByRole('button', { name: catalog.closeRecorder, exact: true }).click();
    await page.getByRole('button', { name: catalog.discard, exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(
      page.getByRole('heading', { name: catalog.allStories, exact: true }),
    ).toBeVisible();
  }
  expect(providerRequests).toEqual([]);
});
