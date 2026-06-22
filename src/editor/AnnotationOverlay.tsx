// ponytail: replaces the highlight-specific overlay with a generic
// one. Renders all annotations for the current page (each type's
// visual is a tiny branch — a div for rect types, an SVG <path>
// for free-draw). Dispatches draft logic based on the active tool's
// `shape` meta.
//
// Phase 11: the overlay now also handles the `select` tool. Three
// dispatch branches: `rect` (draft a new highlight/rect/etc.),
// `polyline` (draft free-draw), and `select` (click an annotation
// to select + drag to move, drag handles to resize, Delete/Backspace
// to remove, Escape to deselect, click empty space to deselect).
//
// The overlay subscribes to its own slice (the `annotations` array)
// — a bare `useEditorStore((s) => s.annotations)` selector is fine
// because zustand returns the same reference when the array is
// unchanged. Filter + sort happens in a `useMemo` with primitive
// deps so React doesn't re-render on every commit. Promote to a
// per-page-index selector when annotations grow past a few hundred.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { useUIStore, type ToolId } from '../state/useUIStore';
import { AnnotationRegistry } from '../annotations/registry';
import type { Annotation, AnnotationTypeMeta, PointPts, RectPts, Rgb } from '../annotations/types';
import { cssToPdf, pdfToCss, type Viewport } from '../lib/coords';
import { SelectionHandles } from './SelectionHandles';

type Props = { viewport: Viewport; pageIndex: number };

type RectDraft = { kind: 'rect'; tool: ToolId; rect: RectPts };
type PolylineDraft = { kind: 'polyline'; tool: ToolId; points: PointPts[] };
type Draft = RectDraft | PolylineDraft;

// ponytail: the per-tool color lookup. Looks up the picked color
// in the store's `toolColors[activeTool]`; falls back to the
// registry's `defaultStyle.color`. `select` (the no-op default)
// falls back to black — picking a color while select is active
// stores under 'select' (the picker is hidden in that case).
function currentColorForTool(
  tool: ToolId,
  picked: Partial<Record<string, Rgb>> = {},
): Rgb {
  const pickedColor = picked[tool];
  if (pickedColor) return pickedColor;
  if (tool === 'select') return [0, 0, 0];
  const meta = AnnotationRegistry.list().find((m) => m.tool === tool);
  if (!meta) return [0, 0, 0];
  return meta.defaultStyle.color;
}

export function AnnotationOverlay({ viewport, pageIndex }: Props) {
  const annotations = useEditorStore((s) => s.annotations);
  const addAnnotation = useEditorStore((s) => s.addAnnotation);
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);
  const removeAnnotation = useEditorStore((s) => s.removeAnnotation);
  const selectedId = useEditorStore((s) => s.selectedId);
  const setSelectedId = useEditorStore((s) => s.setSelectedId);
  const activeTool = useUIStore((s) => s.activeTool);

  // ponytail: resolve the active tool's meta once per activeTool change.
  // `select` (no annotation tool) is a no-op — the overlay is still
  // rendered (so committed annotations stay visible) but doesn't
  // capture pointer events.
  const meta = useMemo<AnnotationTypeMeta | null>(
    () => (activeTool === 'select' ? null : AnnotationRegistry.list().find((m) => m.tool === activeTool) ?? null),
    [activeTool],
  );

  const draftRef = useRef<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // ponytail: filter+sort in a useMemo. Stable reference from
  // zustand's `annotations` selector means we only re-filter when
  // annotations change or the page changes.
  const onPage = useMemo(
    () => annotations.filter((a) => a.pageIndex === pageIndex).sort((a, b) => a.createdAt - b.createdAt),
    [annotations, pageIndex],
  );

  // ponytail: the per-tool picked color. The map is a stable
  // reference until `setToolColor` runs, so this subscription
  // fires only on a color pick. Reads via `useStore` directly
  // would also work; we go through the typed hook.
  const toolColors = useEditorStore((s) => s.toolColors);

  // ponytail: the picked color for the active tool. Reads from
  // `useEditorStore.toolColors[activeTool]`; falls back to the
  // registry's default. Returned as a plain tuple (the store
  // type is `Rgb`, the registry default is also `Rgb`).
  const currentColor = useMemo<Rgb>(
    () => currentColorForTool(activeTool, toolColors),
    [activeTool, toolColors],
  );

  // ponytail: the selected annotation (derived from `selectedId` +
  // the annotations array). The visual is per-page: the overlay
  // renders the selection chrome only when the selected annotation
  // lives on the current page. Cross-page selection still works
  // (the Delete keypress handler acts on the global id) but
  // there's no visible affordance until the user navigates back.
  const selected = useMemo<Annotation | null>(
    () => (selectedId ? annotations.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, annotations],
  );
  const selectedOnPage = selected && selected.pageIndex === pageIndex ? selected : null;

  const localCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function startRect(e: React.PointerEvent<HTMLDivElement>) {
    if (!meta || meta.shape !== 'rect') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = localCoords(e);
    const p = cssToPdf(viewport, x, y);
    draftRef.current = { kind: 'rect', tool: meta.tool, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
    setDraft({ ...draftRef.current });
  }
  function moveRect(e: React.PointerEvent<HTMLDivElement>) {
    const d = draftRef.current;
    if (!d || d.kind !== 'rect') return;
    const { x, y } = localCoords(e);
    const p = cssToPdf(viewport, x, y);
    const start = d.rect;
    draftRef.current = { kind: 'rect', tool: d.tool, rect: { x: start.x, y: start.y, w: p.x - start.x, h: p.y - start.y } };
    setDraft({ ...draftRef.current });
  }
  function endRect(e: React.PointerEvent<HTMLDivElement>) {
    const d = draftRef.current;
    if (!d || d.kind !== 'rect' || !meta) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // ponytail: if the user changed tools mid-drag, discard the
    // draft instead of committing it to the wrong tool.
    if (d.tool !== meta.tool) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    const r = d.rect;
    // ponytail: ignore micro-drags (under 2pt) to avoid stray
    // single-click annotations. Promote to a drag-distance threshold
    // (a small `useUIStore` field or per-tool meta) when users
    // complain about click-while-aiming creating ghost annotations.
    if (Math.abs(r.w) < 2 || Math.abs(r.h) < 2) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    const base = {
      id: crypto.randomUUID(),
      // ponytail: crypto.randomUUID is the one place we mint IDs
      // today. Centralize in `lib/id.ts` when a second consumer
      // (e.g. comment threads, sticky notes) needs IDs and we want
      // a single place to swap to a non-UUID scheme.
      pageIndex,
      // ponytail: prefer the per-tool picked color from the store;
      // fall back to the registry's default. The store's
      // `toolColors` key is the ToolId, not the AnnotationType, so
      // we look up by the active tool id.
      color: currentColor,
      opacity: meta.defaultStyle.opacity,
      createdAt: Date.now(),
    };
    let a: Annotation;
    if (meta.type === 'rectangle' || meta.type === 'ellipse') {
      a = { ...base, type: meta.type, rect: r, strokeWidth: meta.defaultStyle.strokeWidth ?? 2 };
    } else {
      a = { ...base, type: meta.type as 'highlight' | 'underline' | 'strikethrough', rect: r };
    }
    addAnnotation(a);
    draftRef.current = null;
    setDraft(null);
  }
  function startPolyline(e: React.PointerEvent<HTMLDivElement>) {
    if (!meta || meta.shape !== 'polyline') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = localCoords(e);
    const p = cssToPdf(viewport, x, y);
    draftRef.current = { kind: 'polyline', tool: meta.tool, points: [p] };
    setDraft({ ...draftRef.current });
  }
  function movePolyline(e: React.PointerEvent<HTMLDivElement>) {
    const d = draftRef.current;
    if (!d || d.kind !== 'polyline') return;
    const { x, y } = localCoords(e);
    const p = cssToPdf(viewport, x, y);
    const last = d.points[d.points.length - 1]!;
    // ponytail: skip points closer than 1pt to the previous to
    // avoid thousands of micro-segments in the polyline. Promote
    // to a configurable threshold (tool meta + a small numeric
    // setting) and a pointer-smoothing pass (Catmull–Rom or
    // Chaikin) when free-draw becomes a real feature.
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
    d.points.push(p);
    setDraft({ kind: 'polyline', tool: d.tool, points: [...d.points] });
  }
  function endPolyline(e: React.PointerEvent<HTMLDivElement>) {
    const d = draftRef.current;
    if (!d || d.kind !== 'polyline' || !meta) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // ponytail: tool-change mid-drag → discard. Same reason as
    // endRect.
    if (d.tool !== meta.tool) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    if (d.points.length < 2) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    const a: Annotation = {
      id: crypto.randomUUID(),
      type: 'freedraw',
      pageIndex,
      points: d.points,
      // ponytail: see the rect branch — use the per-tool picked
      // color when present, fall back to the registry default.
      color: currentColor,
      opacity: meta.defaultStyle.opacity,
      strokeWidth: meta.defaultStyle.strokeWidth ?? 2,
      createdAt: Date.now(),
    };
    addAnnotation(a);
    draftRef.current = null;
    setDraft(null);
  }

  // ponytail: only attach pointer handlers when an annotation tool
  // is active. `select` lets the canvas + committed annotations
  // pass through pointer events to whatever is below (e.g. future
  // text selection or form-field interaction). `cursor: crosshair`
  // is the standard editing affordance. `signature` is excluded
  // because the SignatureOverlay owns input exclusively (a modal-style
  // pad on top of the page) — letting AnnotationOverlay capture
  // would steal strokes from the pad.
  const isTool = meta !== null && activeTool !== 'signature';
  const isSelectMode = activeTool === 'select';

  // ponytail: the overlay needs to receive pointer events in two
  // cases — an annotation tool is active (draft a new annotation)
  // OR the select tool is active (click empty space to deselect).
  // The signature pad is the only tool that locks out the overlay
  // entirely (it owns a modal surface).
  const interactive = isTool || isSelectMode;

  // ponytail: if the user clicks a different tool while a draft is
  // in flight, the visual draft would otherwise stay on screen until
  // pointerup. The `pointerup` handler checks `meta` against the
  // captured draft tool and discards the draft if they don't match —
  // so the visual would also be wrong. Hide the visual when the
  // active tool has changed since the draft started. We tag the
  // draft with the tool ID at start time and compare on render.
  // (The ref-only reset is here to defend against the
  // activeTool-while-pointerdown race; it doesn't trigger a re-render.)
  useEffect(() => {
    // ponytail: explicit comment for the lint rule. This effect
    // runs only on unmount (no deps), so the ref-only reset is
    // safe. When the user changes tools mid-drag, the ref is
    // cleared by the pointerup handler's `meta` check; the visual
    // is hidden by the `draftTool === activeTool` guard below.
    return () => {
      draftRef.current = null;
    };
  }, []);

  // ponytail: a move drag in flight. Refs don't trigger re-renders;
  // the move handler updates the annotation via `updateAnnotation`,
  // which triggers a re-render through the normal subscription
  // path. The overlay's onPointerMove dispatches to `moveCurrentMove`
  // if a move is active; the overlay's onPointerUp clears the ref.
  // We use window-level pointer events (set up by the click target's
  // onPointerDown) so a drag that leaves the page canvas still
  // tracks the pointer.
  const moveRef = useRef<{
    annotationId: string;
    startCssX: number;
    startCssY: number;
  } | null>(null);

  function startMove(a: Annotation, e: React.PointerEvent) {
    // ponytail: stop propagation so the overlay's onPointerDown
    // doesn't see the click as "empty space" and deselect. The
    // click target owns the gesture.
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(a.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moveRef.current = {
      annotationId: a.id,
      startCssX: e.clientX,
      startCssY: e.clientY,
    };
  }

  // ponytail: keyboard handler for the select tool. Delete /
  // Backspace removes the selected annotation; Escape deselects.
  // Skipped when an input/textarea/contenteditable is focused so
  // typing in the page-jump input or the find bar doesn't remove
  // an annotation the user can't see. The cheatsheet's Escape
  // handler is a separate effect that closes the cheatsheet when
  // open — both handlers are window-level and don't conflict.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeAnnotation(selectedId);
        setSelectedId(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, removeAnnotation, setSelectedId]);

  return (
    <div
      data-testid="annotation-overlay"
      data-active-tool={activeTool}
      onPointerDown={(e) => {
        // ponytail: select mode — clicks on empty space deselect.
        // A click on an annotation's click target fires that child's
        // onPointerDown (which calls startMove and stopPropagation);
        // this branch only runs when the click lands directly on the
        // overlay div (`e.target === e.currentTarget`).
        if (isSelectMode) {
          if (e.target === e.currentTarget) {
            setSelectedId(null);
          }
          return;
        }
        if (!isTool) return;
        if (meta.shape === 'rect') startRect(e);
        else startPolyline(e);
      }}
      onPointerMove={(e) => {
        // ponytail: a move drag is in flight. Compute the delta in
        // CSS pixels, convert to PDF points via /zoom, and translate
        // either the rect (for rect-based types) or every point (for
        // free-draw). Width / height are untouched on a move. The
        // y axis is INVERTED: CSS y grows downward, PDF y grows
        // upward, so a positive CSS-px delta in y is a negative
        // PDF-pt delta. Forgetting the sign makes the annotation
        // move the "wrong way" relative to the cursor.
        const m = moveRef.current;
        if (m) {
          const a = useEditorStore.getState().annotations.find((x) => x.id === m.annotationId);
          if (!a) return;
          const dxPts = (e.clientX - m.startCssX) / viewport.zoom;
          const dyPts = (e.clientY - m.startCssY) / viewport.zoom;
          if (a.type === 'freedraw') {
            const newPoints = a.points.map((p) => ({ x: p.x + dxPts, y: p.y - dyPts }));
            updateAnnotation(a.id, { points: newPoints });
          } else {
            const r = a.rect;
            updateAnnotation(a.id, { rect: { ...r, x: r.x + dxPts, y: r.y - dyPts } });
          }
          // ponytail: do NOT update `m.startCssX/Y` — the delta is
          // cumulative from the initial pointerdown, not incremental
          // from the last pointermove. Incremental math would drift
          // if a single pointermove was dropped.
          return;
        }
        if (!isTool) return;
        if (draftRef.current?.kind === 'rect') moveRect(e);
        else if (draftRef.current?.kind === 'polyline') movePolyline(e);
      }}
      onPointerUp={(e) => {
        if (moveRef.current) {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          moveRef.current = null;
          return;
        }
        if (!isTool) return;
        if (draftRef.current?.kind === 'rect') endRect(e);
        else if (draftRef.current?.kind === 'polyline') endPolyline(e);
      }}
      onPointerCancel={(e) => {
        if (moveRef.current) {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          moveRef.current = null;
          return;
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        draftRef.current = null;
        setDraft(null);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: isSelectMode ? 'default' : isTool ? 'crosshair' : 'default',
        touchAction: 'none',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      {onPage.map((a) => (
        <Fragment key={a.id}>
          <AnnotationView a={a} viewport={viewport} />
          {isSelectMode && (
            <SelectionClickTarget
              annotation={a}
              viewport={viewport}
              onPointerDown={(e) => startMove(a, e)}
            />
          )}
        </Fragment>
      ))}
      {selectedOnPage && selectedOnPage.type !== 'freedraw' && (
        <SelectionHandles
          annotation={selectedOnPage as Extract<Annotation, { type: 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse' | 'signature' }>}
          viewport={viewport}
        />
      )}
      {selectedOnPage && selectedOnPage.type === 'freedraw' && (
        // ponytail: free-draw move-only in v1. The visual is a
        // dashed path along the polyline (no resize handles).
        // Dragging the dashed path (via the click target) translates
        // every point; the dashed visual updates because the
        // annotation's points change. The resize ceiling is
        // documented in the spec's "deferred" list.
        <FreedrawSelectionOutline annotation={selectedOnPage} viewport={viewport} />
      )}
      {draft?.kind === 'rect' && draft.tool === activeTool && (
        <RectView
          rect={draft.rect}
          type={meta!.type as 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse'}
          color={currentColor}
          opacity={meta!.defaultStyle.opacity}
          strokeWidth={meta!.defaultStyle.strokeWidth}
          viewport={viewport}
          draft
        />
      )}
      {draft?.kind === 'polyline' && draft.tool === activeTool && <PolylineView points={draft.points} color={currentColor} strokeWidth={meta!.defaultStyle.strokeWidth} opacity={meta!.defaultStyle.opacity} viewport={viewport} draft />}
    </div>
  );
}

function AnnotationView({ a, viewport }: { a: Annotation; viewport: Viewport }) {
  if (a.type === 'freedraw') return <PolylineView points={a.points} color={a.color} strokeWidth={a.strokeWidth} opacity={a.opacity} viewport={viewport} />;
  if (a.type === 'signature') return <SignatureView rect={a.rect} pngDataUrl={a.pngDataUrl} viewport={viewport} />;
  return <RectView rect={a.rect} type={a.type} color={a.color} opacity={a.opacity} strokeWidth={'strokeWidth' in a ? a.strokeWidth : undefined} viewport={viewport} />;
}

// ponytail: the in-editor visual of a committed signature. The
// /Stamp annotation has no /AP in v1 (see register.ts + exportPdf
// comments) so the exported PDF shows an empty rect. The
// source-of-truth visual lives in the editor only — `pngDataUrl` is
// the canonical record. Promote to a `lib/img-data-url.ts` helper
// when a second consumer (e.g. a thumbnail strip of recent
// signatures) needs the data-URL math.
function SignatureView({ rect, pngDataUrl, viewport }: { rect: RectPts; pngDataUrl: string; viewport: Viewport }) {
  const minX = Math.min(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const ll = pdfToCss(viewport, minX, minY);
  const ur = pdfToCss(viewport, minX + Math.abs(rect.w), minY + Math.abs(rect.h));
  return (
    <img
      data-testid="annotation-signature"
      src={pngDataUrl}
      alt="Signature"
      style={{
        position: 'absolute',
        left: Math.min(ll.x, ur.x),
        top: Math.min(ll.y, ur.y),
        width: Math.abs(ur.x - ll.x),
        height: Math.abs(ur.y - ll.y),
        pointerEvents: 'none',
        objectFit: 'contain',
      }}
    />
  );
}

// ponytail: one rect renderer for both committed and draft. The
// visual style switches on `type` — highlight is a translucent
// fill, underline / strikethrough are a single horizontal stroke,
// rectangle / ellipse are an outlined rect/ellipse with transparent
// fill. All measurements in PDF points; the inner helper converts
// to CSS px once via pdfToCss.
function RectView({
  rect,
  type,
  color,
  opacity,
  strokeWidth,
  viewport,
  draft = false,
}: {
  rect: RectPts;
  type?: Annotation['type'];
  color?: readonly [number, number, number];
  opacity?: number;
  strokeWidth?: number;
  viewport: Viewport;
  draft?: boolean;
}) {
  const minX = Math.min(rect.x, rect.x + rect.w);
  const maxX = Math.max(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const maxY = Math.max(rect.y, rect.y + rect.h);
  const ll = pdfToCss(viewport, minX, minY);
  const ur = pdfToCss(viewport, maxX, maxY);
  const left = Math.min(ll.x, ur.x);
  const top = Math.min(ll.y, ur.y);
  const width = Math.abs(ur.x - ll.x);
  const height = Math.abs(ur.y - ll.y);
  const cssColor = `rgb(${Math.round((color?.[0] ?? 1) * 255)}, ${Math.round((color?.[1] ?? 1) * 255)}, ${Math.round((color?.[2] ?? 1) * 255)})`;
  const cssOpacity = opacity ?? 0.4;
  const cssStroke = (strokeWidth ?? 2) * viewport.zoom;

  if (type === 'underline' || type === 'strikethrough') {
    // ponytail: render as a single horizontal stroke. Underline at
    // the bottom of the rect, strikethrough through the middle.
    // 1px-equivalent height — the spec doesn't require exact
    // visual parity with the on-page text; close enough for v1.
    const yCss = type === 'underline' ? top + height - 1 : top + height / 2;
    return (
      <div
        data-testid={draft ? 'annotation-draft' : `annotation-${type}`}
        style={{
          position: 'absolute',
          left,
          top: yCss,
          width,
          height: 2,
          backgroundColor: cssColor,
          opacity: cssOpacity,
          pointerEvents: 'none',
        }}
      />
    );
  }
  if (type === 'ellipse') {
    // ponytail: SVG ellipse — a CSS border-radius pill is a hack
    // (it would clip the corners). SVG gives us a real ellipse
    // outline with transparent fill.
    const cx = left + width / 2;
    const cy = top + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    return (
      <svg
        data-testid={draft ? 'annotation-draft' : `annotation-${type}`}
        style={{ position: 'absolute', left: 0, top: 0, width: viewport.cssWidth, height: viewport.cssHeight, pointerEvents: 'none', overflow: 'visible' }}
        width={viewport.cssWidth}
        height={viewport.cssHeight}
      >
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={cssColor} strokeOpacity={cssOpacity} strokeWidth={cssStroke} />
      </svg>
    );
  }
  // Default: highlight (translucent fill) or rectangle (outline).
  const isHighlight = type === 'highlight' || type === undefined;
  return (
    <div
      data-testid={draft ? 'annotation-draft' : `annotation-${type ?? 'highlight'}`}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        backgroundColor: isHighlight ? cssColor : 'transparent',
        border: isHighlight ? undefined : `${cssStroke}px solid ${cssColor}`,
        opacity: isHighlight ? cssOpacity : 1,
        pointerEvents: 'none',
      }}
    />
  );
}

function PolylineView({
  points,
  meta,
  color,
  strokeWidth,
  opacity,
  viewport,
  draft = false,
}: {
  points: PointPts[];
  meta?: AnnotationTypeMeta;
  color?: readonly [number, number, number];
  strokeWidth?: number;
  opacity?: number;
  viewport: Viewport;
  draft?: boolean;
}) {
  if (points.length < 2) return null;
  const cssPoints = points.map((p) => pdfToCss(viewport, p.x, p.y));
  const d = cssPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const cssColor = color ?? meta?.defaultStyle.color ?? ([0.13, 0.59, 0.6] as const);
  const cssStroke = (strokeWidth ?? meta?.defaultStyle.strokeWidth ?? 2) * viewport.zoom;
  const cssOpacity = opacity ?? meta?.defaultStyle.opacity ?? 1;
  return (
    <svg
      data-testid={draft ? 'annotation-draft' : 'annotation-freedraw'}
      style={{ position: 'absolute', left: 0, top: 0, width: viewport.cssWidth, height: viewport.cssHeight, pointerEvents: 'none', overflow: 'visible' }}
      width={viewport.cssWidth}
      height={viewport.cssHeight}
    >
      <path d={d} fill="none" stroke={`rgb(${Math.round(cssColor[0] * 255)}, ${Math.round(cssColor[1] * 255)}, ${Math.round(cssColor[2] * 255)})`} strokeOpacity={cssOpacity} strokeWidth={cssStroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ponytail: invisible click + drag target for an annotation in
// select mode. The actual visual (RectView / PolylineView /
// SignatureView) is `pointer-events: none`, so the user can't
// click on it directly. The click target sits on top of the
// visual, is invisible (transparent), and re-enables pointer
// events. Clicking it sets the selected id and starts a move
// drag (in the parent overlay's onPointerDown / onPointerMove).
// For free-draw, the click target is the bounding box of the
// polyline — clicking inside the bbox (even off the actual
// stroke) selects the annotation. This is the standard
// paint-program UX floor; promote to a stroke-tight hit-test
// when a user complains about clicking "near" a stroke.
function SelectionClickTarget({
  annotation,
  viewport,
  onPointerDown,
}: {
  annotation: Annotation;
  viewport: Viewport;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  // Compute the CSS rect for the click target. Free-draw uses
  // the bounding box of all points; everything else uses the
  // annotation's `rect` field. The two branches converge on
  // the same four locals.
  let minX: number, maxX: number, minY: number, maxY: number;
  if (annotation.type === 'freedraw') {
    minX = annotation.points[0]!.x;
    maxX = annotation.points[0]!.x;
    minY = annotation.points[0]!.y;
    maxY = annotation.points[0]!.y;
    for (const p of annotation.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  } else {
    const r = annotation.rect;
    minX = Math.min(r.x, r.x + r.w);
    maxX = Math.max(r.x, r.x + r.w);
    minY = Math.min(r.y, r.y + r.h);
    maxY = Math.max(r.y, r.y + r.h);
  }
  const a = pdfToCss(viewport, minX, minY);
  const b = pdfToCss(viewport, maxX, maxY);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  return (
    <div
      data-testid="annotation-click-target"
      data-annotation-id={annotation.id}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        cursor: 'move',
        touchAction: 'none',
      }}
    />
  );
}

// ponytail: the selection visual for a free-draw annotation. A
// dashed path along the polyline. No resize handles (resize is
// deferred for free-draw — see spec). The outline is `pointer-
// events: none` so it doesn't steal the click target's drag.
function FreedrawSelectionOutline({
  annotation,
  viewport,
}: {
  annotation: Extract<Annotation, { type: 'freedraw' }>;
  viewport: Viewport;
}) {
  const cssPoints = annotation.points.map((p) => pdfToCss(viewport, p.x, p.y));
  const d = cssPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  return (
    <svg
      data-testid="freedraw-selection-outline"
      style={{ position: 'absolute', left: 0, top: 0, width: viewport.cssWidth, height: viewport.cssHeight, pointerEvents: 'none', overflow: 'visible' }}
      width={viewport.cssWidth}
      height={viewport.cssHeight}
    >
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="4 4" />
    </svg>
  );
}
