import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('pdf-to-jpg: drop 3-page PDF, get 3 preview images, download one', async ({ page }) => {
  await page.goto('/tools/pdf-to-jpg');
  await expect(page.getByRole('heading', { name: 'PDF → JPG' })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const f = path.resolve(__dirname, '..', 'fixtures', '3page.pdf');
  await fileInput.setInputFiles(f);

  // The conversion runs on drop; wait for the 3 download buttons.
  const dlBtn1 = page.locator('[data-testid="pdf-to-jpg-download-1"]');
  const dlBtn2 = page.locator('[data-testid="pdf-to-jpg-download-2"]');
  const dlBtn3 = page.locator('[data-testid="pdf-to-jpg-download-3"]');
  await expect(dlBtn1).toBeVisible({ timeout: 30_000 });
  await expect(dlBtn2).toBeVisible();
  await expect(dlBtn3).toBeVisible();

  // 3 preview images render.
  await expect(page.locator('img')).toHaveCount(3);

  // Download page 1.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dlBtn1.click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-pdf-to-jpg-${Date.now()}.jpg`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/page-1\.jpg$/);

  // Magic bytes are a JPEG (FF D8 FF).
  const fd = fs.openSync(out, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  expect(buf[2]).toBe(0xff);

  fs.unlinkSync(out);
});
