// ponytail: NO new dependency (no jszip). Output strategy is per-page
// download — show a grid of previews, each with its own Download
// button. The user clicks N buttons to get N JPGs. This avoids the
// ZIP dep and is honestly clearer than a ZIP blob ("page 3" vs
// "all_pages.zip").
//
// `dpr: 1` because we want pixel-accurate output (one canvas pixel
// per PDF point × scale), not HiDPI display density. The editor's
// render uses `window.devicePixelRatio` for sharpness on screen; the
// export path doesn't care about the user's display.
//
// Upgrade path: when bulk download is requested, add `jszip` (~30KB
// gz) and emit a single archive. Wait for the user signal — YAGNI.
import { getDocument } from '../lib/pdf-render';
import { makeViewport } from '../lib/coords';

export type JpgOutput = { name: string; blob: Blob };

export async function pdfToJpgBlobs(file: File, scale = 1.5): Promise<JpgOutput[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data: bytes }).promise;
  const out: JpgOutput[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const baseVp = page.getViewport({ scale: 1 });
      const dpr = 1; // pixel-accurate output, not HiDPI
      const v = makeViewport({
        pageWidthPts: baseVp.width,
        pageHeightPts: baseVp.height,
        zoom: scale,
        dpr,
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(v.cssWidth);
      canvas.height = Math.floor(v.cssHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas context unavailable');
      await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
      page.cleanup();
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
      );
      const baseName = file.name.replace(/\.pdf$/i, '');
      out.push({ name: `${baseName}-page-${i}.jpg`, blob });
    }
  } finally {
    await pdf.cleanup();
    await pdf.loadingTask.destroy();
  }
  return out;
}
