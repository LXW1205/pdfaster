// ponytail: script doubles as the e2e fixture's source of truth —
// re-running `npm run test:e2e` regenerates a fresh sample.pdf.
// Don't hand-edit the fixture; change the script.
//
// Phase 7: sample now ships with a single text form field named
// "Name" so the form-fill e2e can drop it, fill, export, and
// re-open to assert the value persists. The field's widget sits
// below the heading text. The page size is unchanged.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'e2e', 'fixtures');
const outFile = path.join(outDir, 'sample.pdf');

await mkdir(outDir, { recursive: true });

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
// Spec's secondary teal `#229799`.
page.drawText('Hello pdfaster', {
  x: 72,
  y: 720,
  size: 36,
  font,
  color: rgb(0.15, 0.59, 0.6),
});

// ponytail: a single text field. pdf-lib's `createTextField` returns
// a `PDFTextField` whose widget we add to the page at a chosen rect.
// `addToPage(page, { x, y, width, height, font, ... })` is the
// one-call setter. We use a 12pt Helvetica and a 200×24pt rect
// placed below the heading.
const form = doc.getForm();
form.createTextField('Name').addToPage(page, {
  x: 72,
  y: 660,
  width: 200,
  height: 24,
  font,
  borderColor: rgb(0.13, 0.59, 0.6),
  backgroundColor: rgb(0.97, 0.97, 0.97),
  textColor: rgb(0.26, 0.26, 0.26),
});

const bytes = await doc.save();
await writeFile(outFile, bytes);
console.log(`wrote ${outFile} (${bytes.byteLength} bytes)`);
