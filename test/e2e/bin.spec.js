import { test, expect } from '@playwright/test';
import { openNewCanvas, testEmail, waitLoaded } from './helpers.js';

test('owner bins a canvas (read-only while binned), restores it, then empties the bin', async ({ page }) => {
  const path = await openNewCanvas(page, testEmail('bin'));
  const cardFor = (list) => page.locator(`${list} .canvas-card:has(a[href="${path}"])`);

  await page.goto('/canvases');
  await cardFor('#canvas-list-items').locator('.canvas-card-delete').click();
  await expect(page.locator('#canvas-bin-count')).toHaveText('1');

  await page.goto(path);
  await waitLoaded(page);
  await expect(page.locator('#bin-notice')).toBeVisible();
  await expect(page.locator('#ekp [contenteditable="true"]')).toHaveCount(0);

  await page.goto('/canvases');
  await page.locator('#canvas-bin summary').click();
  await cardFor('#canvas-bin-items').locator('.canvas-card-restore').click();
  await expect(cardFor('#canvas-list-items')).toHaveCount(1);
  await expect(page.locator('#canvas-bin-count')).toHaveText('0');

  await cardFor('#canvas-list-items').locator('.canvas-card-delete').click();
  page.once('dialog', (d) => d.accept());
  await page.locator('#canvas-bin-empty').click();
  await expect(page.locator('#canvas-bin-count')).toHaveText('0');
  await page.reload();
  await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
});
