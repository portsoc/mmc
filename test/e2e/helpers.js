import { expect } from '@playwright/test';

/** Signs a fresh browser context in to the Auth emulator as `email`, then
 * reloads so the app starts up signed in, as it would after Google's redirect. */
export async function signIn(page, email, name = email.split('@')[0]) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__mmcTestSignIn === 'function');
  await page.evaluate(([e, n]) => window.__mmcTestSignIn(e, n), [email, name]);
}

/** A unique email per test, so tests never see each other's canvases. */
export function testEmail(label) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function waitLoaded(page) {
  await expect(page.locator('#app-root')).not.toHaveAttribute('data-loading', /.*/, { timeout: 15000 });
}

/** Opens `/` signed in and lands on the user's (new) canvas. Returns its path. */
export async function openNewCanvas(page, email) {
  await signIn(page, email);
  await page.goto('/');
  await page.waitForURL(/\/canvas\/[^/]+/, { timeout: 15000 });
  await waitLoaded(page);
  return new URL(page.url()).pathname;
}
