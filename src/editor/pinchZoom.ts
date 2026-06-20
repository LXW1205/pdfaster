// ponytail: two-pointer pinch. We don't preserve the pinch
// center for v1 — the canvas zoom is around the (0, 0) corner
// of the container, which feels "centered enough" on a 200x300px
// canvas. Preserve-center is a future enhancement (math: scale
// the pan transform by the same factor as the zoom delta).
//
// The math is a pure function so the e2e can unit-test it
// (Playwright's multi-touch API is limited — `page.touchscreen`
// only supports single touches, and the real `CDPSession`
// multi-touch flow is brittle). The wrapper component subscribes
// to the active tool's pointer events; the math stays out of
// the React render path.

export function pinchZoom(
  initialZoom: number,
  initialDistance: number,
  currentDistance: number,
  min = 0.25,
  max = 4,
): number {
  if (initialDistance <= 0 || currentDistance <= 0) return initialZoom;
  const ratio = currentDistance / initialDistance;
  return Math.min(max, Math.max(min, initialZoom * ratio));
}
