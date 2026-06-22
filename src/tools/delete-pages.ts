import { PDFDocument } from 'pdf-lib';

// ponytail: keepIndices are 0-based page indices to KEEP. For phase 5c
// we copy the kept pages in user-chosen order, which avoids the
// index-shift bug that `removePage(i)` (deleting the highest first)
// would otherwise need to dodge. The spec's design note calls out
// reverse-iteration for the deletion approach; we use copy-then-keep
// because (a) it preserves the user's selection order and (b) it
// matches the merge pipeline's "copyPages" idiom — one mental model
// across the whole tool suite.
//
// Centralize the 0↔1 page-index mapping in a shared helper alongside
// extract.ts when a third tool needs it.
export async function deletePages(file: File, keepIndices: number[]): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const sorted = [...keepIndices].sort((a, b) => a - b);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, sorted);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}
