// ponytail: the find bar is a focused, ephemeral UI. The search
// effect writes matches into the parent-owned FindOverlayStore
// (an external store), which is the source of truth for both
// the FindBar's "N/M" counter and the FindOverlay's match rects.
// `useDeferredValue` keeps typing snappy while the canvas
// re-renders match highlights (rerender-use-deferred-value from
// vercel-react-best-practices).
//
// Match geometry: PDF text positions are approximate. We use
// `TextItem.transform[4..5]` as the lower-left corner of the text
// run, and `transform[3]` as the font height. Width is
// `str.length × approxCharWidth` where approxCharWidth is
// 0.5 × fontHeight (a rough but cheap approximation). For the
// search match outline, the approximation is good enough; a
// per-character rect would need text-layer geometry that
// pdf.js's `getTextContent()` doesn't expose in v6.
import { useDeferredValue, useEffect, useState, useSyncExternalStore } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { FindMatch, FindOverlayStore } from './findStore';

// ponytail: `TextItem` isn't re-exported from pdfjs-dist's main
// types entry. The shape is stable across pdfjs 5/6, so we
// inline the fields we actually use.
type TextItemLike = {
  str: string;
  transform: readonly [number, number, number, number, number, number];
  width?: number;
};

type Props = {
  open: boolean;
  page: PDFPageProxy | null;
  store: FindOverlayStore;
  onClose: () => void;
};

export function FindBar({ open, page, store, onClose }: Props) {
  const [query, setQuery] = useState('');
  // ponytail: defer the query so each keystroke re-renders the
  // input + a flag, but the heavy `getTextContent` scan waits
  // for the renderer to be idle.
  const deferred = useDeferredValue(query);
  // ponytail: subscribe to the store for the match count + current
  // index. `useSyncExternalStore` is the canonical "subscribe to
  // a non-React store" hook — no setState in effect, no extra
  // forceRender() needed.
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  // ponytail: the search effect. It writes to the store
  // (an external system) — that's the canonical effect use
  // case. The store's `version` counter drives a re-render
  // via useSyncExternalStore.
  useEffect(() => {
    if (!open || !page || !deferred.trim()) {
      store.set({ rects: [], current: 0, query: '' });
      return;
    }
    // ponytail: reset the current index to 0 on every new search.
    // The page-key reset is the parent's job (EditorPage clears
    // the store on pageIndex change).
    store.set({ current: 0 });
    const p = page;
    let cancelled = false;
    (async () => {
      try {
        const tc = await p.getTextContent();
        if (cancelled) return;
        const q = deferred.toLowerCase();
        const rects: FindMatch[] = [];
        for (const raw of tc.items as unknown as TextItemLike[]) {
          if (!('str' in raw) || !raw.str) continue;
          const item = raw as TextItemLike;
          const s = item.str.toLowerCase();
          let from = 0;
          // ponytail: substring scan (not regex). The match
          // rect is a slice of the text run's bounding box.
          // pdf.js exposes `item.width` (in PDF user space) as
          // a per-run measurement; we use it when present,
          // fall back to the str-length × 0.5 × height approx.
          while (true) {
            const idx = s.indexOf(q, from);
            if (idx < 0) break;
            from = idx + q.length;
            const h = item.transform[3];
            const runW = item.width ?? item.str.length * 0.5 * h;
            const w = (q.length / item.str.length) * runW;
            const x = item.transform[4] + (idx / item.str.length) * runW;
            const y = item.transform[5];
            rects.push({ x, y, w, h });
          }
        }
        if (cancelled) return;
        store.set({ rects, current: 0, query: deferred });
      } catch {
        // ponytail: silent fail. A page with no extractable
        // text (e.g. a scanned image) just shows 0 matches.
        store.set({ rects: [], current: 0, query: deferred });
      }
    })();
    return () => { cancelled = true; };
  }, [deferred, page, open, store]);

  const matchCount = snap.rects.length;
  const current = snap.current;

  function next() {
    if (matchCount === 0) return;
    store.set({ current: (current + 1) % matchCount });
  }
  function prev() {
    if (matchCount === 0) return;
    store.set({ current: (current - 1 + matchCount) % matchCount });
  }

  if (!open) return null;
  return (
    <div
      data-testid="find-bar"
      role="search"
      className="flex items-center gap-1 rounded-md border border-ink/15 bg-bg px-2 py-1"
    >
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in page"
        aria-label="Find text in current page"
        data-testid="find-input"
        className="w-32 bg-transparent px-1 text-base text-ink placeholder:text-ink/40 focus:outline-none"
      />
      <span
        data-testid="find-count"
        className="min-w-[3rem] text-center text-xs tabular-nums text-ink/60"
      >
        {matchCount > 0 ? `${current + 1}/${matchCount}` : '0/0'}
      </span>
      <button
        type="button"
        data-testid="find-prev"
        onClick={prev}
        disabled={matchCount === 0}
        aria-label="Previous match"
        className="rounded px-1.5 text-sm text-ink/60 hover:bg-ink/5 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        data-testid="find-next"
        onClick={next}
        disabled={matchCount === 0}
        aria-label="Next match"
        className="rounded px-1.5 text-sm text-ink/60 hover:bg-ink/5 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        data-testid="find-close"
        onClick={onClose}
        aria-label="Close find bar"
        className="rounded px-1.5 text-sm text-ink/60 hover:bg-ink/5"
      >
        ×
      </button>
    </div>
  );
}

// ponytail: `useState` re-export kept here for the FindBar's
// `query` field above. Splitting into a separate file would
// require a second `import { useState }` line, which is one of
// those things nobody notices until the linter complains.
