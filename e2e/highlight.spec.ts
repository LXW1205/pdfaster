import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

type InspectResult =
  | {
      ok: true;
      workerSrc: string;
      pageCount: number;
      annotationCount: number;
      text: string;
      canvasWidthCss: number;
      canvasHeightCss: number;
      canvasWidthPx: number;
      canvasHeightPx: number;
    }
  | { ok: false; error: string };

test('draw a highlight, export, and the exported PDF is real, annotated, and text-searchable', async ({
  page,
}) => {
  // 1. Open editor and load the fixture via the file input.
  await page.goto('/editor');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.resolve(__dirname, 'fixtures/sample.pdf'));

  // 2. Wait for the canvas, then switch to the highlight tool.
  // ponytail: there are now multiple canvases on the page (the
  // thumbnails sidebar). The main editor canvas is the only one
  // that receives annotation events; it has a stable testid.
  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Highlight' }).click();

  // 3. Drag a highlight rect on the canvas.
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no box');
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.2;
  const endX = box.x + box.width * 0.8;
  const endY = box.y + box.height * 0.4;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();

  // The marker should now be visible. (Phase 6 renamed the
  // marker testid to `annotation-highlight` so the generic
  // overlay can render any type under a stable prefix.)
  await expect(page.locator('[data-testid="annotation-highlight"]')).toHaveCount(1);

  // 4. Click Export and capture the download.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-pdf"]').click(),
  ]);
  const tempPath = path.join(os.tmpdir(), `pdfaster-export-${Date.now()}.pdf`);
  await download.saveAs(tempPath);
  expect(fs.statSync(tempPath).size).toBeGreaterThan(0);

  // 5. Use Playwright's request interception to serve the file back to
  //    the browser so the inspect page can re-open it via pdf.js.
  const fileUrl = '/__test__/exported.pdf';
  await page.route(`**${fileUrl}`, async (route) => {
    const buf = fs.readFileSync(tempPath);
    await route.fulfill({ body: buf, contentType: 'application/pdf' });
  });

  // 6. Visit the inspect page. The component re-loads via pdf.js, reads
  //    annotations and text content, and writes the result to
  //    window.__pdfaster.
  await page.goto(`/test/inspect?file=${encodeURIComponent(fileUrl)}`);
  await page.waitForFunction(() => (window as unknown as { __pdfaster?: unknown }).__pdfaster !== undefined, {
    timeout: 30_000,
  });
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);

  // 7. The exported PDF has exactly one annotation: the highlight.
  expect(result.pageCount).toBe(1);
  expect(result.annotationCount).toBe(1);

  // 8. THE ARCHITECT'S KEY ASSERTION: the original text is still
  //    extractable from the exported PDF. If we had rasterized the
  //    page, this would be empty. Vector-first export preserves it.
  expect(result.text ?? '').toContain('Hello pdfaster');

  // Cleanup.
  fs.unlinkSync(tempPath);
});
