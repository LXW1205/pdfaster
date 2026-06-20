import { AnnotationRegistry } from './registry';
import type { Annotation, AnnotationTypeMeta } from './types';
import type { PDFContext, PDFDocument, PDFPage } from 'pdf-lib';

// ponytail: design tokens. These three are reused across annotation
// types — TEAL is the editor's "secondary" token, YELLOW is the PDF
// spec's "highlighter yellow", RED is the conventional strikethrough
// ink. Promote to a `lib/colors.ts` module when the editor grows a
// color picker (phase 5e+).
const TEAL: readonly [number, number, number] = [0.13, 0.59, 0.6];      // #229799
const YELLOW: readonly [number, number, number] = [1.0, 0.92, 0.23];   // highlight default
const RED: readonly [number, number, number] = [0.86, 0.15, 0.15];

function quadPointsFromRect(rect: { x: number; y: number; w: number; h: number }) {
  const minX = Math.min(rect.x, rect.x + rect.w);
  const maxX = Math.max(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const maxY = Math.max(rect.y, rect.y + rect.h);
  // Counter-clockwise from top-left in PDF user space (origin bottom-left).
  return [minX, maxY, maxX, maxY, minX, minY, maxX, minY];
}

function normalizeRect(rect: { x: number; y: number; w: number; h: number }) {
  const minX = Math.min(rect.x, rect.x + rect.w);
  const maxX = Math.max(rect.x, rect.x + rect.w);
  const minY = Math.min(rect.y, rect.y + rect.h);
  const maxY = Math.max(rect.y, rect.y + rect.h);
  return [minX, minY, maxX, maxY] as const;
}

// ponytail: one helper for every text-mark + shape annotation. The
// `a: Annotation` parameter is a known limitation of the
// `Extract<Annotation, { type: Meta['type'] }>` conditional type —
// see the `toPdf` field on AnnotationTypeMeta. Fix it when a second
// generic helper in this file wants the same narrowing.
function rectToAnnot(
  ctx: PDFContext,
  _out: PDFDocument,
  _page: PDFPage,
  a: Annotation,
  subtype: string,
) {
  if (a.type === 'rectangle' || a.type === 'ellipse') {
    // /Square and /Circle with explicit /Border for stroke.
    return ctx.obj({
      Type: 'Annot',
      Subtype: subtype,
      Rect: [...normalizeRect(a.rect)],
      C: a.color,
      CA: a.opacity,
      Border: [0, 0, a.strokeWidth],
      F: 4,
    });
  }
  // ponytail: the remaining rect-based types (highlight / underline
  // / strikethrough) all share `a.rect` + `a.color` + `a.opacity`.
  // After narrowing out `freedraw` (which has `points` not `rect`)
  // and `signature` (which has `pngDataUrl` not `color`/`opacity`),
  // the union has those fields on every remaining member.
  if (a.type === 'freedraw' || a.type === 'signature') throw new Error(`unreachable: rectToAnnot called with ${a.type}`);
  const r = a.rect;
  return ctx.obj({
    Type: 'Annot',
    Subtype: subtype,
    Rect: [...normalizeRect(r)],
    QuadPoints: quadPointsFromRect(r),
    C: a.color,
    CA: a.opacity,
    F: 4,
  });
}

const highlight: AnnotationTypeMeta = {
  type: 'highlight',
  tool: 'highlight',
  label: 'Highlight',
  shape: 'rect',
  defaultStyle: { color: YELLOW, opacity: 0.4 },
  toPdf: (ctx, out, page, a) => rectToAnnot(ctx, out, page, a, 'Highlight'),
};
const underline: AnnotationTypeMeta = {
  type: 'underline',
  tool: 'underline',
  label: 'Underline',
  shape: 'rect',
  defaultStyle: { color: TEAL, opacity: 1.0 },
  toPdf: (ctx, out, page, a) => rectToAnnot(ctx, out, page, a, 'Underline'),
};
const strikethrough: AnnotationTypeMeta = {
  type: 'strikethrough',
  tool: 'strikethrough',
  label: 'Strikethrough',
  shape: 'rect',
  defaultStyle: { color: RED, opacity: 1.0 },
  toPdf: (ctx, out, page, a) => rectToAnnot(ctx, out, page, a, 'StrikeOut'),
};
const rectangle: AnnotationTypeMeta = {
  type: 'rectangle',
  tool: 'rectangle',
  label: 'Rectangle',
  shape: 'rect',
  defaultStyle: { color: TEAL, opacity: 1.0, strokeWidth: 2 },
  toPdf: (ctx, out, page, a) => rectToAnnot(ctx, out, page, a, 'Square'),
};
const ellipse: AnnotationTypeMeta = {
  type: 'ellipse',
  tool: 'ellipse',
  label: 'Ellipse',
  shape: 'rect',
  defaultStyle: { color: TEAL, opacity: 1.0, strokeWidth: 2 },
  toPdf: (ctx, out, page, a) => rectToAnnot(ctx, out, page, a, 'Circle'),
};
const freedraw: AnnotationTypeMeta = {
  type: 'freedraw',
  tool: 'freedraw',
  label: 'Free draw',
  shape: 'polyline',
  defaultStyle: { color: TEAL, opacity: 1.0, strokeWidth: 2 },
  toPdf: (ctx, _out, _page, a) => {
    if (a.type !== 'freedraw') throw new Error('unreachable: freedraw toPdf called with non-freedraw annotation');
    // ponytail: /Ink with /InkList as an array of arrays of [x, y]
    // pairs in PDF user space. One stroke → one inner array.
    // pdf-lib serializes arrays of arrays as PDF arrays — verified
    // by the e2e roundtrip in `editor-features.spec.ts`.
    const inkList = a.points.map((p) => [p.x, p.y]);
    // ponytail: a free-draw stroke's /Rect is the bounding box of the
    // polyline. Single-point strokes would have a zero-area rect,
    // which pdf.js renders as invisible; the pointer filter in
    // AnnotationOverlay discards single-point strokes, so the rect
    // here is always non-empty.
    let minX = a.points[0]!.x;
    let maxX = a.points[0]!.x;
    let minY = a.points[0]!.y;
    let maxY = a.points[0]!.y;
    for (const p of a.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return ctx.obj({
      Type: 'Annot',
      Subtype: 'Ink',
      Rect: [minX, minY, maxX, maxY],
      InkList: inkList,
      C: a.color,
      CA: a.opacity,
      Border: [0, 0, a.strokeWidth],
      F: 4,
    });
  },
};

// ponytail: signature is exported as a /Stamp annotation with the
// drawn PNG embedded as an XObject image. The stamp is placed at the
// annotation's rect; the user drags / resizes the signature rect on
// the canvas before signing. The /AP appearance stream (which draws
// the image into the rect) is DEFERRED to phase 8 — pdf-lib's
// `embedPng` returns a `PDFImage`, but turning it into a Form
// XObject with the right /BBox + /Resources is a non-trivial 50-line
// hand-roll. For v1 the stamp annotation dict is exported without
// /AP, the image data is lost on export, and the signature shows as
// an empty rect in the exported PDF. The in-editor visual is an
// HTML <img> overlay (see SignatureOverlay). The e2e asserts the
// annotation dict is present + text is still extractable.
const signature: AnnotationTypeMeta = {
  type: 'signature',
  tool: 'signature',
  label: 'Signature',
  shape: 'rect',
  defaultStyle: { color: [0, 0, 0] as const, opacity: 1.0 },
  toPdf: (ctx, _out, _page, a) => {
    if (a.type !== 'signature') throw new Error('unreachable: signature toPdf called with non-signature annotation');
    return ctx.obj({
      Type: 'Annot',
      Subtype: 'Stamp',
      Rect: [a.rect.x, a.rect.y, a.rect.x + a.rect.w, a.rect.y + a.rect.h],
      F: 4,
      Contents: 'signature',
    });
  },
};

AnnotationRegistry.register(highlight);
AnnotationRegistry.register(underline);
AnnotationRegistry.register(strikethrough);
AnnotationRegistry.register(rectangle);
AnnotationRegistry.register(ellipse);
AnnotationRegistry.register(freedraw);
AnnotationRegistry.register(signature);
