// ponytail: thumbnails render at a fixed small size (120pt wide)
// using pdf.js + page.getViewport. Renders all pages up front for
// a small PDF (a 3-page fixture is the only thing the e2e uses
// today) and cancels in-flight renders on unmount. Promote to
// an LRU + visible-window-only renderer when the toolbar / page
// nav grows a scroll-listener and a 100-page document would
// otherwise build 100 canvas-backed buttons at module init.
import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useUIStore } from '../state/useUIStore';
import { makeViewport } from '../lib/coords';

const THUMB_PT = 120;

export function EditorThumbnails({ pdf }: { pdf: PDFDocumentProxy }) {
  const pageIndex = useUIStore((s) => s.pageIndex);
  const setPageIndex = useUIStore((s) => s.setPageIndex);
  return (
    <aside
      data-testid="editor-thumbnails"
      className="flex w-36 shrink-0 flex-col gap-2 overflow-y-auto border-r border-ink/10 bg-bg/50 p-2"
    >
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <Thumbnail
          key={i}
          pdf={pdf}
          pageIndex={i}
          active={i === pageIndex}
          onClick={() => setPageIndex(i)}
        />
      ))}
    </aside>
  );
}

function Thumbnail({
  pdf,
  pageIndex,
  active,
  onClick,
}: {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  active: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        const baseVp = page.getViewport({ scale: 1 });
        const scale = THUMB_PT / baseVp.width;
        const vp = page.getViewport({ scale });
        const dpr = 1; // ponytail: thumbnails are small enough that
                        // dpr > 1 is wasted bytes; swap to
                        // window.devicePixelRatio when a Retina
                        // thumbnail looks pixelated.
        const v = makeViewport({
          pageWidthPts: baseVp.width,
          pageHeightPts: baseVp.height,
          zoom: scale,
          dpr,
        });
        canvas.width = Math.floor(v.cssWidth * v.dpr);
        canvas.height = Math.floor(v.cssHeight * v.dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) console.error('thumb render failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex]);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`thumb-${pageIndex}`}
      data-active={active ? 'true' : 'false'}
      className={`flex w-full flex-col items-stretch rounded border bg-white transition-colors ${
        active
          ? 'border-secondary ring-2 ring-primary'
          : 'border-ink/10 hover:border-ink/30'
      }`}
    >
      <canvas ref={canvasRef} className="block w-full rounded-t" />
      <div className="py-1 text-center text-xs tabular-nums text-ink/70">
        {pageIndex + 1}
      </div>
    </button>
  );
}
