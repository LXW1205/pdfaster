import { PDFDocument } from 'pdf-lib';

// ponytail: `order` is an array of 0-based page indices in the new
// order. We use copyPages with that exact order — pdf-lib's copyPages
// accepts a sparse / non-contiguous index list, so this is the only
// line of business logic needed.
//
// Upgrade path: when drag-and-drop is wanted (HTML5 native, no
// library), the page component renders the rows with draggable=true
// and the move helper becomes a reorder-on-drop. The tool stays a
// 1-line `copyPages` call regardless of how the order is built.
export async function reorderPages(file: File, order: number[]): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, order);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}
