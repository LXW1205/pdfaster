import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('rotate: rotate 90°, output is a 3-page PDF with all "Page N" labels still extractable', async ({ page }) => {
  await page.goto('/tools/rotate');
  await expect(page.getByRole('heading', { name: 'Rotate PDF' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // Page count + current rotation render.
  await expect(page.locator('[data-testid="rotate-info"]')).toContainText('3 pages');
  await expect(page.locator('[data-testid="rotate-info"]')).toContainText('current rotation 0°');

  // Pick 90°.
  await page.getByLabel('90°').check();

  // Click the action, wait for the download button, then click it to
  // trigger the download (the action only sets `result`; the
  // download button is what fires the actual file download).
  await page.locator('[data-testid="rotate-action"]').click();
  const downloadBtn = page.locator('[data-testid="rotate-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-rotate-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/rotated\.pdf$/);

  // Re-open via /test/inspect. pdf.js is rotation-aware; the text
  // content is the same regardless of how the page is rotated.
  const fileUrl = '/__test__/rotated.pdf';
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
  expect(result.text).toContain('Page 1');
  expect(result.text).toContain('Page 2');
  expect(result.text).toContain('Page 3');

  fs.unlinkSync(out);
});
