import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function makeSamplePdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // ponytail: hardcoded teal `#229799` because the spec's secondary token.
  // If the sample ever lands in a real test, swap to a generated random color.
  // The page size 612×792 is US-Letter; matches the coords module's default test envelope.
  page.drawText('Hello pdfaster', { x: 72, y: 720, size: 36, font, color: rgb(0.15, 0.59, 0.6) });
  return doc.save();
}
