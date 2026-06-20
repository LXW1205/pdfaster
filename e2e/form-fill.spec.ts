// ponytail: form-fill e2e. Drops the sample PDF (which carries a
// text field named "Name" since the phase 7 fixture update), types
// into the field via the FormOverlay's <input>, exports, re-opens
// via the inspect page, and asserts `formValues.Name === 'Test'`.
// The inspect page payload grew a `formValues` field in phase 7
// for this test.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('form-fill: type into an AcroForm text field, export, and the value survives the roundtrip', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/sample.pdf'));

  const canvas = page.locator('[data-testid="page-canvas"]');
  await expect(canvas).toBeVisible();

  // The form-discovery pass seeds the field. Wait for the
  // FormOverlay's text input to appear, then type.
  const nameInput = page.locator('[data-testid="form-field-Name"] input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('Test');

  // Export.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-pdf"]').click(),
  ]);
  const out = path.join(os.tmpdir(), `pdfaster-formfill-${Date.now()}.pdf`);
  await download.saveAs(out);
  expect(fs.statSync(out).size).toBeGreaterThan(0);

  // Re-open via the inspect page. The new `formValues` field
  // reports the post-fill state; assert the Name field reads "Test".
  const fileUrl = '/__test__/formfilled.pdf';
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
    | { ok: true; pageCount: number; formValues: Record<string, string> }
    | { ok: false; error: string };
  const result = await page.evaluate(
    () => (window as unknown as { __pdfaster: InspectResult }).__pdfaster,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.pageCount).toBe(1);
  expect(result.formValues.Name).toBe('Test');

  fs.unlinkSync(out);
});
