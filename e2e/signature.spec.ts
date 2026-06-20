// ponytail: signature e2e. The signature's /Stamp annotation has no
// /AP in v1 (see register.ts + exportPdf comments). The test asserts
// what the spec promises: the annotation dict is present in the
// exported PDF, the original text stays extractable, and the editor
// shows the drawn signature. The "the signature visually renders in
// the exported PDF" assertion is a phase 8 follow-up (see the
// callout in the final report).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('signature: draw, apply, export, the /Stamp annotation survives the roundtrip and text is extractable', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/sample.pdf'));

  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();

  // Switch to the signature tool.
  await page.getByRole('button', { name: 'Signature' }).click();
  const pad = page.locator('[data-testid="signature-pad"]');
  await expect(pad).toBeVisible();

  // Draw a quick stroke on the pad. A few mouse moves are enough to
  // flip the `drawn` flag; the math is identical to the editor's
  // free-draw overlay.
  const padBox = await pad.boundingBox();
  if (!padBox) throw new Error('no signature pad box');
  await page.mouse.move(padBox.x + 30, padBox.y + 30);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(padBox.x + 30 + i * 25, padBox.y + 30 + Math.sin(i) * 25);
  }
  await page.mouse.up();

  // Apply commits a `signature` annotation + closes the pad.
  await page.locator('[data-testid="signature-apply"]').click();
  await expect(page.locator('[data-testid="annotation-signature"]')).toHaveCount(1);

  // Export.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-pdf"]').click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-signature-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);

  // Re-open via the inspect page. We assert the signature annotation
  // is in the /Annots array AND the original "Hello pdfaster" text
  // is still extractable (vector-first export preserved it).
  const fileUrl = '/__test__/signed.pdf';
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
    | { ok: true; pageCount: number; annotationCount: number; text: string }
    | { ok: false; error: string };
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.pageCount).toBe(1);
  expect(result.annotationCount).toBe(1);
  expect(result.text).toContain('Hello pdfaster');

  fs.unlinkSync(out);
});
