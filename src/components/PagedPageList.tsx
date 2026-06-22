// ponytail: infinite-scroll list. Renders `count` items total in
// `initialCount + n*batchSize` chunks. IntersectionObserver on a
// sentinel div at the end of the list triggers the next batch when
// the sentinel enters the viewport. No "Show more" button — the
// scroll IS the trigger. The sentinel is aria-hidden so screen
// readers don't announce an empty list item. The observer is
// re-attached when count or visibleCount changes; cleanup on unmount.
//
// The component is purely presentational: parent owns the data,
// passes `renderItem(i) => ReactNode` and `getKey(i)` callbacks.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Props = {
  count: number;
  initialCount?: number;          // default 20
  batchSize?: number;             // default 20
  renderItem: (index: number) => ReactNode;
  getKey: (index: number) => string | number;
  ariaLabel: string;
  className?: string;
};

export function PagedPageList({
  count, initialCount = 20, batchSize = 20,
  renderItem, getKey, ariaLabel, className,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, count));
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ponytail: re-attach the observer when count or visibleCount
  // changes. The observer is the single hot path; if it's not
  // cleaned up, multiple observers accumulate and fire in
  // duplicate — a known bug class. The 200px rootMargin gives
  // a head start so the next batch is in the DOM before the user
  // sees the bottom of the current window (no visible "loading"
  // gap).
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (visibleCount >= count) return; // nothing more to load
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((c) => Math.min(c + batchSize, count));
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [count, visibleCount, batchSize]);

  return (
    <ul aria-label={ariaLabel} className={className}>
      {Array.from({ length: visibleCount }, (_, i) => (
        <li key={getKey(i)}>{renderItem(i)}</li>
      ))}
      {visibleCount < count && (
        // ponytail: the sentinel. 1px tall so it doesn't claim
        // visual space; aria-hidden so a screen reader doesn't
        // announce an empty list item. The 200px rootMargin
        // above triggers the next batch when the sentinel is
        // within 200px of the viewport.
        <div ref={sentinelRef} aria-hidden="true" className="h-1" />
      )}
    </ul>
  );
}
