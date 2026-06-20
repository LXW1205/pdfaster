// Single source of truth for PDF-point ↔ CSS-px ↔ device-px math.
//
// PDF user space: origin bottom-left, Y-up, 1 unit = 1/72 inch.
// CSS: origin top-left, Y-down, 1 px = 1/96 inch at the user's zoom.
// Device pixels: CSS px × window.devicePixelRatio.
//
// "Rotation" follows the PDF convention: 90 means the page is displayed
// rotated 90° clockwise from how it was authored. The closed-form math
// below assumes that convention and matches pdf.js's page.getViewport
// semantics (rotation baked into the viewport, never into renderTransform).

// ponytail: no node-only imports in this file. The CLI entry that
// uses node:url / node:path lives in coords.cli.ts so Vite's dev
// server doesn't externalize them at module init and crash the
// browser bundle. See coords.cli.ts for the CLI runner.

export type Rotation = 0 | 90 | 180 | 270;

export type Viewport = {
  pageWidthPts: number;
  pageHeightPts: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  zoom: number;
  rotation: Rotation;
};

export function makeViewport(args: {
  pageWidthPts: number;
  pageHeightPts: number;
  zoom: number;
  dpr: number;
  rotation?: Rotation;
}): Viewport {
  const rotation = args.rotation ?? 0;
  // ponytail: a `swapped` flag handles the 4 cardinal rotations
  // (90/270 swap width and height). Promote to a 2x2 rotation matrix
  // when skew, flip, or non-90° steps arrive (phase 6 user-applied
  // rotation, signature/transform tools).
  const swapped = rotation === 90 || rotation === 270;
  const cssWidth = (swapped ? args.pageHeightPts : args.pageWidthPts) * args.zoom;
  const cssHeight = (swapped ? args.pageWidthPts : args.pageHeightPts) * args.zoom;
  return {
    pageWidthPts: args.pageWidthPts,
    pageHeightPts: args.pageHeightPts,
    cssWidth,
    cssHeight,
    dpr: args.dpr,
    zoom: args.zoom,
    rotation,
  };
}

export function pdfToCss(
  v: Viewport,
  xPts: number,
  yPts: number,
): { x: number; y: number } {
  const z = v.zoom;
  // ponytail: closed-form switch on the 4 cardinal rotations. Promote
  // to a 2x2 matrix + translation table when skew/flip or arbitrary
  // angles arrive.
  switch (v.rotation) {
    case 0:
      return { x: xPts * z, y: (v.pageHeightPts - yPts) * z };
    case 90:
      return { x: yPts * z, y: xPts * z };
    case 180:
      return { x: (v.pageWidthPts - xPts) * z, y: yPts * z };
    case 270:
      return { x: (v.pageHeightPts - yPts) * z, y: (v.pageWidthPts - xPts) * z };
  }
}

export function cssToPdf(
  v: Viewport,
  xCss: number,
  yCss: number,
): { x: number; y: number } {
  const z = v.zoom;
  switch (v.rotation) {
    case 0:
      return { x: xCss / z, y: v.pageHeightPts - yCss / z };
    case 90:
      return { x: yCss / z, y: xCss / z };
    case 180:
      return { x: v.pageWidthPts - xCss / z, y: yCss / z };
    case 270:
      return { x: v.pageWidthPts - yCss / z, y: v.pageHeightPts - xCss / z };
  }
}

export function backingStoreSize(v: Viewport): { width: number; height: number } {
  // ponytail: Math.floor matches the canvas spec and pdf.js. If a
  // future call needs sub-pixel snapping (e.g. for crisp 1px strokes
  // at odd DPRs), swap to Math.round and recheck downstream renderers.
  return {
    width: Math.floor(v.cssWidth * v.dpr),
    height: Math.floor(v.cssHeight * v.dpr),
  };
}

export function renderTransform(
  v: Viewport,
): [number, number, number, number, number, number] {
  // ponytail: scale-only. Rotation is baked into the viewport (and
  // pdf.js's page.getViewport does the same). Never fold rotation into
  // this transform — it would double-rotate the page.
  return [v.dpr, 0, 0, v.dpr, 0, 0];
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function demo(): void {
  const rotations: Rotation[] = [0, 90, 180, 270];
  let failures = 0;

  for (let i = 0; i < 10_000; i++) {
    const pageWidthPts = rand(50, 1000);
    const pageHeightPts = rand(50, 1000);
    const xPts = rand(0, pageWidthPts);
    const yPts = rand(0, pageHeightPts);
    const zoom = rand(0.25, 4);
    const dpr = rand(1, 3);
    const rotation = rotations[i % 4] ?? 0;
    const v = makeViewport({ pageWidthPts, pageHeightPts, zoom, dpr, rotation });

    const css = pdfToCss(v, xPts, yPts);
    const back = cssToPdf(v, css.x, css.y);
    if (Math.abs(back.x - xPts) > 1e-6 || Math.abs(back.y - yPts) > 1e-6) {
      console.error(
        `round-trip fail [rot=${rotation}]: ` +
          `(${xPts}, ${yPts}) → css (${css.x}, ${css.y}) → back (${back.x}, ${back.y})`,
      );
      failures++;
    }

    const bs = backingStoreSize(v);
    const expW = Math.floor(v.cssWidth * v.dpr);
    const expH = Math.floor(v.cssHeight * v.dpr);
    if (bs.width !== expW || bs.height !== expH) {
      console.error(
        `backingStoreSize fail: got (${bs.width}, ${bs.height}), expected (${expW}, ${expH})`,
      );
      failures++;
    }

    const t = renderTransform(v);
    if (
      t[0] !== dpr || t[1] !== 0 || t[2] !== 0 ||
      t[3] !== dpr || t[4] !== 0 || t[5] !== 0
    ) {
      console.error(
        `renderTransform fail: got ${JSON.stringify(t)}, ` +
          `expected [${dpr}, 0, 0, ${dpr}, 0, 0]`,
      );
      failures++;
    }
  }

  if (failures > 0) {
    throw new Error(`coords demo: FAIL (${failures} failures)`);
  }
  console.log("coords demo: PASS");
}
