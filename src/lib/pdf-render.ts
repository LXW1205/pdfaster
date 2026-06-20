// ponytail: one-time module-top init. Don't move this into useEffect —
// Vite's worker chunking and React strict-mode double-render both
// punish that pattern. See vercel-react-best-practices: advanced-init-once.
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
// The `?url` suffix tells Vite to import the worker as a static asset
// URL. In dev, Vite serves it from its dev server; in build, Vite
// emits it as a hashed chunk in dist/. The `new URL(..., import.meta.url)`
// pattern Vite's docs suggest works in build but resolves to a
// `node_modules/...` path in dev that Vite doesn't serve, so the
// browser hits a fetch error. `?url` is the canonical Vite fix.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

export { GlobalWorkerOptions, getDocument };
export type { PDFDocumentProxy, PDFPageProxy };
export type { Rotation } from './coords';

import { makeViewport, type Rotation } from './coords';

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  zoom: number,
  rotation: Rotation = 0,
): Promise<void> {
  const dpr = window.devicePixelRatio || 1;
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const v = makeViewport({
    pageWidthPts: baseViewport.width,
    pageHeightPts: baseViewport.height,
    zoom,
    dpr,
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  canvas.width = Math.floor(v.cssWidth * v.dpr);
  canvas.height = Math.floor(v.cssHeight * v.dpr);
  canvas.style.width = `${v.cssWidth}px`;
  canvas.style.height = `${v.cssHeight}px`;
  // ponytail: pdf.js 6's `page.render` requires `canvas` alongside
  // `canvasContext` (added in v6). When `canvas` is passed, pdf.js
  // derives the device scale from `canvas.width / viewport.width`,
  // so we don't need to pass an explicit `transform`. The coords
  // module is the single source of truth for the HiDPI math — don't
  // recompute it here.
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport: page.getViewport({ scale: zoom, rotation }),
  }).promise;
  // ponytail: release the per-page operator list after each render.
  // Phase 4+ renders many pages; replace this with a per-page-index
  // LRU so a 100-page document doesn't OOM.
  page.cleanup();
}

// ponytail: reorder a page in a loaded PDFDocument in place. The
// move is destructive (the document is reordered) but undoable
// via zundo on the editor's `bytes` field. We use the
// removePage + insertPage pattern, which keeps the page's
// /Resources intact (in-place mutation strategy, same as
// exportPdf).
export async function reorderPageInPlace(
  // We accept any object with the pdf-lib PDFDocument shape so the
  // caller's import boundary is preserved. The shape is stable
  // across pdf-lib 1.17.
  doc: { removePage: (i: number) => void; insertPage: (i: number, page: unknown) => unknown; copyPages: (src: unknown, indices: number[]) => Promise<unknown[]>; getPageCount: () => number },
  from: number,
  to: number,
): Promise<void> {
  if (from === to) return;
  if (from < 0 || from >= doc.getPageCount()) return;
  if (to < 0 || to > doc.getPageCount()) return;
  // ponytail: copyPages is the only way to get a "movable" page
  // reference from one PDFDocument context into another, but
  // for in-place mutation the same doc accepts its own pages
  // back. We use the loaded doc as both source and destination.
  const [page] = await doc.copyPages(doc, [from]);
  doc.removePage(from);
  // ponytail: after removePage, the "to" index shifts if `to > from`.
  // (The page that used to be at `to` is now at `to - 1` if to > from.)
  const insertAt = to > from ? to - 1 : to;
  doc.insertPage(insertAt, page);
}
