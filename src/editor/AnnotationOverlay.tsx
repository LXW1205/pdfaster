// ponytail: replaces the highlight-specific overlay with a generic
// one. Renders all annotations for the current page (each type's
// visual is a tiny branch — a div for rect types, an SVG <path>
// for free-draw). Dispatches draft logic based on the active tool's
// `shape` meta.
//
// The overlay subscribes to its own slice (the `annotations` array)
// — a bare `useEditorStore((s) => s.annotations)` selector is fine
// because zustand returns the same reference when the array is
// unchanged. Filter + sort happens in a `useMemo` with primitive
// deps so React doesn't re-render on every commit. Promote to a
// per-page-index selector when annotations grow past a few hundred.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { useUIStore, type ToolId } from '../state/useUIStore';
import { AnnotationRegistry } from '../annotations/registry';
import type { Annotation, AnnotationTypeMeta, PointPts, RectPts, Rgb } from '../annotations/types';
import { cssToPdf, pdfToCss, type Viewport } from '../lib/coords';

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

  return (
    <div
      data-testid="annotation-overlay"
      data-active-tool={activeTool}
      onPointerDown={(e) => {
        if (!isTool) return;
        if (meta.shape === 'rect') startRect(e);
        else startPolyline(e);
      }}
      onPointerMove={(e) => {
        if (!isTool) return;
        if (draftRef.current?.kind === 'rect') moveRect(e);
        else if (draftRef.current?.kind === 'polyline') movePolyline(e);
      }}
      onPointerUp={(e) => {
        if (!isTool) return;
        if (draftRef.current?.kind === 'rect') endRect(e);
        else if (draftRef.current?.kind === 'polyline') endPolyline(e);
      }}
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        draftRef.current = null;
        setDraft(null);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: isTool ? 'crosshair' : 'default',
        touchAction: 'none',
        pointerEvents: isTool ? 'auto' : 'none',
      }}
    >
      {onPage.map((a) => <AnnotationView key={a.id} a={a} viewport={viewport} />)}
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
