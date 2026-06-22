// ponytail: the 32nd e2e. The contract: hold Shift during a move
// drag = ¼ speed. We draw a highlight, drag it 200 CSS px normally
// (1:1 speed) so it lands far to the right, then drag it 200 CSS
// px with Shift (¼ speed) so it moves only ~50 CSS px further
// right. The exported PDF's /Rect (in PDF user space, points)
// reflects the cumulative translation. We assert the final x
// landed in a band that proves Shift was honored (much less than
// the un-Shifted total of 400 CSS px).
//
// The page is 612×792 PDF points (US Letter). At zoom=1, 1 CSS px
// = 1 PDF pt. The highlight is drawn starting near the top-left
// and moved right by 200 CSS px (normal), then by another 200 CSS
// px with Shift (~50 effective). So the final x is roughly
// 80 (start) + 200 (normal drag) + 50 (shift drag) = 330 pt. The
// assertion is approximate — the exact pixel-to-point math
// depends on the editor's current zoom and the canvas's CSS
// position, but the band (200 < x < 400) is wide enough to
// catch the un-Shifted case (which would be ~480) and tight
// enough to catch a broken Shift handler (which would also be
// ~480). 5s timeout for the proxy load.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AnnotationRect = {
  pageIndex: number;
  id: string;
  type: string;
  rect: { x: number; y: number; w: number; h: number };
};

type InspectResult =
  | {
      ok: true;
      pageCount: number;
      annotationRects: AnnotationRect[];
    }
  | { ok: false; error: string };

test('shift + drag: fine-move at ¼ speed', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/3page.pdf'));

  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas box');

  // Draw a highlight at top-left. The drag from (80,80) → (120,100)
  // is small enough to stay in the top-left quadrant, and the
  // post-draw position of the highlight's center is around
  // (100, 90) in CSS px.
  await page.getByRole('button', { name: 'Highlight' }).click();
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100, { steps: 3 });
  await page.mouse.up();

  // Switch to Move (formerly Select). The ToolPicker renders a
  // Move button at the start of the toolbar; the V shortcut is
  // an equivalent path.
  await page.getByRole('button', { name: /^move$/i }).click();

  // Click the highlight to select it. The click lands on the
  // click target inside the annotation-overlay.
  await page.mouse.click(box.x + 100, box.y + 90);
  await expect(page.locator('[data-testid="selection-border"]')).toHaveCount(1);

  // Drag 200 CSS px NORMALLY. The annotation moves 200 CSS px to
  // the right (1:1 speed). At zoom=1, that's 200 PDF pt.
  await page.mouse.move(box.x + 100, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 90, { steps: 8 });
  await page.mouse.up();

  // Drag 200 CSS px WITH SHIFT. The annotation moves ~50 CSS px
  // to the right (¼ speed). At zoom=1, that's ~50 PDF pt.
  await page.mouse.move(box.x + 300, box.y + 90);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 500, box.y + 90, { steps: 8 });
  await page.keyboard.up('Shift');
  await page.mouse.up();

  // Export, re-open via inspect, read the highlight's /Rect.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-pdf"]').click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-shift-fine-move-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);

  const fileUrl = '/__test__/shift.pdf';
  await page.route(`**${fileUrl}`, async (route) => {
    await route.fulfill({ body: fs.readFileSync(out), contentType: 'application/pdf' });
  });
  await page.goto(`/test/inspect?file=${encodeURIComponent(fileUrl)}`);
  await page.waitForFunction(
    () => (window as unknown as { __pdfaster?: unknown }).__pdfaster !== undefined,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);

  // Find the highlight. The x in PDF points is the highlight's
  // left edge. Starting at 80, +200 normal + ~50 shift = ~330.
  // The un-Shifted total would be ~480. The band 200 < x < 400
  // catches a working Shift handler and rejects a broken one
  // (which would land near 480) — the spec's "Shift halves the
  // distance" contract.
  const h = result.annotationRects.find((r) => r.type === 'Highlight');
  expect(h).toBeDefined();
  if (!h) throw new Error('no highlight annotation');
  expect(h.rect.x).toBeGreaterThan(200);
  expect(h.rect.x).toBeLessThan(400);

  fs.unlinkSync(out);
});
