// ponytail: this page is a diagnostic. The only UI it owns is a canvas
// and a one-line status. The real test bridge is `window.__pdfaster`,
// which we read from the Playwright spec. Replace it with a proper
// test bridge (data-testid + page.evaluate) when more test pages land.
//
// Behavior branches on the `?file=<url>` query param:
//   - absent → generate the in-browser sample PDF, render it.
//   - present → fetch the URL, render the first page, and report
//               annotations + text content for the export roundtrip
//               assertion. Both `/test/worker` and `/test/inspect`
//               routes point at this single component.
import { useEffect, useRef, useState } from 'react';
import { makeViewport, backingStoreSize } from '../lib/coords';

declare global {
  interface Window {
    __pdfaster?:
      | {
          ok: true;
          workerSrc: string;
          pageCount: number;
          annotationCount: number;
          text: string;
          canvasWidthCss: number;
          canvasHeightCss: number;
          canvasWidthPx: number;
          canvasHeightPx: number;
          // ponytail: per-page natural size (rotation baked in). The
          // crop test uses this to assert MediaBox shrinkage. The
          // next consumer is a "show me the dimensions" debug tool
          // in phase 5e — until then, the field is just here for the
          // one e2e that needs it.
          pageSizes: { w: number; h: number }[];
          // ponytail: form values keyed by field name. The form-fill
          // e2e reads this to assert a fill survived the export
          // roundtrip. Loaded via a dynamic pdf-lib import so this
          // page still lazy-loads pdf-lib only on the inspect path.
          formValues: Record<string, string>;
        }
      | { ok: false; error: string };
  }
}

export default function WorkerCheckPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState('loading…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          { getDocument, GlobalWorkerOptions, renderPageToCanvas },
          { makeSamplePdfBytes },
        ] = await Promise.all([
          import('../lib/pdf-render'),
          import('../lib/pdf-sample'),
        ]);

        const params = new URLSearchParams(window.location.search);
        const file = params.get('file');

        let bytes: Uint8Array;
        if (file) {
          // Inspect path: fetch the file the test routed to us.
          const res = await fetch(file);
          if (!res.ok) throw new Error(`fetch ${file} → ${res.status}`);
          const buf = await res.arrayBuffer();
          bytes = new Uint8Array(buf);
        } else {
          // Worker-check path: synthesize a sample locally.
          bytes = await makeSamplePdfBytes();
        }

        // Copy into a fresh ArrayBuffer; pdf.js takes ownership of the
        // buffer in some builds and we don't want a future re-render
        // to trip over a detached buffer.
        const data = bytes.slice().buffer;
        const pdf = await getDocument({ data }).promise;

        // ponytail: aggregate annotation count + text across all
        // pages. Promote to a per-page table when the roundtrip
        // grows (font extraction, image XObject count, etc.).
        //
        // We filter out /Widget annotations: those are the backing
        // annotations for AcroForm fields. They're infrastructure,
        // not user-visible markup. The editor's in-place export
        // (phase 7) preserves the form by leaving the widget in
        // /Annots, so the count would otherwise include a widget
        // for every filled form field.
        let annotationCount = 0;
        const textParts: string[] = [];
        const pageSizes: { w: number; h: number }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const p = await pdf.getPage(i);
          const vp = p.getViewport({ scale: 1 });
          pageSizes.push({ w: vp.width, h: vp.height });
          const anns = await p.getAnnotations();
          for (const a of anns) {
            const sub = (a as { subtype?: string }).subtype
              ?? (a as { Subtype?: string }).Subtype;
            if (sub === 'Widget') continue;
            annotationCount++;
          }
          const tc = await p.getTextContent();
          // TextContent items are `TextItem | TextMarkedContent`; only
          // the former carries a `str` field.
          textParts.push(
            tc.items
              .map((it) => ('str' in it ? (it.str as string) : ''))
              .join(' '),
          );
        }
        const page = await pdf.getPage(1);

        const dpr = window.devicePixelRatio || 1;
        const native = page.getViewport({ scale: 1 });
        const v = makeViewport({
          pageWidthPts: native.width,
          pageHeightPts: native.height,
          zoom: 1,
          dpr,
        });
        const bs = backingStoreSize(v);

        const canvas = canvasRef.current!;
        await renderPageToCanvas(page, canvas, 1, 0);

        // ponytail: dynamic pdf-lib import on the inspect path only.
        // The form-fill e2e asserts a filled value survived export;
        // the worker e2e doesn't need pdf-lib at all. Lazy load keeps
        // both consumers out of each other's chunks.
        //
        // Method-based discriminator (matches EditorPage's form
        // discovery): we can't use `f.constructor.name` because Vite
        // minifies pdf-lib's classes in the prod build.
        const formValues: Record<string, string> = {};
        try {
          const { PDFDocument } = await import('pdf-lib');
          const head = bytes.slice().buffer;
          const filled = await PDFDocument.load(head);
          const form = filled.getForm();
          for (const f of form.getFields()) {
            const probe = f as unknown as Record<string, unknown>;
            if (typeof probe.getText === 'function') {
              formValues[f.getName()] = (probe.getText as () => string)() ?? '';
            } else if (typeof probe.isChecked === 'function') {
              formValues[f.getName()] = (probe.isChecked as () => boolean)() ? 'true' : 'false';
            } else if (typeof probe.getSelected === 'function') {
              const sel = (probe.getSelected as () => string | string[] | undefined)();
              formValues[f.getName()] = Array.isArray(sel) ? (sel[0] ?? '') : (sel ?? '');
            }
          }
        } catch {
          // ponytail: silent fail. A PDF without a form simply
          // contributes no form values; the field is empty.
        }

        if (cancelled) return;
        window.__pdfaster = {
          ok: true,
          workerSrc: GlobalWorkerOptions.workerSrc as string,
          pageCount: pdf.numPages,
          annotationCount,
          text: textParts.join(' '),
          canvasWidthCss: v.cssWidth,
          canvasHeightCss: v.cssHeight,
          canvasWidthPx: bs.width,
          canvasHeightPx: bs.height,
          pageSizes,
          formValues,
        };
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        window.__pdfaster = { ok: false, error: String(e) };
        setStatus(`failed: ${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <canvas ref={canvasRef} className="rounded-sm bg-white shadow-sm" />
      <p className="font-mono text-sm opacity-70" data-testid="status">{status}</p>
    </main>
  );
}
