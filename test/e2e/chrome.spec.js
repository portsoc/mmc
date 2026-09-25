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
