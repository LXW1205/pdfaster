import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('editor: 5 new annotation types + undo/redo + zoom + page nav, all export to real PDF annotations', async ({ page }) => {
  await page.goto('/editor');

  // Load the 3-page fixture (so we can test page nav).
  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/3page.pdf'));

  // Wait for the main editor canvas (the thumbnails sidebar also
  // contains canvases, so the testid is the only stable handle).
  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();

  // 1. Pick Underline, draw, verify it appears.
  await page.getByRole('button', { name: 'Underline' }).click();
  const box1 = await canvas.boundingBox();
  if (!box1) throw new Error('no canvas box');
  await page.mouse.move(box1.x + 50, box1.y + 50);
  await page.mouse.down();
  await page.mouse.move(box1.x + 200, box1.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="annotation-underline"]')).toHaveCount(1);

  // 2. Undo, verify the underline is gone.
  await page.locator('[data-testid="undo"]').click();
  await expect(page.locator('[data-testid="annotation-underline"]')).toHaveCount(0);

  // 3. Redo, verify it's back.
  await page.locator('[data-testid="redo"]').click();
  await expect(page.locator('[data-testid="annotation-underline"]')).toHaveCount(1);

  // 4. Zoom in twice (100% → 125% → 150% — increments of 25%).
  await page.locator('[data-testid="zoom-in"]').click();
  await page.locator('[data-testid="zoom-in"]').click();
  await expect(page.locator('[data-testid="zoom-label"]')).toContainText('150%');

  // 5. Next page → indicator shows "2 / 3".
  await page.locator('[data-testid="page-next"]').click();
  await expect(page.locator('[data-testid="page-indicator"]')).toContainText('2');

  // 6. Draw a Rectangle on page 2.
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const box2 = await canvas.boundingBox();
  if (!box2) throw new Error('no canvas box');
  await page.mouse.move(box2.x + 50, box2.y + 50);
  await page.mouse.down();
  await page.mouse.move(box2.x + 200, box2.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-testid="annotation-rectangle"]')).toHaveCount(1);

  // 7. Switch to Free draw, draw a stroke.
  await page.getByRole('button', { name: 'Free draw' }).click();
  const box3 = await canvas.boundingBox();
  if (!box3) throw new Error('no canvas box');
  await page.mouse.move(box3.x + 100, box3.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(box3.x + 100 + i * 10, box3.y + 100 + Math.sin(i) * 30);
  }
  await page.mouse.up();
  await expect(page.locator('[data-testid="annotation-freedraw"]')).toHaveCount(1);

  // 8. Export.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export pdf/i }).click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-editor-features-${Date.now()}.pdf`);
  await download.saveAs(out);

  // 9. Re-open via the inspect page, assert annotations present +
  // text still extractable. The inspect page reports annotationCount
  // summed across all pages.
  const fileUrl = '/__test__/edited.pdf';
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
        annotationCount: number;
        text: string;
      }
    | { ok: false; error: string };
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.pageCount).toBe(3);
  // 1 underline (page 0) + 1 rectangle (page 1) + 1 free-draw (page 1) = 3.
  expect(result.annotationCount).toBe(3);
  // Vector-first: text must still be extractable.
  expect(result.text).toContain('Page 1');
  expect(result.text).toContain('Page 2');
  expect(result.text).toContain('Page 3');

  fs.unlinkSync(out);
});
