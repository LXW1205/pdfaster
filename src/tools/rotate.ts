import { PDFDocument, degrees } from 'pdf-lib';

export type RotationAngle = 90 | 180 | 270;

// ponytail: setRotation(degrees(n)) rotates the page content
// clockwise by n. Combined with the page's intrinsic rotation, the
// user-visible effect is: all pages now have +n applied. The
// MediaBox doesn't change — the page dimensions stay the same and
// the rotated content draws into the existing box. This is the
// correct way to "rotate a PDF page" in pdf-lib.
//
// The `+angle % 360` keeps the cumulative angle inside [0, 360).
// When the UI should surface the page's intrinsic rotation (so the
// user can see "page 3 is already 90°, +90° brings it to 180°"),
// read `page.getRotation().angle` in the page component and show it
// next to the radio group. Defer to a phase 5e user signal — the
// input is a 3-option radio for v1, and the intrinsic-rotation
// reading costs one extra useEffect + one state slot.
export async function rotateAllPages(file: File, angle: RotationAngle): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach((p) => {
    p.setRotation(degrees((p.getRotation().angle + angle) % 360));
    out.addPage(p);
  });
  return out.save();
}
