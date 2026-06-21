// ponytail: a11y smoke test. The spec asks for `getByRole`-reachability
// on every interactive element of /, /editor, /tools/merge. Not a
// full axe audit; the floor is keyboard + screen reader can find
// every control. Promote to axe-core when a regression actually
// happens (today: YAGNI).
import { test, expect } from '@playwright/test';

test('a11y: every interactive control on /, /editor, /tools/merge is reachable by role', async ({ page }) => {
  // Landing: 2 landing links (Open the editor, Tools) + 1 brand link.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /never leaves your browser/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /open the editor/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /^tools$/i })).toBeVisible();

  // The main nav: 1 Editor link + 3 category buttons (dropdowns).
  // The dropdown MENU items are not in the DOM until the dropdown
  // opens; we open each one to verify the menu items are reachable.
  const mainNav = page.getByRole('navigation', { name: /main/i });
  await expect(mainNav).toBeVisible();
  await expect(mainNav.getByRole('link')).toHaveCount(1); // Editor only

  // Open each category dropdown and verify the menu items are reachable.
  for (const label of ['Organize', 'Modify', 'Convert']) {
    await mainNav.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).click();
    const menu = mainNav.getByRole('menu', { name: new RegExp(label, 'i') });
    await expect(menu).toBeVisible();
    // Every menu item has a role=menuitem link.
    const items = menu.getByRole('menuitem');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // Close by pressing Escape.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }

  // Editor (pre-load): drop zone is a region; the hidden file input
  // is a labeled control (file inputs are not `textbox` per ARIA,
  // so use the accessible-name lookup).
  await page.goto('/editor');
  await expect(page.getByRole('region', { name: /drop a pdf/i })).toBeVisible();
  await expect(page.locator('input[type="file"][aria-label*="Choose PDF"]')).toBeAttached();

  // Merge tool: drop region + file input.
  await page.goto('/tools/merge');
  await expect(page.getByRole('heading', { name: 'Merge PDFs' })).toBeVisible();
  await expect(page.getByRole('region', { name: /drop files here/i })).toBeVisible();
  await expect(page.locator('input[type="file"][aria-label*="Choose files"]')).toBeAttached();

  // The editor's restore prompt is a modal dialog (only when a
  // saved session is present). The role + aria attributes are
  // asserted in EditorPage; this smoke test just verifies the
  // dialog region mounts when a session is offered. We seed by
  // visiting the editor, dropping a PDF, waiting for auto-save,
  // and re-visiting.
  await page.goto('/editor');
  await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/sample.pdf');
  await expect(page.locator('[data-testid="page-canvas"]')).toBeVisible();
  await page.waitForTimeout(2000);
  await page.goto('/');
  await page.goto('/editor');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The dialog is a real `role="dialog"`, not just a div with a
  // testid — that's the screen-reader contract.
  await expect(dialog).toContainText('sample.pdf');
  await page.locator('[data-testid="restore-decline"]').click();
});
