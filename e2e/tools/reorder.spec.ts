import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('reorder: move page 1 down twice, output order is 2, 3, 1', async ({ page }) => {
  await page.goto('/tools/reorder');
  await expect(page.getByRole('heading', { name: 'Reorder pages' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, '..', 'fixtures', '3page.pdf'));

  // 3 page rows render.
  await expect(page.getByText('Page 1')).toBeVisible();
  await expect(page.getByText('Page 2')).toBeVisible();
  await expect(page.getByText('Page 3')).toBeVisible();

  // Move page 1 down twice → page 1 ends up in position 3. Output
  // order is therefore [page 2, page 3, page 1]. The aria-label uses
  // the page's 1-based number, so the same button matches before
  // and after the first click.
  const moveDown = page.getByRole('button', { name: /move page 1 down/i });
  await moveDown.click();
  await moveDown.click();

  // Click the action, wait for the download button, then click it to
  // trigger the download (the action only sets `result`; the
  // download button is what fires the actual file download).
  await page.locator('[data-testid="reorder-action"]').click();
  const downloadBtn = page.locator('[data-testid="reorder-download"]');
  await expect(downloadBtn).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-reorder-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/reordered\.pdf$/);

  // Re-open via /test/inspect to verify the page order.
  const fileUrl = '/__test__/reordered.pdf';
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
  const t = result.text;
  const i1 = t.indexOf('Page 1');
  const i2 = t.indexOf('Page 2');
  const i3 = t.indexOf('Page 3');
  // The expected order is "Page 2, Page 3, Page 1".
  expect(i2).toBeLessThan(i3);
  expect(i3).toBeLessThan(i1);

  fs.unlinkSync(out);
});
