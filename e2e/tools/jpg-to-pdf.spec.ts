import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('jpg-to-pdf: drop 2 PNGs, convert, output is a 2-page PDF', async ({ page }) => {
  await page.goto('/tools/jpg-to-pdf');
  await expect(page.getByRole('heading', { name: 'JPG → PDF' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const red = path.resolve(__dirname, '..', 'fixtures', 'red.png');
  const blue = path.resolve(__dirname, '..', 'fixtures', 'blue.png');
  await fileInput.setInputFiles([red, blue]);

  await expect(page.getByText('red.png')).toBeVisible();
  await expect(page.getByText('blue.png')).toBeVisible();

  await page.locator('[data-testid="jpg-to-pdf-action"]').click();
  const downloadBtn = page.locator('[data-testid="jpg-to-pdf-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-jpg-to-pdf-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/images\.pdf$/);

  // Re-open via /test/inspect to verify it's a 2-page PDF.
  const fileUrl = '/__test__/images.pdf';
  await page.route(`**${fileUrl}`, async (route) => {
    const buf = fs.readFileSync(out);
    await route.fulfill({ body: buf, contentType: 'application/pdf' });
  });
  await page.goto(`/test/inspect?file=${encodeURIComponent(fileUrl)}`);
  await page.waitForFunction(
    () => (window as unknown as { __pdfaster?: unknown }).__pdfaster !== undefined,
    { timeout: 30_000 },
  );
  type InspectResult = { ok: true; pageCount: number } | { ok: false; error: string };
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.pageCount).toBe(2);

  fs.unlinkSync(out);
});
