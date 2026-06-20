import { PDFDocument } from 'pdf-lib';

// ponytail: from/to are 1-based inclusive page numbers (user-facing).
// Convert to 0-based indices for copyPages, and clamp to the document
// range so an out-of-range input never throws — the UI also disables
// the action button in that case, this is belt-and-braces.
//
// Centralize the 1↔0 mapping in a shared `lib/page-index.ts` helper
// when a third tool needs it (rotate-all, reorder, watermark-per-page).
// For phase 5c the two callers (split + delete-pages) each own their
// one-page-index handling inline.
export async function splitPdf(file: File, from: number, to: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  const a = Math.max(1, Math.min(from, total));
  const b = Math.max(a, Math.min(to, total));
  const indices: number[] = [];
  for (let i = a - 1; i < b; i++) indices.push(i);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}
