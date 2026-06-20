// ponytail: renders the find bar's match rectangles as a sibling
// layer above the canvas, below the annotation overlay. The
// `FindBar` writes into the `FindOverlayStore` (current matches +
// current index); this component reads from the store via
// `useSyncExternalStore` and draws. The ref+store split means
// the canvas re-render doesn't depend on React's commit cycle
// for the match list (the store updates immediately, the next
// render picks it up).
import { useMemo, useSyncExternalStore } from 'react';
import { pdfToCss, type Viewport } from '../lib/coords';
import type { FindOverlayStore } from './findStore';

export function FindOverlay({ viewport, store }: { viewport: Viewport; store: FindOverlayStore }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const rects = useMemo(
    () => snap.rects.map((r, i) => {
      const ll = pdfToCss(viewport, r.x, r.y);
      const ur = pdfToCss(viewport, r.x + r.w, r.y + r.h);
      return {
        i,
        left: Math.min(ll.x, ur.x),
        top: Math.min(ll.y, ur.y),
        width: Math.abs(ur.x - ll.x),
        height: Math.abs(ur.y - ll.y),
      };
    }),
    // ponytail: re-compute when the rect array reference changes
    // (set on every search) or when the viewport changes.
    [snap.rects, viewport],
  );
  if (rects.length === 0) return null;
  return (
    <div
      data-testid="find-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
    >
      {rects.map((r) => {
        const isCurrent = r.i === snap.current;
        return (
          <div
            key={r.i}
            data-testid={isCurrent ? 'find-match-current' : 'find-match'}
            style={{
              position: 'absolute',
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              border: `${isCurrent ? 2 : 1}px solid ${isCurrent ? '#FF6F00' : '#48CFCB'}`,
              background: isCurrent ? 'rgba(255, 111, 0, 0.12)' : 'transparent',
              borderRadius: 1,
            }}
          />
        );
      })}
    </div>
  );
}
