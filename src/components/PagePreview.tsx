// ponytail: single-page pdf.js render. The width is the user-facing
// CSS size; the height comes from the page's aspect ratio at that
// width. dpr > 1 would waste bytes (these are tiny thumbnails),
// so dpr=1 — promote to window.devicePixelRatio when a Retina
// preview looks pixelated. The canvas's parent must reserve the
// aspect-ratio-derived height (otherwise the row layout shifts when
// the canvas paints) — easiest: wrap the canvas in a div with
// `aspectRatio: pageW / pageH`.
import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type Props = {
  pdf: PDFDocumentProxy;
  pageIndex: number;     // 0-based
  width?: number;        // default 100 (bumped from 60 — the previews were too small to read; matches the editor sidebar thumb width)
  className?: string;
};

export function PagePreview({ pdf, pageIndex, width = 100, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        const scale = width / baseVp.width;
        const dpr = 1; // ponytail: dpr=1 — these are tiny thumbnails, the extra backing-store bytes aren't worth the marginal crispness
        const cssH = baseVp.height * scale;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
        page.cleanup();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) console.error('preview render failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, pageIndex, width]);
  return (
    <canvas
      ref={ref}
      data-testid={`page-preview-${pageIndex}`}
      className={className ?? 'block shrink-0 rounded border border-ink/10 bg-white'}
    />
  );
}
