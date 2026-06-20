import { PDFDocument } from 'pdf-lib';

// ponytail: `copyPages` preserves the source content stream — text
// stays real, form fields stay real. This is the architect's
// vector-first pivot applied to merge. Don't switch to a streaming
// or zip-merge approach: it loses the AcroForm / annotation payload
// that the editor pipeline writes.
export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error('Need at least 2 PDFs to merge');
  const out = await PDFDocument.create();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const src = await PDFDocument.load(bytes);
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return out.save();
}
