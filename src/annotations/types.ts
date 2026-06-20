import type { ToolId } from '../state/useUIStore';
import type { PDFContext, PDFDict, PDFDocument, PDFPage } from 'pdf-lib';

export type AnnotationId = string; // UUID v4 (crypto.randomUUID)

export type RectPts = { x: number; y: number; w: number; h: number }; // PDF user space, x/y is the lower-left corner
export type Rgb = readonly [number, number, number]; // 0..1
export type PointPts = { x: number; y: number }; // PDF user space

// ponytail: union type — phase 6 adds underline / strikethrough /
// rectangle / ellipse / freedraw next to the original highlight. New
// variants (sticky, text, signature, form) are added in later phases
// by appending to this union. The registry lookup in exportPdf and
// the per-shape dispatch in AnnotationOverlay grow in lockstep; no
// central migration table needed.
export type Annotation =
  | { id: AnnotationId; type: 'highlight';     pageIndex: number; rect: RectPts; color: Rgb; opacity: number; createdAt: number }
  | { id: AnnotationId; type: 'underline';     pageIndex: number; rect: RectPts; color: Rgb; opacity: number; createdAt: number }
  | { id: AnnotationId; type: 'strikethrough'; pageIndex: number; rect: RectPts; color: Rgb; opacity: number; createdAt: number }
  | { id: AnnotationId; type: 'rectangle';     pageIndex: number; rect: RectPts; color: Rgb; opacity: number; strokeWidth: number; createdAt: number }
  | { id: AnnotationId; type: 'ellipse';       pageIndex: number; rect: RectPts; color: Rgb; opacity: number; strokeWidth: number; createdAt: number }
  | { id: AnnotationId; type: 'freedraw';      pageIndex: number; points: PointPts[]; color: Rgb; opacity: number; strokeWidth: number; createdAt: number }
  // ponytail: signature is a 2-step wire-up — `toPdf` returns a
  // placeholder /Stamp; the exportPdf pass embeds the PNG and patches
  // the /AP. The /AP appearance stream wiring is deferred to phase 8
  // (see the comments on the signature register entry + exportPdf).
  | { id: AnnotationId; type: 'signature';     pageIndex: number; rect: RectPts; pngDataUrl: string; createdAt: number };

// ponytail: import-only type — circular-safe. AnnotationTypeMeta
// lives alongside the union so a single import gives consumers both
// the runtime kind and the per-type metadata shape.
export type AnnotationTypeMeta = {
  type: Annotation['type'];
  tool: ToolId;
  label: string;
  // ponytail: `shape` drives the draft logic in AnnotationOverlay —
  // `rect` for text-marks and shapes (one drag → one rect), `polyline`
  // for free-draw (one drag → many points). Add a third value
  // (e.g. `'point'`) when sticky-note / text-box / signature tools
  // ship in a later phase.
  shape: 'rect' | 'polyline';
  defaultStyle: { color: Rgb; opacity: number; strokeWidth?: number };
  // ponytail: `toPdf` is the per-type export function. The registry
  // holds the function, exportPdf walks the registry. Add a new
  // annotation type = append to the union + add a register() call.
  // Returns `PDFDict` because `ctx.obj(literal)` returns `PDFDict`
  // (the dict gets stored in the page's /Annots array). The
  // `a: Annotation` parameter is a known limitation of the
  // `Extract<Annotation, { type: Meta['type'] }>` conditional type
  // — fix it when a second generic helper in this file wants the
  // same narrowing.
  toPdf: (ctx: PDFContext, out: PDFDocument, page: PDFPage, a: Annotation) => PDFDict;
};
