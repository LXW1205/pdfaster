import { PDFDocument } from 'pdf-lib';

export type CompressResult = { bytes: Uint8Array; before: number; after: number };

// ponytail: HONEST about what this does. We (a) strip the document
// metadata and (b) re-save with object streams enabled. We do NOT
// re-encode embedded images (real compression is much harder and
// out of phase 5c scope). The size delta is real but modest —
// usually 1-10% on text-heavy PDFs, near zero on already-compressed
// image PDFs. The CompressPage shows before/after bytes, not a fake
// percentage badge.
//
// Upgrade path: when image re-encoding is wanted, walk the
// XObject stream for `/Subtype /Image`, decode via pdf.js's
// `getOperatorList` or `getXRef`, re-encode at a chosen JPEG/PNG
// quality, and re-embed. Two-day add; defer to a phase 5d+ user
// signal. (Spec marks image re-encoding as out of v1.)
export async function compressPdf(file: File): Promise<CompressResult> {
  const before = file.size;
  const srcBytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(srcBytes, { updateMetadata: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach((p) => out.addPage(p));
  out.setTitle('');
  out.setAuthor('');
  out.setSubject('');
  out.setKeywords([]);
  out.setProducer('pdfaster');
  out.setCreator('pdfaster');
  const bytes = await out.save({ useObjectStreams: true });
  return { bytes, before, after: bytes.byteLength };
}
