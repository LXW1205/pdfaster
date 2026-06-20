import { test, expect } from '@playwright/test';

type WorkerCheckResult =
  | {
      ok: true;
      workerSrc: string;
      pageCount: number;
      canvasWidthCss: number;
      canvasHeightCss: number;
      canvasWidthPx: number;
      canvasHeightPx: number;
    }
  | { ok: false; error: string };

declare global {
  interface Window {
    __pdfaster?: WorkerCheckResult;
  }
}

test('pdf.js worker is self-hosted and a sample PDF renders to a canvas', async ({ page }) => {
  await page.goto('/test/worker');
  // The page writes the result onto window.__pdfaster when done.
  await page.waitForFunction(() => window.__pdfaster !== undefined, { timeout: 30_000 });
  const result = await page.evaluate(() => window.__pdfaster as WorkerCheckResult);

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);

  // Worker is self-hosted, not from a CDN. The URL is a relative path
  // when bundled with Vite's `?url` import — which is better than an
  // absolute URL because it works in any deployment.
  expect(result.workerSrc).toBeTruthy();
  expect(result.workerSrc).toMatch(/^(https?:\/\/[^/]+|\/)/);
  expect(result.workerSrc).toMatch(/\.mjs$/);
  expect(result.workerSrc).toContain('pdf.worker');
  expect(result.workerSrc).not.toMatch(/cdn|cdnjs|unpkg|jsdelivr/i);

  // The sample PDF renders.
  expect(result.pageCount).toBe(1);
  expect(result.canvasWidthCss).toBeGreaterThan(0);
  expect(result.canvasHeightCss).toBeGreaterThan(0);
  // Backing store is CSS × dpr (integer scaling on a normal display).
  expect(result.canvasWidthPx).toBeGreaterThanOrEqual(result.canvasWidthCss);
  expect(result.canvasHeightPx).toBeGreaterThanOrEqual(result.canvasHeightCss);

  // The canvas is actually in the DOM with non-zero size.
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});
