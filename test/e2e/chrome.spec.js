import { test, expect } from '@playwright/test';
import { openNewCanvas, signIn, testEmail, waitLoaded } from './helpers.js';

test('a section opens in the focus modal, is editable there, and returns on close', async ({ page }) => {
  await openNewCanvas(page, testEmail('focus'));
  await page.locator('#kp h2 img').click();
  const modal = page.locator('#focus-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#ekp')).toBeVisible();
  // A short entry fits without a scroll bar, and the section icon sits top right.
  const slot = modal.locator('#focus-slot');
  expect(await slot.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  const icon = await modal.locator('#focus-title img').boundingBox();
  const bar = await modal.locator('.focus-bar').boundingBox();
  expect(icon.x + icon.width).toBeGreaterThan(bar.x + bar.width - 4);
  await page.keyboard.type('focused');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('#kp #ekp')).toContainText('focused');
});

test('row spacing grows into spare room and tightens instead of overflowing', async ({ page }) => {
  await openNewCanvas(page, testEmail('rowgap'));
  // --row-gap is written in em
  const gapOf = (sel) => page.locator(sel).evaluate(el => parseFloat(el.style.getPropertyValue('--row-gap')));

  // Grid: a few rows in a roomy section get the full extra 1em.
  await page.locator('#ekp').click();
  for (const line of ['one', 'two', 'three']) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
  await expect.poll(() => gapOf('#ekp .canvas-list')).toBeGreaterThan(0.9);

  // Focus view: same, and it never scrolls just because of the spacing.
  await page.locator('#kp h2 img').click();
  await expect(page.locator('#focus-modal')).toBeVisible();
  const slot = page.locator('#focus-modal #focus-slot');
  const fits = () => slot.evaluate(el => el.scrollHeight <= el.clientHeight);
  await expect.poll(() => gapOf('#focus-slot .canvas-list')).toBeGreaterThan(0.9);
  expect(await fits()).toBe(true);

  for (let i = 0; i < 25; i++) {
    await page.keyboard.type(`row ${i}`);
    await page.keyboard.press('Enter');
  }
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const gap = await gapOf('#focus-slot .canvas-list');
  expect(gap).toBeLessThan(1);
  // Either it fits with some extra spacing, or spacing is back to normal.
  if (!(await fits())) expect(gap).toBe(0);
});

test('help opens from the menu', async ({ page }) => {
  await openNewCanvas(page, testEmail('help'));
  await page.locator('#menu-btn').click();
  await page.locator('#help').click();
  const usage = page.locator('#usage');
  await expect(usage).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Using the Mission Model Canvas' })).toBeVisible();
  // Done stays reachable however long the dialog is
  await expect(page.locator('#usage-close')).toBeInViewport();
  // Clicking inside the dialog's padding keeps it open; the backdrop closes it
  const box = await usage.boundingBox();
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(usage).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(usage).toBeHidden();
});

test('a backdrop click does not close the name-version form', async ({ page }) => {
  await openNewCanvas(page, testEmail('keepopen'));
  await page.locator('#menu-btn').click();
  await page.locator('#name-version-btn').click();
  await page.locator('#version-name').fill('half-typed');
  await page.mouse.click(2, 2);
  await expect(page.locator('#name-version-modal')).toBeVisible();
  await expect(page.locator('#version-name')).toHaveValue('half-typed');
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

test('contributors lists the person who typed', async ({ page }) => {
  await openNewCanvas(page, testEmail('contrib'));
  await page.locator('#ekp').click();
  await page.keyboard.type('hello world');
  await page.waitForTimeout(5000); // edit credits flush 4s after typing pauses
  await page.locator('#menu-btn').click();
  await page.locator('#metrics-btn').click();
  await expect(page.locator('#metrics-modal')).toBeVisible();
  await expect(page.locator('#metrics-leaderboard li')).toHaveCount(1);
  await expect(page.locator('#metrics-leaderboard li')).toContainText('contrib');
});

test('the contributor setting bars every section (grey if unauthored), not the title', async ({ page }) => {
  await openNewCanvas(page, testEmail('contribbar'));
  await page.locator('#ekp').click();
  await page.keyboard.type('hello world');
  await page.locator('#title').click();
  await page.keyboard.type('named');
  await page.waitForTimeout(5000); // edit credits flush 4s after typing pauses
  await page.locator('#menu-btn').click();
  await page.locator('#settings-btn').click();
  await page.locator('#pref-highlight-contributors').check();
  await expect(page.locator('#kp')).toHaveClass(/contributor-highlighted/);
  const bar = await page.locator('#kp').evaluate((el) => el.style.getPropertyValue('--contrib-bar'));
  expect(bar).toContain('0.00% 100.00%');
  const unauthored = await page.locator('#ka').evaluate((el) => el.style.getPropertyValue('--contrib-bar'));
  expect(unauthored).toContain('--darkgrey');
  await expect(page.locator('.contributor-highlighted')).toHaveCount(9);
  await expect(page.locator('header .contributor-highlighted')).toHaveCount(0);
});

test('right-clicking a bullet opens the style popup, and a chosen colour survives reload', async ({ page }) => {
  await openNewCanvas(page, testEmail('popup'));
  await page.locator('#ekp').click();
  await page.keyboard.type('coloured line');
  const li = page.locator('#ekp li').first();
  await li.click({ button: 'right', position: { x: 4, y: 8 } });
  const popup = page.locator('.bullet-popup');
  await expect(popup).toBeVisible();
  const swatch = popup.locator('.bullet-swatch-btn:not(.clear-swatch)').first();
  const colour = await swatch.getAttribute('data-color');
  await swatch.click();
  await expect(popup).toBeHidden();
  await expect(li).toHaveAttribute('data-color', colour);
  await page.waitForTimeout(3000); // let the debounced save flush
  await page.reload();
  await expect(page.locator('#ekp li').first()).toHaveAttribute('data-color', colour);
});

test('dragging a bullet onto another line links them, and the link survives reload', async ({ page }) => {
  await openNewCanvas(page, testEmail('link'));
  await page.locator('#ekp').click();
  await page.keyboard.type('partner');
  await page.locator('#eka').click();
  await page.keyboard.type('activity');
  const source = page.locator('#ekp li').first();
  const target = page.locator('#eka li').first();
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  await page.mouse.move(s.x + 4, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + 30, s.y + s.height / 2, { steps: 5 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
  await page.mouse.up();
  const assoc = await source.getAttribute('data-assoc');
  expect(assoc).toBeTruthy();
  await expect(target).toHaveAttribute('data-assoc', assoc);
  await page.waitForTimeout(3000); // let the debounced save flush
  await page.reload();
  await expect(page.locator('#ekp li').first()).toHaveAttribute('data-assoc', assoc);
  await expect(page.locator('#eka li').first()).toHaveAttribute('data-assoc', assoc);
});

test('a canvas that cannot be loaded stops loading and says so', async ({ page }) => {
  await signIn(page, testEmail('missing'));
  await page.goto('/canvas/doesNotExist123');
  await waitLoaded(page);
  const toast = page.locator('.toast-error');
  await expect(toast).toContainText(/access to this canvas|doesn't exist/);
  await expect(toast.getByRole('button', { name: 'Your canvases' })).toBeVisible();
});
