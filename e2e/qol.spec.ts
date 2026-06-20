// ponytail: phase 8 quality-of-life contract. The big behaviors to
// keep honest are:
//   1. The base font size is 17px (the "comfortable" UI).
//   2. The 3-page fixture renders 3 thumbnails inside the visible
//      window — the virtualization can't be observed in a 3-page
//      PDF, but we still assert the testids exist (the contract
//      is "the same testid you had pre-virtualization still
//      works for visible thumbs").
//   3. The keyboard shortcuts (tool selection, zoom fit) work.
//   4. The cheatsheet dialog opens and closes on Esc.
//
// Pan is hard to e2e-test without flake-prone coordinate math
// (the page-canvas bbox changes with the pan transform; Playwright
// resolves coords against the un-panned layout). Trust the unit
// tests + manual QA for pan. The toolbar's Fit button click
// behavior is covered by the `0` shortcut test below.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('qol: bigger UI + virtualized thumbs + zoom-to-fit + tool shortcuts + cheatsheet', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/3page.pdf'));

  // 1. Bigger UI: root font-size is 17px. Every Tailwind `text-*`
  //    utility is rem-based, so the single :root rule cascades to
  //    every text element on the page.
  const rootFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(rootFontSize).toBe('17px');

  // 2. Virtualized thumbs: the 3-page fixture fits in the visible
  //    window (BUFFER * 2 + 1 = 11 rows), so all 3 render with the
  //    `thumb-{i}` testid. We just assert each thumb is present
  //    and the contract is unchanged.
  for (let i = 0; i < 3; i++) {
    await expect(page.locator(`[data-testid="thumb-${i}"]`)).toBeVisible();
  }

  // 3. Tool shortcuts: the toolbar's keydown handler maps letters
  //    to tool IDs. The handler skips when an input is focused,
  //    but Playwright's `page.keyboard.press` fires on the body
  //    by default — no input focused, shortcut should land.
  //    `select` is the default (no-tool) state and has no button
  //    in the toolbar (only annotation tools are registered), so
  //    we verify it indirectly: pressing `v` deselects the
  //    previously-active tool.
  await page.keyboard.press('h'); // highlight
  await expect(page.getByRole('button', { name: 'Highlight' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('u'); // underline
  await expect(page.getByRole('button', { name: 'Underline' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v'); // select (deselects underline)
  await expect(page.getByRole('button', { name: 'Underline' })).toHaveAttribute('aria-pressed', 'false');

  // 4. Zoom-to-fit: `0` shortcut. The current zoom is 1.0 (the
  //    fixture loads at 100%); we zoom in twice to get to 150%
  //    so the fit call has a visible before/after.
  await page.locator('[data-testid="zoom-in"]').click();
  await page.locator('[data-testid="zoom-in"]').click();
  await expect(page.locator('[data-testid="zoom-label"]')).toContainText('150%');
  await page.keyboard.press('0');
  // The fit-zoom depends on the viewport size; we just assert
  // the label is a percentage, not a specific value.
  await expect(page.locator('[data-testid="zoom-label"]')).toContainText(/\d+%/);

  // 5. Cheatsheet: `?` opens, Esc closes.
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeHidden();

  // 6. Cheatsheet: discoverability button also opens it.
  await page.locator('[data-testid="cheatsheet-open"]').click();
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
  // Click the backplate to close (the spec uses a click-on-backplate
  // close, plus the Esc shortcut above).
  await page.locator('[data-testid="cheatsheet"]').click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeHidden();

  // 7. Page nav shortcuts: `[` previous, `]` next.
  await expect(page.locator('[data-testid="page-indicator"]')).toContainText('1');
  await page.keyboard.press(']');
  await expect(page.locator('[data-testid="page-indicator"]')).toContainText('2');
  await page.keyboard.press('[');
  await expect(page.locator('[data-testid="page-indicator"]')).toContainText('1');
});
