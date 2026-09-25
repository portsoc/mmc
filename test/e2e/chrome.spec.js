import { test, expect } from '@playwright/test';
import { openNewCanvas, testEmail } from './helpers.js';

test('a section opens in the focus modal, is editable there, and returns on close', async ({ page }) => {
  await openNewCanvas(page, testEmail('focus'));
  await page.locator('#kp h2 img').click();
  const modal = page.locator('#focus-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#ekp')).toBeVisible();
  await page.keyboard.type('focused');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('#kp #ekp')).toContainText('focused');
});

test('shift-click defocuses a section and typing in it refocuses', async ({ page }) => {
  await openNewCanvas(page, testEmail('defocus'));
  await page.locator('#ka h2').click({ modifiers: ['Shift'] });
  await expect(page.locator('#ka')).toHaveClass(/\blo\b/);
  await page.locator('#eka').click();
  await page.keyboard.type('x');
  await expect(page.locator('#ka')).not.toHaveClass(/\blo\b/);
});

test('help opens from the menu', async ({ page }) => {
  await openNewCanvas(page, testEmail('help'));
  await page.locator('#menu-btn').click();
  await page.locator('#help').click();
  await expect(page.locator('#usage')).toBeVisible();
});

test('a named version appears in history, is shown read-only, and closing returns to live text', async ({ page }) => {
  await openNewCanvas(page, testEmail('history'));
  await page.locator('#ekp').click();
  await page.keyboard.type('before');
  await page.locator('#menu-btn').click();
  await page.locator('#name-version-btn').click();
  await page.locator('#name-version-modal input').first().fill('V1');
  await page.locator('#name-version-save').click();
  await expect(page.locator('#name-version-modal')).toBeHidden();

  await page.locator('#ekp').click();
  await page.keyboard.type(' after');
  await page.locator('#menu-btn').click();
  await page.locator('#history-btn').click();
  const dock = page.locator('#history-dock');
  await expect(dock).toBeVisible();
  await dock.locator('li', { hasText: 'V1' }).click();
  await expect(page.locator('#ekp')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('#ekp')).not.toContainText('after');

  await page.locator('#history-exit').click();
  await expect(dock).toBeHidden();
  await expect(page.locator('#ekp')).toContainText('before after');
  await expect(page.locator('#ekp')).toHaveAttribute('contenteditable', 'plaintext-only');
});
