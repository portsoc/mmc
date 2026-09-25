import { test, expect } from '@playwright/test';
import { openNewCanvas, signIn, testEmail, waitLoaded } from './helpers.js';

async function openShare(page) {
  await page.locator('#menu-btn').click();
  await page.locator('#share-btn').click();
  await expect(page.locator('#share-modal')).toBeVisible();
}

test('an invited editor and the owner see each other type live', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const path = await openNewCanvas(owner, testEmail('owner'));

  await openShare(owner);
  await owner.locator('#invite-role').selectOption('editor');
  await owner.locator('#invite-send').click();
  const inviteUrl = await expect.poll(() => owner.locator('#invite-url').inputValue()).toMatch(/\/invite\//)
    .then(() => owner.locator('#invite-url').inputValue());
  await owner.locator('#share-close').click();

  const editor = await (await browser.newContext()).newPage();
  await signIn(editor, testEmail('editor'));
  await editor.goto(new URL(inviteUrl).pathname);
  await editor.waitForURL(`**${path}`);
  await waitLoaded(editor);

  await owner.locator('#ekp').click();
  await owner.keyboard.type('from owner');
  await expect(editor.locator('#ekp')).toContainText('from owner', { timeout: 10000 });

  await editor.locator('#eka').click();
  await editor.keyboard.type('from editor');
  await expect(owner.locator('#eka')).toContainText('from editor', { timeout: 10000 });
});

test('a public read-only link shows the text to a signed-out visitor, who cannot edit', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await openNewCanvas(owner, testEmail('owner'));
  await owner.locator('#ekp').click();
  await owner.keyboard.type('visible to the public');
  await owner.waitForTimeout(3000); // saved copy flushes 2s after typing pauses

  await openShare(owner);
  await owner.locator('#share-public-toggle').check();
  const viewUrl = await owner.locator('#share-readonly-url').inputValue();
  expect(viewUrl).toMatch(/\/view\//);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(new URL(viewUrl).pathname);
  await waitLoaded(visitor);
  await expect(visitor.locator('#ekp')).toContainText('visible to the public', { timeout: 10000 });
  await expect(visitor.locator('#ekp [contenteditable="true"]')).toHaveCount(0);
});
