import { test, expect } from '@playwright/test';
import { openNewCanvas, testEmail, waitLoaded } from './helpers.js';

test('a new user landing on / gets a fresh canvas, with the sign-in card hidden', async ({ page }) => {
  await openNewCanvas(page, testEmail('smoke'));
  await expect(page.locator('#login-gate')).toBeHidden();
  await expect(page.locator('#ekp')).toBeVisible();
});

test('line breaks, including blank lines, survive a reload', async ({ page }) => {
  await openNewCanvas(page, testEmail('newlines'));
  await page.locator('#ekp').click();
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('third');
  const typed = await page.locator('#ekp').innerText();
  await page.waitForTimeout(3000); // saves flush 2s after typing pauses
  await page.reload();
  await waitLoaded(page);
  expect(typed).toMatch(/first\n\s*\n\s*third/);
  // innerText, not toHaveText: textContent drops the breaks between rows.
  await expect.poll(() => page.locator('#ekp').innerText()).toBe(typed);
});
