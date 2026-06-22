// ponytail: one proxy per file. Re-creating the proxy on every
// render would be the natural bug. The proxy is loaded async; until
// it's ready, the consumer renders a placeholder. Dynamic import
// of `pdf-render` keeps pdf.js out of the bundle of any tool page
// that doesn't import it directly.
//
// We don't call setPdf(null) when `file` is null — the tool page
// hides the row list when there's no file, so a stale proxy in
// state is invisible. The cancelled flag tears down the in-flight
// load so the destroyed proxy doesn't leak.
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function usePdfDocument(file: File | null): PDFDocumentProxy | null {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const { getDocument } = await import('../pdf-render');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const task = getDocument({ data: bytes });
        const p = await task.promise;
        if (cancelled) return; // ponytail: drop the result; the
                               // cancelled effect's caller (file
                               // change / unmount) doesn't need it.
                               // The proxy becomes garbage when no
                               // reference holds it.
        setPdf(p);
      } catch (e) {
        if (!cancelled) console.error('usePdfDocument: load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);
  return pdf;
}
