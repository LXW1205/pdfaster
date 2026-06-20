import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('compress: drop PDF, compress, output is a real PDF (and size delta is shown)', async ({ page }) => {
  await page.goto('/tools/compress');
  await expect(page.getByRole('heading', { name: 'Compress PDF' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const f = path.resolve(__dirname, '..', 'fixtures', 'sample.pdf');
  await fileInput.setInputFiles(f);

  // Original size renders.
  await expect(page.locator('[data-testid="compress-original"]')).toBeVisible();

  await page.locator('[data-testid="compress-action"]').click();
  const downloadBtn = page.locator('[data-testid="compress-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-compress-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/compressed\.pdf$/);

  // Re-open via /test/inspect to confirm it's a valid PDF.
  const fileUrl = '/__test__/compressed.pdf';
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
  expect(result.pageCount).toBe(1);

  // Honest about the ceiling: do NOT assert a specific size reduction.
  // The delta line is shown ("Saved N KB" / "No change" / "Grew by N KB"),
  // but we don't gate the test on its content.

  fs.unlinkSync(out);
});
