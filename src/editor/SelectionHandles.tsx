// ponytail: 8 handles (4 corners + 4 edge midpoints) is the
// standard PDF-editor pattern. Corner handles scale the rect from
// that corner; edge handles scale along one axis. The handle's
// pointerdown captures the pointer; pointermove computes the new
// rect; pointerup commits via the store's updateAnnotation.
//
// Resize math: the handle's `dx,dy` (0..1, 0..1) names which
// edges of the rect are anchored (the opposite edges) and which
// move. The pure-math reasoning lives in `onPointerDown` — read
// the comments there before "fixing" the axis logic.
//
// SVG over 8 individual divs: the position math is `width * dx`
// per handle vs. an `absolute left/top` per div, and the
// `transform: translate(0,0)` keeps the rect's origin at (0,0)
// inside the SVG so the cursor maths read straight.
import { useCallback } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { pdfToCss, type Viewport } from '../lib/coords';
import type { Annotation, RectPts } from '../annotations/types';

const HANDLE = 8;
const MIN_PT = 4; // minimum 4pt side after a resize

const HANDLES = [
  { name: 'nw', cursor: 'nwse-resize', dx: 0, dy: 0 },
  { name: 'n',  cursor: 'ns-resize',   dx: 0.5, dy: 0 },
  { name: 'ne', cursor: 'nesw-resize', dx: 1, dy: 0 },
  { name: 'e',  cursor: 'ew-resize',   dx: 1, dy: 0.5 },
  { name: 'se', cursor: 'nwse-resize', dx: 1, dy: 1 },
  { name: 's',  cursor: 'ns-resize',   dx: 0.5, dy: 1 },
  { name: 'sw', cursor: 'nesw-resize', dx: 0, dy: 1 },
  { name: 'w',  cursor: 'ew-resize',   dx: 0, dy: 0.5 },
] as const;

type ResizableAnnotation = Extract<
  Annotation,
  { type: 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse' | 'signature' }
>;

export function SelectionHandles({
  annotation,
  viewport,
}: {
  annotation: ResizableAnnotation;
  viewport: Viewport;
}) {
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);

  // ponytail: render the dashed border + the SVG in CSS pixels.
  // The border is `pointer-events: none` so clicks on the border
  // itself pass through to the parent overlay; the handles
  // re-enable pointer events on themselves.
  const r0 = annotation.rect;
  const minX = Math.min(r0.x, r0.x + r0.w);
  const maxX = Math.max(r0.x, r0.x + r0.w);
  const minY = Math.min(r0.y, r0.y + r0.h);
  const maxY = Math.max(r0.y, r0.y + r0.h);
  const a = pdfToCss(viewport, minX, minY);
  const b = pdfToCss(viewport, maxX, maxY);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, handle: typeof HANDLES[number]) => {
      e.stopPropagation();
      e.preventDefault();
      const startCssX = e.clientX;
      const startCssY = e.clientY;
      const startRect: RectPts = { ...annotation.rect };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      function onMove(ev: PointerEvent) {
        // ponytail: convert the CSS-px delta back to PDF points by
        // dividing by `viewport.zoom`. The handle's `dx,dy` is the
        // handle's normalized position (0..1) in CSS — `(0,0)` is
        // the top-left visually, `(1,1)` is the bottom-right.
        // dyPts is the CSS-px delta in y. The y axis is INVERTED
        // between CSS (grows down) and PDF (grows up): a positive
        // CSS-px delta means "dragged down" = "PDF y decreased".
        // The anchor-vs-move axis is therefore: top-edge handles
        // (dy=0) move the top; bottom-edge handles (dy=1) move the
        // bottom. The opposite edge is anchored.
        //
        // ponytail: shift-to-fine-resize. Same ¼ factor as move
        // (AnnotationOverlay). Holding Shift during a resize drag
        // shrinks the step to 1/4 — useful for nudging a handle by
        // a fraction of a point. Without shift, the step is 1:1
        // (current behavior).
        const factor = ev.shiftKey ? 0.25 : 1; // ponytail: Shift = ¼ size step
        const dxPts = (ev.clientX - startCssX) * factor / viewport.zoom;
        const dyPts = (ev.clientY - startCssY) * factor / viewport.zoom;
        let { x, y, w, h } = startRect;
        // West (dx=0): the left edge moves with the cursor; width shrinks.
        if (handle.dx === 0) {
          x = startRect.x + dxPts;
          w = startRect.w - dxPts;
        } else if (handle.dx === 1) {
          // East (dx=1): the right edge moves; width grows.
          w = startRect.w + dxPts;
        }
        // North (dy=0, top edge visually): the top edge moves down
        // with the cursor. In PDF, the top is the larger y; the
        // bottom is anchored. Height shrinks.
        if (handle.dy === 0) {
          h = startRect.h - dyPts;
        } else if (handle.dy === 1) {
          // South (dy=1, bottom edge visually): the bottom edge
          // moves down. In PDF, the bottom is the smaller y; the
          // top is anchored. y decreases (move down in PDF) and h
          // grows.
          y = startRect.y - dyPts;
          h = startRect.h + dyPts;
        }
        // ponytail: minimum 4pt side. `Math.sign(w || 1)` keeps
        // the sign of the dragged handle (negative width would
        // invert the rect — fine for the spec, but the visual
        // border would be confusing for a user who drags inward).
        if (Math.abs(w) < MIN_PT) w = MIN_PT * Math.sign(w || 1);
        if (Math.abs(h) < MIN_PT) h = MIN_PT * Math.sign(h || 1);
        updateAnnotation(annotation.id, { rect: { x, y, w, h } });
      }
      function onUp(ev: PointerEvent) {
        (e.target as HTMLElement).releasePointerCapture(ev.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [annotation.id, annotation.rect, updateAnnotation, viewport.zoom],
  );

  return (
    <>
      <div
        data-testid="selection-border"
        className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary"
        style={{ left, top, width, height }}
      />
      <svg
        className="pointer-events-none absolute"
        style={{ left, top, width, height, overflow: 'visible' }}
        width={width}
        height={height}
      >
        {HANDLES.map((h) => (
          <rect
            key={h.name}
            data-testid={`selection-handle-${h.name}`}
            x={h.dx * width - HANDLE / 2}
            y={h.dy * height - HANDLE / 2}
            width={HANDLE}
            height={HANDLE}
            fill="white"
            stroke="var(--color-primary)"
            strokeWidth={2}
            style={{ pointerEvents: 'auto', cursor: h.cursor }}
            onPointerDown={(e) => onPointerDown(e, h)}
          />
        ))}
      </svg>
    </>
  );
}
