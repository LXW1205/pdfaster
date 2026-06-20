import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type PageNumberOpts = {
  position: 'bottom-center' | 'bottom-right' | 'top-right';
  format: 'n' | 'n-of-m' | 'page-n-of-m';
};

// ponytail: drawText on every page. Page index is 1-based, total
// count from the source document. The text is added to the page
// content stream and IS extractable via getTextContent — so the e2e
// can assert "Page 1" or "1" or "1 / 3" is in the output's text.
//
// When a "skip page 1" option is wanted (common: cover page has no
// number), add a `skipFirst: boolean` to PageNumberOpts and a
// `idx > 0 || !opts.skipFirst` guard around drawText. Same for
// "start counting at N" — page N is then `idx + startAt`. Both are
// mechanical lifts to the same loop.
export async function addPageNumbers(file: File, opts: PageNumberOpts): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach((p, idx) => {
    const { width, height } = p.getSize();
    const pageNum = idx + 1;
    let label: string;
    if (opts.format === 'n') label = `${pageNum}`;
    else if (opts.format === 'n-of-m') label = `${pageNum} / ${total}`;
    else label = `Page ${pageNum} of ${total}`;
    const size = 12;
    const margin = 24;
    const textWidth = font.widthOfTextAtSize(label, size);
    let x = width / 2 - textWidth / 2;
    let y = margin;
    if (opts.position === 'bottom-right') { x = width - textWidth - margin; y = margin; }
    if (opts.position === 'top-right')    { x = width - textWidth - margin; y = height - size - margin; }
    p.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) });
    out.addPage(p);
  });
  return out.save();
}
