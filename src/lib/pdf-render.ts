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
