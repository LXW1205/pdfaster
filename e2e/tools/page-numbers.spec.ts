import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('page-numbers: format "n-of-m" stamps "1 / 3", "2 / 3", "3 / 3" on every page, all extractable', async ({ page }) => {
  await page.goto('/tools/page-numbers');
  await expect(page.getByRole('heading', { name: 'Add page numbers' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // Page count renders.
  await expect(page.locator('[data-testid="page-numbers-info"]')).toContainText('3 pages');

  // Pick the "n-of-m" format ("1 / N" in the UI).
  await page.getByLabel(/format/i).selectOption('n-of-m');

  // Click the action, wait for the download button, then click it to
  // trigger the download (the action only sets `result`; the
  // download button is what fires the actual file download).
  await page.locator('[data-testid="page-numbers-action"]').click();
  const downloadBtn = page.locator('[data-testid="page-numbers-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-pagenumbers-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/numbered\.pdf$/);

  // Re-open via /test/inspect. drawText emits a text-showing op so
  // the page numbers ARE extractable.
  const fileUrl = '/__test__/numbered.pdf';
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
  expect(result.pageCount).toBe(3);
  expect(result.text).toContain('1 / 3');
  expect(result.text).toContain('2 / 3');
  expect(result.text).toContain('3 / 3');
  // The original page labels are still extractable.
  expect(result.text).toContain('Page 1');
  expect(result.text).toContain('Page 2');
  expect(result.text).toContain('Page 3');

  fs.unlinkSync(out);
});
