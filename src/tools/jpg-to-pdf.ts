import { PDFDocument } from 'pdf-lib';

// ponytail: support JPG and PNG. Detect by MIME; embedJpg for jpeg,
// embedPng for png. The PNG branch is needed because some browsers
// report `image/jpg` or `image/pjpeg` for camera-roll JPGs — but
// FileDropZone's `accept` prop already filters to `image/jpeg,image/png`
// so the MIME coming in is canonical.
//
// Adding TIFF / HEIC / WebP needs a decoder; defer to a wasm dep
// (e.g. `pdf-lib` ships none). The output page size is set to the
// image's native dimensions at 1pt = 1/72 in (PDF user space). No
// margin, no scaling — the user can scale in the editor after
// importing. A4 / letter presets are a 5-line addition; defer.
export async function jpgsToPdf(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('Need at least 1 image');
  const out = await PDFDocument.create();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const img = file.type === 'image/png'
      ? await out.embedPng(bytes)
      : await out.embedJpg(bytes);
    const page = out.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return out.save();
}
