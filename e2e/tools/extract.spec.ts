import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('extract: drop 3-page PDF, check pages 1 and 3, output is a 2-page PDF with "Page 1" and "Page 3" (not "Page 2")', async ({ page }) => {
  await page.goto('/tools/extract');
  await expect(page.getByRole('heading', { name: 'Extract pages' })).toBeVisible();

  // Drop the 3-page fixture.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // Check the rows for Page 1 and Page 3.
  // Each row has an aria-label like "Select page 1" / "Select page 3" on the checkbox / row.
  await page.getByRole('checkbox', { name: /select page 1/i }).check();
  await page.getByRole('checkbox', { name: /select page 3/i }).check();

  // Click Extract.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="extract-action"]').click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-extract-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(download.suggestedFilename()).toMatch(/extracted\.pdf$/);
  expect(fs.statSync(out).size).toBeGreaterThan(0);

  // Re-open via the inspect page and verify content.
  await page.route('**/__test__/extracted.pdf', async (route) => {
    await route.fulfill({ body: fs.readFileSync(out), contentType: 'application/pdf' });
  });
  await page.goto(`/test/inspect?file=${encodeURIComponent('/__test__/extracted.pdf')}`);
  await page.waitForFunction(() => (window as unknown as { __pdfaster?: unknown }).__pdfaster !== undefined, { timeout: 30_000 });
  type InspectResult = { ok: true; pageCount: number; text: string } | { ok: false; error: string };
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.pageCount).toBe(2);
  expect(result.text).toContain('Page 1');
  expect(result.text).toContain('Page 3');
  expect(result.text).not.toContain('Page 2');

  fs.unlinkSync(out);
});

test('extract: range input "1, 3" applies the same selection as checking pages 1 and 3', async ({ page }) => {
  await page.goto('/tools/extract');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // Type the range spec, click Apply, then click Extract.
  await page.getByLabel(/ranges?/i).fill('1, 3');
  await page.getByRole('button', { name: /^apply$/i }).click();

  // Verify the page-1 and page-3 checkboxes are now checked.
  await expect(page.getByRole('checkbox', { name: /select page 1/i })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /select page 2/i })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /select page 3/i })).toBeChecked();

  // Download + verify the same as above (kept brief; the main test
  // already verifies the export roundtrip).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="extract-action"]').click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-extract-ranges-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/extracted\.pdf$/);

  fs.unlinkSync(out);
});
