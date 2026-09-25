import { test, expect } from '@playwright/test';
import { openNewCanvas, testEmail } from './helpers.js';

test('a new user landing on / gets a fresh canvas, with the sign-in card hidden', async ({ page }) => {
  await openNewCanvas(page, testEmail('smoke'));
  await expect(page.locator('#login-gate')).toBeHidden();
  await expect(page.locator('#ekp')).toBeVisible();
});
