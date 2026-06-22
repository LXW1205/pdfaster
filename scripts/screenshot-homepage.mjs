// ponytail: ad-hoc screenshot script. Not part of the e2e suite.
// Usage: node scripts/screenshot-homepage.mjs [url] [outPath]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5173/';
const outPath = process.argv[3] || 'sample_screenshots/homepage.png';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2, // sharper screenshot
});
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
// Give the page a moment to settle (Blinker font swap, page transition).
await page.waitForTimeout(500);
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log(`wrote ${outPath}`);
