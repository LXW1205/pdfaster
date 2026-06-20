import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('watermark: stamp "DRAFT" on every page, output text contains DRAFT 3 times', async ({ page }) => {
  await page.goto('/tools/watermark');
  await expect(page.getByRole('heading', { name: 'Watermark PDF' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // Default text is "DRAFT"; the test overrides to be explicit.
  await page.getByLabel(/text/i).fill('DRAFT');

  // Click the action, wait for the download button, then click it to
  // trigger the download (the action only sets `result`; the
  // download button is what fires the actual file download).
  await page.locator('[data-testid="watermark-action"]').click();
  const downloadBtn = page.locator('[data-testid="watermark-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-watermark-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/watermarked\.pdf$/);

  // Re-open via /test/inspect. drawText emits a text-showing op so
  // the watermark IS extractable — count "DRAFT" across all pages.
  const fileUrl = '/__test__/watermarked.pdf';
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
  const draftCount = (result.text.match(/DRAFT/g) ?? []).length;
  expect(draftCount).toBe(3);
  // The original page labels are still extractable.
  expect(result.text).toContain('Page 1');
  expect(result.text).toContain('Page 2');
  expect(result.text).toContain('Page 3');

  fs.unlinkSync(out);
});
