import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('editor renders a dropped PDF to a HiDPI canvas', async ({ page }) => {
  await page.goto('/editor');

  // Drop zone is visible.
  await expect(page.getByRole('region', { name: /drop a pdf/i })).toBeVisible();

  // Upload the fixture via the hidden file input.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, 'fixtures/sample.pdf'));

  // Viewer chrome appears.
  await expect(page.getByText(/sample\.pdf/i)).toBeVisible();

  // Canvas renders with non-zero size in CSS px. The editor now
  // has a thumbnails sidebar (with its own canvases) — the main
  // editor canvas is the one we measure here.
  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);

  // Backing store is at least CSS × 1 (dpr ≥ 1).
  const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
  expect(dims.w).toBeGreaterThanOrEqual(Math.floor(box!.width));
  expect(dims.h).toBeGreaterThanOrEqual(Math.floor(box!.height));
});
