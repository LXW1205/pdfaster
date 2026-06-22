import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ponytail: the 29th e2e. The contract: draw a highlight at A,
// select it, drag it to B, export, re-open via the inspect page,
// and assert the highlight's /Rect in the exported PDF is in the
// bottom-right quadrant of the page. The inspect payload was
// extended with `annotationRects` (per-annotation {x,y,w,h} in
// PDF user space) so this assertion can be loose-but-real: the
// exact center isn't checked, only the quadrant.

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

test('select and move: draw a highlight at A, move it to B, export, the highlight is at B', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/3page.pdf'));

  // Wait for the main editor canvas (thumbnails also contain canvases).
  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas box');

  // 1. Switch to highlight, draw at position A (top-left quadrant).
  await page.getByRole('button', { name: 'Highlight' }).click();
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="annotation-highlight"]')).toHaveCount(1);

  // 2. Switch to select via the V shortcut. The toolbar's
  // ToolPicker is data-driven by AnnotationRegistry, which doesn't
  // include `select` (it's a no-op default). The V shortcut in
  // TOOL_KEY_MAP (cheatsheet-data.ts) is the only way to enter
  // select mode. The qol test exercises the same path.
  await page.keyboard.press('v');

  // 3. Click the highlight to select it. The click target is the
  // CSS rect of the highlight — we click somewhere inside it.
  // The highlight is at canvas (80, 80) → (200, 120), so the
  // center is at (140, 100).
  const clickX = box.x + 140;
  const clickY = box.y + 100;
  await page.mouse.click(clickX, clickY);
  // After click, the selection border should be visible.
  await expect(page.locator('[data-testid="selection-border"]')).toHaveCount(1);

  // 4. Drag the highlight from A to B (bottom-right quadrant).
  // We move it well past the page midpoint (306, 396) so the
  // assertion is robust against small CSS→PDF variances.
  await page.mouse.move(clickX, clickY);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 420, { steps: 10 });
  await page.mouse.up();
  // The selection border is still there (we just moved the same
  // selected annotation). The drag is one logical action — but
  // we don't assert history depth here; the move is tested by
  // the export's /Rect.

  // 5. Export the PDF.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-pdf"]').click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-select-move-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);

  // 6. Re-open via the inspect page; assert the highlight's /Rect
  // is in the bottom-right quadrant of the page.
  const fileUrl = '/__test__/moved.pdf';
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

  // Exactly one /Highlight annotation (the only thing on the page).
  const highlights = result.annotationRects.filter((r) => r.type === 'Highlight');
  expect(highlights).toHaveLength(1);
  const h = highlights[0]!;
  // ponytail: the page is 612×792 pt (US letter). Bottom-right
  // quadrant center is at x>306, y<396 (PDF y is bottom-up).
  // We assert the highlight's center is in the bottom-right
  // quadrant. Loose enough to handle small CSS→PDF variances;
  // tight enough to fail if the highlight didn't move.
  const cx = h.rect.x + h.rect.w / 2;
  const cy = h.rect.y + h.rect.h / 2;
  expect(cx).toBeGreaterThan(306);
  expect(cy).toBeLessThan(396);

  fs.unlinkSync(out);
});
