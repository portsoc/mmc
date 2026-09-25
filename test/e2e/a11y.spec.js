import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openNewCanvas, testEmail } from './helpers.js';

test('a loaded canvas has no axe violations', async ({ page }) => {
  await openNewCanvas(page, testEmail('a11y'));
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});

test('menu, help and focus view all work from the keyboard', async ({ page }) => {
  await openNewCanvas(page, testEmail('a11y-kb'));
  const focusedId = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

  // Menu: Enter opens it and moves focus inside; Escape closes it and returns focus.
  await page.locator('#menu-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app-menu')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('app-menu').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-menu')).toBeHidden();
  expect(await focusedId()).toBe('menu-btn');

  // Help from the menu by keyboard, closed with Escape.
  await page.keyboard.press('Enter');
  await page.locator('#app-menu .app-menu-item', { hasText: 'Help' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#usage')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#usage')).toBeHidden();

  // Focus view: Enter on a section icon opens it, typing goes in, Escape closes.
  await page.locator('#kp h2 img').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#focus-modal')).toBeVisible();
  await page.keyboard.type('typed by keyboard');
  await page.keyboard.press('Escape');
  await expect(page.locator('#focus-modal')).toBeHidden();
  await expect(page.locator('#kp')).toContainText('typed by keyboard');
});

test('a loaded canvas has no axe violations in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openNewCanvas(page, testEmail('a11y-dark'));
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
