import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openNewCanvas, testEmail } from './helpers.js';

test('a loaded canvas has no axe violations', async ({ page }) => {
  await openNewCanvas(page, testEmail('a11y'));
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
