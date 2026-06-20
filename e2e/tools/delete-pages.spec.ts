import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('delete-pages: drop 3-page PDF, uncheck page 2, save, output is a 2-page PDF without "Page 2"', async ({ page }) => {
  await page.goto('/tools/delete-pages');
  await expect(page.getByRole('heading', { name: 'Delete pages' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const f = path.resolve(__dirname, '..', 'fixtures', '3page.pdf');
  await fileInput.setInputFiles(f);

  // 3 page rows, all checked by default.
  await expect(page.locator('[data-testid="delete-pages-checkbox-0"]')).toBeChecked();
  await expect(page.locator('[data-testid="delete-pages-checkbox-1"]')).toBeChecked();
  await expect(page.locator('[data-testid="delete-pages-checkbox-2"]')).toBeChecked();

  // Uncheck the middle page.
  await page.locator('[data-testid="delete-pages-checkbox-1"]').uncheck();
  await expect(page.locator('[data-testid="delete-pages-checkbox-1"]')).not.toBeChecked();

  // Click the action, wait for the download button.
  await page.locator('[data-testid="delete-pages-action"]').click();
  const downloadBtn = page.locator('[data-testid="delete-pages-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-delete-pages-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/pages-removed\.pdf$/);

  // Re-open via /test/inspect to verify the page count and text.
  const fileUrl = '/__test__/pages-removed.pdf';
  await page.route(`**${fileUrl}`, async (route) => {
    const buf = fs.readFileSync(out);
    await route.fulfill({ body: buf, contentType: 'application/pdf' });
  });
  await page.goto(`/test/inspect?file=${encodeURIComponent(fileUrl)}`);
  await page.waitForFunction(
    () => (window as unknown as { __pdfaster?: unknown }).__pdfaster !== undefined,
    { timeout: 30_000 },
  );
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
