// ponytail: the 31st e2e. The contract: drop a PDF on the Reorder
// page, assert that every row has a rendered page preview. The
// preview is a 60px-wide canvas whose height is derived from the
// page's aspect ratio. We use the 3-page fixture (the smallest
// fixture that exercises the loop). The pdf.js proxy loads via
// the usePdfDocument hook, then every row's PagePreview effect
// runs and renders a small canvas. We assert each preview's
// bounding box has non-zero width and height.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('previews: drop a PDF on Reorder, each row has a rendered page preview', async ({ page }) => {
  await page.goto('/tools/reorder');
  await expect(page.getByRole('heading', { name: 'Reorder pages' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(path.resolve(__dirname, 'fixtures/3page.pdf'));

  // Wait for the list.
  const list = page.getByRole('list', { name: /pages/i });
  await expect(list).toBeVisible();

  // Each row has a page-preview canvas. The usePdfDocument hook
  // loads the proxy async, then every PagePreview effect runs —
  // the previews appear in the same frame the proxy is set.
  // 5s timeout covers the proxy-load + render latency.
  for (let i = 0; i < 3; i++) {
    const preview = page.locator(`[data-testid="page-preview-${i}"]`);
    await expect(preview).toBeVisible({ timeout: 5_000 });
    const box = await preview.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  }
});
