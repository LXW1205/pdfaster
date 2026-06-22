// e2e/fixtures/30page.pdf generator. 30 pages, each labeled with
// "Page N" so the infinite-scroll test can assert on the count.
// Same color as the 3-page fixture (spec's secondary teal).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../e2e/fixtures/30page.pdf');

await mkdir(dirname(out), { recursive: true });

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 30; i++) {
  const page = doc.addPage([612, 792]);
  page.drawText(`Page ${i}`, {
    x: 72, y: 720, size: 36, font,
    color: rgb(0.13, 0.59, 0.6),
  });
}
const bytes = await doc.save();
await writeFile(out, bytes);
console.log(`wrote ${out} (${bytes.byteLength} bytes)`);
