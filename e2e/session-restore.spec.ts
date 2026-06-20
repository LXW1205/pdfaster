// ponytail: session-restore e2e. Auto-save runs at 1500ms
// (debounced). The test must wait long enough for the save to
// fire before navigating away. The restore is NEVER silent — the
// user clicks "Restore" on the prompt, then drops the same file.
// The threat model is a shared computer; the explicit prompt is
// the spec's "good enough" floor.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('session-restore: draw, navigate away, return, prompt appears, restore brings the annotation back', async ({ page }) => {
  await page.goto('/editor');
  const samplePdf = path.resolve(__dirname, 'fixtures/sample.pdf');
  await page.locator('input[type="file"]').setInputFiles(samplePdf);

  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();

  // Draw a highlight so there's something to restore.
  await page.getByRole('button', { name: 'Highlight' }).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas box');
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="annotation-highlight"]')).toHaveCount(1);

  // Wait for the debounced auto-save (1500ms) to fire.
  await page.waitForTimeout(2000);

  // Navigate away (clears the editor route's UI; the IndexedDB
  // record stays). Then navigate back.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /never leaves your browser/i })).toBeVisible();
  await page.goto('/editor');

  // The restore prompt appears. NEVER silent.
  const prompt = page.locator('[data-testid="restore-prompt"]');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('sample.pdf');

  // Accept.
  await page.locator('[data-testid="restore-accept"]').click();
  await expect(prompt).not.toBeVisible();

  // The drop zone now hints at the original file name.
  await expect(page.locator('[data-testid="editor-drop-hint"]')).toContainText('sample.pdf');

  // Drop the same file. The annotation should come back.
  await page.locator('input[type="file"]').setInputFiles(samplePdf);
  await expect(page.locator('[data-testid="annotation-highlight"]')).toHaveCount(1);

  // Cleanup: close the editor so the IndexedDB record is dropped
  // before the next test runs.
  await page.locator('[data-testid="editor-close"]').click();
});
