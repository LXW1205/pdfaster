import { PDFDocument } from 'pdf-lib';

export type ExtractRange = { from: number; to: number }; // 1-based inclusive, user-facing

// ponytail: parses "1, 3, 5-7" / "1-3" / "5" / "1, 3, 5-7, 10" into
// 0-based indices. Out-of-range tokens are dropped (clamped to
// [1, pageCount]). Empty / invalid spec returns []. Duplicate
// indices are deduped. The order of indices follows the user's
// left-to-right token order — they're sorted ascending at the end
// so the extracted PDF reads in document order.
export function parseRangeSpec(spec: string, pageCount: number): number[] {
  const indices = new Set<number>();
  for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = raw.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = Math.max(1, Math.min(pageCount, Number(m[1])));
    const b = m[2] ? Math.max(1, Math.min(pageCount, Number(m[2]))) : a;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i++) indices.add(i - 1);
  }
  return [...indices].sort((x, y) => x - y);
}

// ponytail: indices are 0-based, already sorted + deduped by the
// caller (or by parseRangeSpec). Empty array = no-op error.
export async function extractPages(file: File, indices: number[]): Promise<Uint8Array> {
  if (indices.length === 0) throw new Error('No pages selected');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}
