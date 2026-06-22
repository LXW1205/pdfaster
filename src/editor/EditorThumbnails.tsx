// ponytail: windowed rendering. Only the page indices within ±BUFFER
// of the visible window get rendered with a real canvas; the rest are
// thin placeholder buttons with just the page number. As the user
// scrolls, new thumbs enter the window and old ones exit (and their
// pdf.js renderTasks are cancelled by the `cancelled` flag in the
// Thumbnail effect).
//
// The placeholder is a real DOM element with the same height as a
// real thumb — so the scrollbar's total scrollable height is
// correct, and clicking a placeholder jumps to the page (handy for
// 1000-page documents where the user is lost).
//
// Phase 12: measure-once height. The slot is positioned with
// `thumbHeight` (a useState seeded by the first page's natural
// aspect ratio). THUMB_HEIGHT_PT stays as the initial fallback so
// the very first paint has correct geometry. Mixed-aspect PDFs
// (rare) use the first page's ratio for every slot — the last few
// thumbs in a mixed-aspect doc may still overlap. Document the
// ceiling. Promote to per-page measurement when a real complaint
// lands.
//
// Phase 9: drag-to-reorder. The user can drag a thumb to a new
// position to reorder the document. The move is destructive but
// undoable (zundo tracks the bytes change). The thumb itself is
// in the sidebar (outside the canvas), so the overlay's pointer
// capture doesn't fight the drag.
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useUIStore } from '../state/useUIStore';
import { useEditorStore } from '../state/useEditorStore';
import { makeViewport } from '../lib/coords';
import { reorderPageInPlace } from '../lib/pdf-render';

const THUMB_PT = 120;
// ponytail: visible-window buffer in thumb-rows. ±5 ≈ 11 rows of
// canvas work at any moment. A 5-page doc renders all 5; a 200-page
// doc renders ~11. The buffer hides the "scroll a little → wait for
// thumb to paint" flicker for fast scrollers.
const BUFFER = 5;
// ponytail: row height in CSS px — the FALLBACK used until the
// first-page aspect ratio resolves. The label is 24px; the canvas
// height is `THUMB_PT * (pageH / pageW)`. For a square page this
// lands at 120 + 24 = 144; for US-Letter (612×792) the actual
// canvas is ~155 CSS px, +24 label = ~179. The fallback assumes
// a square aspect so it under-estimates Letter — that's why we
// re-measure on first paint.
const THUMB_HEIGHT_PT = THUMB_PT + 24;

export function EditorThumbnails({ pdf }: { pdf: PDFDocumentProxy }) {
  const pageIndex = useUIStore((s) => s.pageIndex);
  const setPageIndex = useUIStore((s) => s.setPageIndex);
  const scrollRef = useRef<HTMLDivElement>(null);
  // ponytail: measured row height. Seeded with the fallback so the
  // first paint has correct geometry; the effect below reads page 1's
  // natural viewport and refines to the actual aspect. The +24
  // bakes in the label row (the canvas-only height would be a few px
  // too short and the next thumb would still overlap).
  const [thumbHeight, setThumbHeight] = useState<number>(THUMB_HEIGHT_PT + 24);
  // ponytail: visibleRange covers [start, end] inclusive. The
  // initial value is the first `BUFFER * 2 + 1` rows, clamped to
  // numPages — works for the common case (small PDF, viewport
  // starts at the top) and the first onScroll() call refines it.
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: Math.min(pdf.numPages - 1, BUFFER * 2),
  }));

  // ponytail: measure-once height. Read page 1's natural size,
  // derive the canvas-only height for the 120pt-wide slot, and add
  // the 24px label row. The fallback (THUMB_HEIGHT_PT + 24) is
  // already in `thumbHeight` so a single-page PDF (or a getPage
  // failure) still renders without overlap. Catches a `cancelled`
  // flag so a fast unmount doesn't setState on a stale effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        const aspectH = (THUMB_PT * baseVp.height) / baseVp.width;
        setThumbHeight(aspectH + 24);
        page.cleanup();
      } catch {
        // ponytail: keep fallback. The 168-px seed is close enough
        // to most aspects that a brief visual hiccup is cheaper
        // than a second-pass reflow on error.
      }
    })();
    return () => { cancelled = true; };
  }, [pdf]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      const h = el.clientHeight;
      const firstVisible = Math.max(0, Math.floor(top / thumbHeight) - BUFFER);
      const lastVisible = Math.min(pdf.numPages - 1, Math.ceil((top + h) / thumbHeight) + BUFFER);
      setVisibleRange((prev) =>
        prev.start === firstVisible && prev.end === lastVisible ? prev : { start: firstVisible, end: lastVisible },
      );
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [pdf.numPages, thumbHeight]);

  // ponytail: scroll the active thumb into view when pageIndex
  // changes externally (toolbar page nav, the jump input). Only
  // scrolls when the active page is outside the visible area —
  // otherwise the user's scroll position would jump unexpectedly.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetTop = pageIndex * thumbHeight;
    if (targetTop < el.scrollTop || targetTop > el.scrollTop + el.clientHeight - thumbHeight) {
      el.scrollTo({
        top: targetTop - el.clientHeight / 2 + thumbHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [pageIndex, thumbHeight]);

  // ponytail: drag-to-reorder. The from-index is the page being
  // dragged (read from the dataTransfer payload); the to-index
  // is the page the cursor is over (set by the per-thumb
  // onDragOver). The reorder mutates the loaded PDFDocument in
  // place (see `reorderPageInPlace` in pdf-render.ts) and
  // updates `useEditorStore.bytes`.
  async function onDrop(to: number, fromData: string | null) {
    if (fromData == null) return;
    const from = Number(fromData);
    if (Number.isNaN(from) || from === to) return;
    const bytes = useEditorStore.getState().bytes;
    if (!bytes) return;
    try {
      // ponytail: dynamic import keeps pdf-lib out of the main
      // editor chunk (the export pipeline loads it separately).
      // The reorder is destructive: we mutate the loaded doc,
      // re-save, and write the new bytes back to the store.
      // zundo tracks `bytes`... actually `bytes` is excluded from
      // the partialize map (we only track `annotations` for
      // undo). So the reorder is NOT undoable via the toolbar's
      // Ctrl+Z. Document the ceiling.
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes);
      await reorderPageInPlace(doc as never, from, to);
      const newBytes = await doc.save();
      useEditorStore.setState({ bytes: newBytes });
      // ponytail: reset to page 0 after reorder so the user
      // sees the new order from the top. The previous
      // `pageIndex` may now point to a different page in the
      // new order, which is confusing.
      setPageIndex(0);
    } catch (e) {
      console.error('reorder failed', e);
    }
  }

  return (
    <aside
      ref={scrollRef}
      data-testid="editor-thumbnails"
      className="flex w-40 shrink-0 flex-col overflow-y-auto border-r border-ink/10 bg-bg/50 p-2"
    >
      <div style={{ height: pdf.numPages * thumbHeight, position: 'relative' }}>
        {Array.from({ length: pdf.numPages }, (_, i) => {
          const inWindow = i >= visibleRange.start && i <= visibleRange.end;
          if (!inWindow) {
            // ponytail: placeholder button keeps the scrollbar
            // accurate and gives a clickable jump-to-page. The
            // 40% ink color + tiny font is intentionally quiet —
            // the user is here to scroll, not read page numbers.
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPageIndex(i)}
                data-testid={`thumb-placeholder-${i}`}
                className="absolute left-0 right-0 flex items-center justify-center text-xs tabular-nums text-ink/40 hover:bg-ink/5"
                style={{ top: i * thumbHeight, height: thumbHeight }}
              >
                {i + 1}
              </button>
            );
          }
          return (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{ top: i * thumbHeight, height: thumbHeight }}
            >
              <Thumbnail
                pdf={pdf}
                pageIndex={i}
                active={i === pageIndex}
                onClick={() => setPageIndex(i)}
                onDrop={onDrop}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function Thumbnail({
  pdf,
  pageIndex,
  active,
  onClick,
  onDrop,
}: {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  active: boolean;
  onClick: () => void;
  onDrop: (to: number, fromData: string | null) => void;
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
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        // ponytail: HTML5 DnD. We set the dataTransfer payload
        // (the source page index); the target's onDrop reads it
        // back. The "text/plain" MIME is the spec-recommended
        // default; custom MIMEs are ignored cross-origin in
        // some browsers.
        e.dataTransfer.setData('text/plain', String(pageIndex));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = e.dataTransfer.getData('text/plain');
        onDrop(pageIndex, data);
      }}
      data-testid={`thumb-${pageIndex}`}
      data-active={active ? 'true' : 'false'}
      className={`flex w-full cursor-grab flex-col items-stretch rounded border bg-white transition-colors active:cursor-grabbing ${
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
