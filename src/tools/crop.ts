import { PDFDocument } from 'pdf-lib';

// ponytail: setMediaBox shrinks (or enlarges) the visible page area
// from the current MediaBox by `marginPts` on each side. Negative
// values would expand; clamp to non-negative. For per-page
// asymmetric crop, switch to setCropBox with [x, y, w, h]; for v1,
// uniform margin is enough.
//
// Upgrade path: per-edge crop = four number inputs (top/right/bottom/left)
// and a `setMediaBox(x+left, y+bottom, w-left-right, h-top-bottom)`.
// Per-page crop = a small table (one row per page) with the same
// four-input row. Both are mechanical lifts; defer to a phase 5e+
// user signal — the input is a single number box for v1.
export async function cropAllPages(file: File, marginPts: number): Promise<Uint8Array> {
  const m = Math.max(0, marginPts);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach((p) => {
    const { x, y, width, height } = p.getMediaBox();
    if (m * 2 >= width || m * 2 >= height) {
      throw new Error(`Margin ${m}pt is too large for a page of ${width}×${height}pt.`);
    }
    p.setMediaBox(x + m, y + m, width - 2 * m, height - 2 * m);
    out.addPage(p);
  });
  return out.save();
}
