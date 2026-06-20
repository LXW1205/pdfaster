// ponytail: the signature tool's overlay. When activeTool === 'signature',
// the AnnotationOverlay's `isTool` check is false (see the new short-circuit
// added in AnnotationOverlay), so the underlying canvas does NOT capture
// pointer events. This component owns input exclusively.
//
// The pad is a 400×150 <canvas> with onPointer* handlers. The drawn path
// becomes a PNG data URL on Apply via `canvas.toDataURL('image/png')`.
// Apply commits a `signature` annotation at the center of the current
// page (200×60 pt default). Clicking the backdrop (outside the card)
// dismisses without committing — the user can change their mind without
// leaving a stray annotation. Event.stopPropagation on the card keeps
// backdrop-click from firing.
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { useUIStore } from '../state/useUIStore';
import type { Viewport } from '../lib/coords';

const PAD_W = 400;
const PAD_H = 150;
const SIG_W = 200;
const SIG_H = 60;

type Props = { viewport: Viewport; pageIndex: number };

export function SignatureOverlay({ viewport, pageIndex }: Props) {
  const activeTool = useUIStore((s) => s.activeTool);
  if (activeTool !== 'signature') return null;
  return <SignaturePad viewport={viewport} pageIndex={pageIndex} />;
}

function SignaturePad({ viewport, pageIndex }: { viewport: Viewport; pageIndex: number }) {
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const addAnnotation = useEditorStore((s) => s.addAnnotation);

  // Refs for the pad canvas and the path-in-progress (one polyline per
  // pointer-down → pointer-up). Drawing a new stroke clears the old
  // stroke's visual; we don't merge polylines (the spec doesn't ask for
  // it, and the v1 UX is "sign once, apply once").
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  // ponytail: a `drawn` flag tracks whether the user actually drew
  // anything. Apply is disabled when nothing was drawn — the spec's
  // "single line" floor.
  const [drawn, setDrawn] = useState(false);
  // ponytail: bump this counter to force a full redraw of the canvas
  // on Clear (cleanest cross-browser reset; the alternative is
  // `ctx.clearRect(0, 0, w, h)`).
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PAD_W * dpr;
    canvas.height = PAD_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
  }, [resetKey]);

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPtRef.current = pt(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = pt(e);
    const last = lastPtRef.current!;
    // ponytail: 0.5 px threshold — same as AnnotationOverlay's
    // free-draw dedup. Promote to a shared util if a third
    // canvas-drawing consumer lands.
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPtRef.current = p;
    if (!drawn) setDrawn(true);
  }
  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drawingRef.current = false;
    lastPtRef.current = null;
  }

  function clear() {
    drawingRef.current = false;
    lastPtRef.current = null;
    setDrawn(false);
    setResetKey((k) => k + 1);
  }

  function apply() {
    const canvas = canvasRef.current;
    if (!canvas || !drawn) return;
    const pngDataUrl = canvas.toDataURL('image/png');
    const w = SIG_W;
    const h = SIG_H;
    const x = (viewport.pageWidthPts - w) / 2;
    const y = (viewport.pageHeightPts - h) / 2;
    addAnnotation({
      id: crypto.randomUUID(),
      type: 'signature',
      pageIndex,
      rect: { x, y, w, h },
      pngDataUrl,
      createdAt: Date.now(),
    });
    setActiveTool('select');
  }

  return (
    <div
      data-testid="signature-overlay"
      onClick={() => setActiveTool('select')}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(66, 66, 66, 0.35)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-pad-title"
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg bg-white p-4 shadow-lg"
      >
        <h2 id="signature-pad-title" className="mb-2 text-sm font-medium text-ink">
          Sign here
        </h2>
        <canvas
          ref={canvasRef}
          data-testid="signature-pad"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            display: 'block',
            width: PAD_W,
            height: PAD_H,
            border: '2px solid #48CFCB',
            borderRadius: 4,
            background: 'white',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
        <p className="mt-2 text-xs text-ink/50">Use your mouse, pen, or touch.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            data-testid="signature-clear"
            onClick={clear}
            className="rounded px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
          >
            Clear
          </button>
          <button
            type="button"
            data-testid="signature-apply"
            onClick={apply}
            disabled={!drawn}
            className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-ink hover:bg-secondary disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
