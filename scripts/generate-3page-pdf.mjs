// e2e/fixtures/3page.pdf generator. 3 pages, each labeled with
// distinguishable text so the split / delete-pages / pdf-to-jpg
// tests can assert on extracted text.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../e2e/fixtures/3page.pdf');

await mkdir(dirname(out), { recursive: true });

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = doc.addPage([612, 792]);
  // Spec's secondary teal `#229799`.
  page.drawText(`Page ${i}`, {
    x: 72, y: 720, size: 36, font,
    color: rgb(0.15, 0.59, 0.6),
  });
}
const bytes = await doc.save();
await writeFile(out, bytes);
console.log(`wrote ${out} (${bytes.byteLength} bytes)`);
