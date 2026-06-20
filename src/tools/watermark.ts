import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

export type WatermarkOpts = {
  text: string;
  opacity: number;       // 0..1
  color: 'gray' | 'red' | 'blue' | 'black';
  position: 'center' | 'top' | 'bottom' | 'diagonal';
};

const COLORS = {
  gray:   rgb(0.6, 0.6, 0.6),
  red:    rgb(0.86, 0.15, 0.15),
  blue:   rgb(0.13, 0.34, 0.79),
  black:  rgb(0, 0, 0),
} as const;

// ponytail: text-only, single font (Helvetica Bold), one size formula
// (clamped to a sensible range based on the shorter page dimension).
// For an image / PDF watermark, embedPng / embedPng + drawImage on
// every page; for a per-page custom text, render a list of
// {pageIndex, text} pairs and pick the right entry in the loop. The
// non-Latin ceiling is the same as the form-fill path: needs
// fontkit + a TTF, which we haven't added. Stick to Latin-1 / WinAnsi
// for v1; the same warning the editor surfaces in its form-fill UI
// applies here.
//
// The font / size / color formula is the single biggest "shape" the
// tool will grow into. When a user asks for per-page text, this
// function's signature changes from `(text, opts)` to
// `(entries: { pageIndex: number, text: string }[])`.
export async function watermarkPdf(file: File, opts: WatermarkOpts): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  const copied = await out.copyPages(src, src.getPageIndices());
  for (const p of copied) {
    const { width, height } = p.getSize();
    const size = Math.max(36, Math.min(width, height) * 0.12);
    const color = COLORS[opts.color];
    let x = width / 2 - (opts.text.length * size * 0.3);
    let y = height / 2 - size / 2;
    let rot = 0;
    if (opts.position === 'top')    { x = width / 2 - (opts.text.length * size * 0.3); y = height - size - 36; }
    if (opts.position === 'bottom') { x = width / 2 - (opts.text.length * size * 0.3); y = 36; }
    if (opts.position === 'diagonal') {
      x = width / 2 - (opts.text.length * size * 0.4);
      y = height / 2 - size / 2;
      rot = 35;
    }
    p.drawText(opts.text, {
      x, y, size, font, color, opacity: opts.opacity,
      rotate: degrees(rot),
    });
    out.addPage(p);
  }
  return out.save();
}
