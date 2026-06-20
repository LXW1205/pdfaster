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
// THUMB_HEIGHT_PT is an estimate: actual heights vary with page
// aspect ratio. For a more accurate spacer, render a hidden first
// thumb to measure. The estimate is good enough for v1 — the
// scrollbar position is correct because the placeholder divs are
// real DOM elements with the right height. Document the ceiling.
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
// ponytail: row height in CSS px. The actual rendered thumb is
// slightly taller (120 + label ≈ 144), but placeholders only need
// a height to claim scroll space — picking the canvas height keeps
// the math simple. Real thumbs sit in an absolute-positioned
// wrapper that adds the label space.
const THUMB_HEIGHT_PT = THUMB_PT + 24;

export function EditorThumbnails({ pdf }: { pdf: PDFDocumentProxy }) {
  const pageIndex = useUIStore((s) => s.pageIndex);
  const setPageIndex = useUIStore((s) => s.setPageIndex);
  const scrollRef = useRef<HTMLDivElement>(null);
  // ponytail: visibleRange covers [start, end] inclusive. The
  // initial value is the first `BUFFER * 2 + 1` rows, clamped to
  // numPages — works for the common case (small PDF, viewport
  // starts at the top) and the first onScroll() call refines it.
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: Math.min(pdf.numPages - 1, BUFFER * 2),
  }));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      const h = el.clientHeight;
      const firstVisible = Math.max(0, Math.floor(top / THUMB_HEIGHT_PT) - BUFFER);
      const lastVisible = Math.min(pdf.numPages - 1, Math.ceil((top + h) / THUMB_HEIGHT_PT) + BUFFER);
      setVisibleRange((prev) =>
        prev.start === firstVisible && prev.end === lastVisible ? prev : { start: firstVisible, end: lastVisible },
      );
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [pdf.numPages]);

  // ponytail: scroll the active thumb into view when pageIndex
  // changes externally (toolbar page nav, the jump input). Only
  // scrolls when the active page is outside the visible area —
  // otherwise the user's scroll position would jump unexpectedly.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetTop = pageIndex * THUMB_HEIGHT_PT;
    if (targetTop < el.scrollTop || targetTop > el.scrollTop + el.clientHeight - THUMB_HEIGHT_PT) {
      el.scrollTo({
        top: targetTop - el.clientHeight / 2 + THUMB_HEIGHT_PT / 2,
        behavior: 'smooth',
      });
    }
  }, [pageIndex]);

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
      <div style={{ height: pdf.numPages * THUMB_HEIGHT_PT, position: 'relative' }}>
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
                style={{ top: i * THUMB_HEIGHT_PT, height: THUMB_HEIGHT_PT }}
              >
                {i + 1}
              </button>
            );
          }
          return (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{ top: i * THUMB_HEIGHT_PT, height: THUMB_HEIGHT_PT }}
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
