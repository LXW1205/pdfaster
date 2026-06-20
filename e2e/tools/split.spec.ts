import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('split: drop 3-page PDF, set range 2-3, extract, output is a 2-page PDF with "Page 2" and "Page 3"', async ({ page }) => {
  await page.goto('/tools/split');
  await expect(page.getByRole('heading', { name: 'Split PDF' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const f = path.resolve(__dirname, '..', 'fixtures', '3page.pdf');
  await fileInput.setInputFiles(f);

  // Page count is derived and the inputs render with the right range.
  await expect(page.getByText('3 pages')).toBeVisible();
  await expect(page.locator('[data-testid="split-from"]')).toHaveValue('1');
  await expect(page.locator('[data-testid="split-to"]')).toHaveValue('3');

  // Set the range: 2-3.
  await page.locator('[data-testid="split-from"]').fill('2');
  await page.locator('[data-testid="split-to"]').fill('3');

  // Click extract, wait for the download button to appear.
  await page.locator('[data-testid="split-action"]').click();
  const downloadBtn = page.locator('[data-testid="split-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-split-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/split\.pdf$/);

  // Re-open via /test/inspect to verify the page count and text.
  const fileUrl = '/__test__/split.pdf';
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
  expect(result.text).toContain('Page 2');
  expect(result.text).toContain('Page 3');
  expect(result.text).not.toContain('Page 1');

  fs.unlinkSync(out);
});
