import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('series, recorder and editor pass automated accessibility checks in every locale', async ({
  page,
}) => {
  await page.goto('/');
  for (const locale of ['en', 'pt', 'zh']) {
    await page.locator('.site-language select').selectOption(locale);
    for (const state of ['series', 'recorder', 'editor']) {
      if (state === 'recorder') await page.locator('.start-series').click();
      if (state === 'editor') await page.locator('.sample-button').click();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        result.violations,
        `${locale}/${state}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })))}`,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerWidth),
      );
    }
    await page.keyboard.press('Escape');
    await page.locator('.discard-notice .primary-button').click();
  }
});
