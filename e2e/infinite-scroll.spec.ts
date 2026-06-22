// ponytail: the 30th e2e. Infinite scroll triggers on the sentinel
// entering the viewport (200px rootMargin = head start). With
// initialCount=20 and a 30-page doc, scrolling to the bottom loads
// the remaining 10 in one batch. The assertion order matters: the
// 20-row check first confirms the initial window, then the scroll
// + 30-row check confirms the observer fired + React committed the
// next batch. 5s timeout is the CI flakiness buffer.
//
// The scroll target is the WINDOW, not the <ul>: the page-list
// <ul> is inline content with no overflow, so the page itself
// scrolls. The observer's default root is the viewport, so
// scrolling the document is what brings the sentinel into view.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('infinite scroll: 30-page PDF renders 20 rows initially, scroll loads the next 10', async ({ page }) => {
  await page.goto('/tools/reorder');
  await expect(page.getByRole('heading', { name: 'Reorder pages' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/30page.pdf'));

  // Wait for the list.
  const list = page.getByRole('list', { name: /pages/i });
  await expect(list).toBeVisible();

  // Initial window: 20 rows.
  await expect(list.getByRole('listitem')).toHaveCount(20);

  // No "Show more" button (it's infinite scroll, not explicit).
  await expect(page.getByRole('button', { name: /show more|load more/i })).toHaveCount(0);

  // Scroll the page to the bottom (the <ul> is inline content; the
  // document scrolls, not the list). The sentinel sits at the end
  // of the <ul>; bringing it into the viewport fires the observer.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  // Wait for the next batch — 30 total.
  await expect(list.getByRole('listitem')).toHaveCount(30, { timeout: 5_000 });
});
