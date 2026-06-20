import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('crop: trim 36pt from every edge, output page is 540×720pt and text is preserved', async ({ page }) => {
  await page.goto('/tools/crop');
  await expect(page.getByRole('heading', { name: 'Crop PDF' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // 3page fixture is 612×792.
  await expect(page.locator('[data-testid="crop-info"]')).toContainText('612 × 792 pt');

  // Set the margin to 36.
  await page.getByLabel(/trim/i).fill('36');

  // Click the action, wait for the download button, then click it to
  // trigger the download (the action only sets `result`; the
  // download button is what fires the actual file download).
  await page.locator('[data-testid="crop-action"]').click();
  const downloadBtn = page.locator('[data-testid="crop-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-crop-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/cropped\.pdf$/);

  // Re-open via /test/inspect. WorkerCheckPage reports per-page
  // natural size via `pageSizes`; the crop test asserts the new
  // MediaBox dimensions.
  const fileUrl = '/__test__/cropped.pdf';
  await page.route(`**${fileUrl}`, async (route) => {
    const buf = fs.readFileSync(out);
    await route.fulfill({ body: buf, contentType: 'application/pdf' });
  });
  await page.goto(`/test/inspect?file=${encodeURIComponent(fileUrl)}`);
  await page.waitForFunction(
    () => (window as unknown as { __pdfaster?: unknown }).__pdfaster !== undefined,
    { timeout: 30_000 },
  );
  type InspectResult =
    | {
        ok: true;
        pageCount: number;
        text: string;
        pageSizes: { w: number; h: number }[];
      }
    | { ok: false; error: string };
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.pageCount).toBe(3);
  // 612 − 2×36 = 540, 792 − 2×36 = 720.
  expect(result.pageSizes[0]?.w).toBeCloseTo(540, 0);
  expect(result.pageSizes[0]?.h).toBeCloseTo(720, 0);
  // The text is still inside the (smaller) MediaBox.
  expect(result.text).toContain('Page 1');
  expect(result.text).toContain('Page 2');
  expect(result.text).toContain('Page 3');

  fs.unlinkSync(out);
});
