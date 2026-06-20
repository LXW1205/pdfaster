// e2e/fixtures/sample-2.pdf generator. The two fixtures are
// distinguishable so the e2e can assert order, but identical in
// structure so the merge is a real two-page document.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../e2e/fixtures/sample-2.pdf');

await mkdir(dirname(out), { recursive: true });

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
page.drawText('Hello from pdfaster', {
  x: 72, y: 720, size: 36, font,
  color: rgb(0.28, 0.81, 0.8), // primary teal #48CFCB
});
const bytes = await doc.save();
await writeFile(out, bytes);
console.log(`wrote ${out} (${bytes.byteLength} bytes)`);
