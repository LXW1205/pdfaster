// ponytail: the editor's main page. Loads the PDF (via pdf.js),
// shows the current page in a HiDPI canvas, overlays the
// annotation tool, and exposes toolbar + thumbnails. The PDF
// document proxy and the current page proxy live in local
// useState (not the store) — they're not part of the user's
// edit history. The annotation list, bytes, and file name are
// in useEditorStore so the export pipeline can read them.
//
// Phase 7 additions:
//   1. Session restore: on mount, ask IndexedDB for a saved
//      session; if one exists, show the restore prompt. Accept
//      shows the drop zone with a hint. Decline clears the
//      session. The restore itself fires on the new file drop
//      (set annotations + formFields from the saved record).
//   2. Auto-save: a debounced (1500ms) subscription to
//      annotations + formFields writes the latest record to
//      IndexedDB. The save is no-op if no document is loaded.
//   3. Form discovery: LoadedEditor also loads the PDF via
//      pdf-lib after the pdf.js load, enumerates the form, and
//      seeds `formFields`. FormOverlay renders the inputs.
//   4. Signature pad: SignatureOverlay owns input when the
//      signature tool is active.
//   5. Close button: in the toolbar. Clears the session and
//      the document.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import EditorDropZone from './EditorDropZone';
import { useEditorStore } from '../../state/useEditorStore';
import { useUIStore } from '../../state/useUIStore';
import { makeViewport, type Viewport } from '../../lib/coords';
import { renderPageToCanvas } from '../../lib/pdf-render';
import { exportPdf } from '../../editor/exportPdf';
import { downloadBytes } from '../../lib/download';
import { Container } from '../../components/Container';
import { EditorToolbar } from '../../editor/EditorToolbar';
import { EditorThumbnails } from '../../editor/EditorThumbnails';
import { AnnotationOverlay } from '../../editor/AnnotationOverlay';
import { SignatureOverlay } from '../../editor/SignatureOverlay';
import { FormOverlay } from '../../editor/FormOverlay';
import { SessionStore, type SessionRecord } from '../../lib/session-store';
import type { FormFieldState } from '../../state/form';

function isPdfFile(file: File): boolean {
  if (file.type === 'application/pdf') return true;
  return file.name.toLowerCase().endsWith('.pdf');
}

export default function EditorPage() {
  const bytes = useEditorStore((s) => s.bytes);
  const fileName = useEditorStore((s) => s.fileName);
  const clearDocument = useEditorStore((s) => s.clearDocument);

  const [error, setError] = useState<string | null>(null);
  // ponytail: restoreOffer is the saved session (if any) we found
  // on mount. `restoreAccepted` flips after the user accepts the
  // prompt — once accepted, the drop zone shows a hint with the
  // saved file's name. We don't auto-restore silently. The threat
  // model is a shared computer: the user MUST click the prompt.
  const [restoreOffer, setRestoreOffer] = useState<SessionRecord | null>(null);
  const [restoreAccepted, setRestoreAccepted] = useState(false);
  // ponytail: `pageCountRef` is the cheapest way to make the
  // auto-save subscription (which lives at the page level, not
  // inside LoadedEditor) aware of the current page count. The
  // ref is updated by LoadedEditor via the `onPageCount` callback.
  const pageCountRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  // On mount, look for a saved session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rec = await SessionStore.latest();
        if (cancelled) return;
        if (rec) {
          setRestoreOffer(rec);
          sessionIdRef.current = rec.sessionId;
        } else {
          sessionIdRef.current = crypto.randomUUID();
        }
      } catch (e) {
        // ponytail: silent fail. If IndexedDB is unavailable
        // (private mode, disabled), the editor just won't have
        // session restore. We don't gate the editor on it.
        sessionIdRef.current = crypto.randomUUID();
        if (!cancelled) console.warn('session restore lookup failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-save: debounced 1500ms subscription to annotations + formFields.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (
        state.annotations === prev.annotations &&
        state.formFields === prev.formFields
      ) {
        return;
      }
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        const s = useEditorStore.getState();
        if (!s.bytes || !s.fileName) return;
        const sid = sessionIdRef.current ?? crypto.randomUUID();
        sessionIdRef.current = sid;
        const now = Date.now();
        const rec: SessionRecord = {
          sessionId: sid,
          fileName: s.fileName,
          fileSize: s.bytes.byteLength,
          pageCount: pageCountRef.current,
          annotations: s.annotations,
          formFields: s.formFields,
          createdAt: now,
          updatedAt: now,
        };
        SessionStore.save(rec).catch((e) => {
          console.warn('session save failed', e);
        });
      }, 1500);
    });
    return () => {
      if (timeout) clearTimeout(timeout);
      unsub();
    };
  }, []);

  function handleDeclineRestore() {
    setRestoreOffer(null);
    sessionIdRef.current = crypto.randomUUID();
    SessionStore.clear().catch(() => {});
  }

  function handleAcceptRestore() {
    // ponytail: keep the file name around after accepting the prompt.
    // The session is only "consumed" when the matching file is dropped
    // (see handleFile → SessionStore.clear). The drop zone's hint
    // nudges the user toward that file by name; without keeping
    // `restoreOffer` the hint would disappear the moment they click
    // Restore.
    setRestoreAccepted(true);
  }

  function handleClose() {
    SessionStore.clear().catch(() => {});
    sessionIdRef.current = crypto.randomUUID();
    clearDocument();
    setRestoreAccepted(false);
    setRestoreOffer(null);
  }

  async function handleFile(file: File) {
    if (!isPdfFile(file)) {
      setError("That doesn't look like a PDF. Try a .pdf file.");
      return;
    }
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const u8 = new Uint8Array(buffer);
      // ponytail: combine the bytes+fileName set with the optional
      // restore into ONE state change. Two state changes would
      // create two history entries (the empty annotations, then
      // the restored ones), and the first Undo would roll back
      // the restore to an empty annotation set — confusing. The
      // LoadedEditor's form-discovery effect will overwrite the
      // formFields shortly after, with the new PDF's actual
      // fields. If the new PDF has no form fields, the saved
      // values stay (the export pipeline's `try/throw` skips
      // names that don't exist).
      const restore = restoreAccepted && restoreOffer ? restoreOffer : null;
      useEditorStore.setState({
        bytes: u8,
        fileName: file.name,
        annotations: restore ? [...restore.annotations] : [],
        formFields: restore ? [...restore.formFields] : [],
      });
      useUIStore.getState().setPageIndex(0);
      if (restore) {
        SessionStore.clear().catch(() => {});
        sessionIdRef.current = crypto.randomUUID();
        setRestoreAccepted(false);
      }
    } catch (e) {
      setError(`Couldn't read that file. ${(e as Error).message ?? String(e)}`);
    }
  }

  if (bytes === null) {
    return (
      <>
        <EditorToolbar pdf={null} pageCount={0} disabled onClose={handleClose} />
        <Container className="py-12">
          {restoreOffer && !restoreAccepted && (
            <RestorePrompt
              offer={restoreOffer}
              onAccept={handleAcceptRestore}
              onDecline={handleDeclineRestore}
            />
          )}
          <EditorDropZone
            onFile={handleFile}
            error={error}
            hint={
              restoreAccepted && restoreOffer
                ? `Drop ${restoreOffer.fileName} to resume.`
                : undefined
            }
          />
        </Container>
      </>
    );
  }

  return (
    <LoadedEditor
      // ponytail: `key={bytes.byteLength}` remounts `LoadedEditor`
      // whenever a new document is loaded. pdf.js's getDocument
      // holds the old buffer until the proxy is released; remounting
      // guarantees the old proxy is dropped on the floor and a
      // fresh load runs. The "key as dep" pattern is the
      // canonical fix for the "set-state-in-effect" lint rule.
      key={bytes.byteLength}
      bytes={bytes}
      fileName={fileName}
      onError={setError}
      onClose={handleClose}
      onPageCount={(n) => { pageCountRef.current = n; }}
    />
  );
}

function RestorePrompt({
  offer,
  onAccept,
  onDecline,
}: {
  offer: SessionRecord;
  onAccept: () => void;
  onDecline: () => void;
}) {
  // ponytail: a `<div role="dialog" aria-modal="true">` with
  // aria-labelledby + aria-describedby. Native <dialog> is
  // showModal()-only and Safari's <dialog> stack has had
  // regressions; the div-based approach is the spec's "good
  // enough" floor. Promote to a <dialog> when a second modal
  // surface lands and we want a single focus-trap implementation.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-prompt-title"
      aria-describedby="restore-prompt-desc"
      data-testid="restore-prompt"
      className="mx-auto mb-6 max-w-md rounded-lg border border-ink/15 bg-white p-5 shadow-md"
    >
      <h2 id="restore-prompt-title" className="text-base font-semibold text-ink">
        Resume your last session?
      </h2>
      <p id="restore-prompt-desc" className="mt-2 text-sm text-ink/70">
        You have an unsaved session from <strong>{offer.fileName}</strong> (saved {formatRelativeTime(offer.updatedAt)}). Restore it? You&apos;ll need to re-open the original PDF.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          data-testid="restore-decline"
          onClick={onDecline}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5"
        >
          Start fresh
        </button>
        <button
          type="button"
          data-testid="restore-accept"
          onClick={onAccept}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-ink hover:bg-secondary"
        >
          Restore
        </button>
      </div>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function LoadedEditor({
  bytes,
  fileName,
  onError,
  onClose,
  onPageCount,
}: {
  bytes: Uint8Array;
  fileName: string | null;
  onError: (msg: string) => void;
  onClose: () => void;
  onPageCount: (n: number) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getDocument } = await import('../../lib/pdf-render');
        const data = bytes.slice().buffer;
        const doc = await getDocument({ data }).promise;
        if (cancelled) return;
        setPdf(doc);
        onPageCount(doc.numPages);
      } catch (e) {
        if (cancelled) return;
        const msg = `Couldn't open that PDF. ${(e as Error).message ?? String(e)}`;
        setLoadError(msg);
        onError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes, onError, onPageCount]);

  // ponytail: form discovery. After pdf.js loads the document, we
  // re-load via pdf-lib to enumerate AcroForm fields. The form's
  // widgets carry their pageIndex + rect in PDF points. We seed
  // `formFields` so the FormOverlay can render inputs at the
  // right CSS positions. Loading pdf-lib here is the first time
  // the editor chunk pulls it in — the export pipeline pulls it
  // in separately, so the chunk boundary is preserved.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      try {
        const { PDFDocument } = await import('pdf-lib');
        const src = await PDFDocument.load(bytes);
        const form = src.getForm();
        const fields = form.getFields();
        if (fields.length === 0) return;
        const discovered: FormFieldState[] = [];
        // ponytail: method-based discriminator. We can't use
        // `f.constructor.name` because Vite minifies pdf-lib's
        // classes in the prod build (`PDFTextField` → `t`).
        // Instead, branch on the methods each field type exposes.
        // text: getText/setText. checkbox: isChecked/check/uncheck.
        // dropdown: getOptions/getSelected returning string[].
        // radio: getOptions/getSelected returning string.
        for (const f of fields) {
          const widgets = f.acroField.getWidgets();
          const widget = widgets[0];
          if (!widget) continue;
          const rect = widget.getRectangle();
          // PDF page lookup: pdf-lib doesn't give us the page
          // directly, but the widget's /P entry does. We default
          // to page 0 when /P is missing (rare).
          const pageRef = widget.P();
          let pageIndex = 0;
          if (pageRef) {
            const idx = src.getPages().findIndex((p) => p.ref === pageRef);
            if (idx >= 0) pageIndex = idx;
          }
          const rectObj = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
          const probe = f as unknown as Record<string, unknown>;
          if (typeof probe.getText === 'function' && typeof probe.setText === 'function') {
            discovered.push({
              name: f.getName(),
              type: 'text',
              value: (probe.getText as () => string)() ?? '',
              pageIndex,
              rect: rectObj,
            });
          } else if (typeof probe.isChecked === 'function' && typeof probe.check === 'function') {
            discovered.push({
              name: f.getName(),
              type: 'checkbox',
              value: (probe.isChecked as () => boolean)() ? 'true' : 'false',
              pageIndex,
              rect: rectObj,
            });
          } else if (typeof probe.getOptions === 'function' && typeof probe.getSelected === 'function') {
            // ponytail: dropdown's getSelected returns string[],
            // radio's returns string. We branch on the result type.
            const opts = (probe.getOptions as () => string[])();
            const sel = (probe.getSelected as () => string | string[] | undefined)();
            const isRadio = typeof sel === 'string' || sel === undefined;
            discovered.push({
              name: f.getName(),
              type: isRadio ? 'radio' : 'dropdown',
              value: isRadio ? (sel ?? '') : (Array.isArray(sel) ? (sel[0] ?? '') : ''),
              options: opts,
              pageIndex,
              rect: rectObj,
            });
          }
        }
        if (cancelled) return;
        if (discovered.length > 0) {
          useEditorStore.setState({ formFields: discovered });
        }
      } catch (e) {
        if (!cancelled) {
          // ponytail: silent fail on form discovery. The editor
          // works fine without form-fill; the user can still
          // annotate, export, and use the toolbar.
          console.warn('form discovery failed', e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, bytes]);

  async function handleExport() {
    try {
      const out = await exportPdf();
      const base = fileName ? fileName.replace(/\.pdf$/i, '') : 'document';
      downloadBytes(out, `${base}-edited.pdf`, 'application/pdf');
    } catch (e) {
      onError(`Couldn't export. ${(e as Error).message ?? String(e)}`);
    }
  }

  if (!pdf) {
    return (
      <>
        <EditorToolbar pdf={null} pageCount={0} fileName={fileName} disabled onExport={handleExport} onClose={onClose} />
        <Container className="py-12">
          <p className="text-sm text-ink/60">Loading…</p>
          {loadError && (
            <p role="alert" className="mt-4 max-w-md text-sm text-red-700">
              {loadError}
            </p>
          )}
        </Container>
      </>
    );
  }

  return (
    <>
      <EditorToolbar pdf={pdf} pageCount={pdf.numPages} fileName={fileName} onExport={handleExport} onClose={onClose} />
      <div className="flex h-[calc(100svh-3.5rem)]">
        <EditorThumbnails pdf={pdf} />
        <div className="flex-1 overflow-auto bg-ink/5 p-6">
          {loadError && (
            <p
              role="alert"
              className="mx-auto mb-4 max-w-md rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {loadError}
            </p>
          )}
          <PageView pdf={pdf} onError={onError} />
        </div>
      </div>
    </>
  );
}

function PageView({ pdf, onError }: { pdf: PDFDocumentProxy; onError: (msg: string) => void }) {
  const pageIndex = useUIStore((s) => s.pageIndex);
  const zoom = useUIStore((s) => s.zoom);
  const rotation = useUIStore((s) => s.rotation);
  const [page, setPage] = useState<PDFPageProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await pdf.getPage(pageIndex + 1);
        if (cancelled) return;
        setPage(p);
      } catch (e) {
        if (!cancelled) {
          onError(`Couldn't open page ${pageIndex + 1}. ${(e as Error).message ?? String(e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, onError]);

  // ponytail: viewport is derived from `page` + `zoom` + `dpr` +
  // `rotation`. Computing it eagerly here (not in the canvas) means
  // the overlay can render the same frame the canvas first paints.
  const viewport: Viewport | null = useMemo(() => {
    if (!page) return null;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const native = page.getViewport({ scale: 1, rotation });
    return makeViewport({
      pageWidthPts: native.width,
      pageHeightPts: native.height,
      zoom,
      dpr,
      rotation,
    });
  }, [page, zoom, rotation]);

  if (!page || !viewport) {
    return (
      <Container className="py-12">
        <p className="text-sm text-ink/60">Loading…</p>
      </Container>
    );
  }

  return (
    <div
      className="relative mx-auto bg-white shadow-md"
      style={{ width: viewport.cssWidth, height: viewport.cssHeight }}
    >
      <PdfCanvas page={page} numPages={pdf.numPages} zoom={zoom} rotation={rotation} viewport={viewport} />
      <FormOverlay viewport={viewport} pageIndex={pageIndex} />
      <AnnotationOverlay viewport={viewport} pageIndex={pageIndex} />
      <SignatureOverlay viewport={viewport} pageIndex={pageIndex} />
    </div>
  );
}

function PdfCanvas({
  page,
  numPages,
  zoom,
  rotation,
  viewport,
}: {
  page: PDFPageProxy;
  numPages: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  viewport: Viewport;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    // ponytail: delegate to the shared renderer so the canvas size,
    // HiDPI transform, and pdf.js version-pinned call signature
    // stay in lockstep with the worker-check / thumbnails paths.
    renderPageToCanvas(page, canvas, zoom, rotation).catch((e) => {
      if (!cancelled) console.error('render failed:', e);
    });
    return () => {
      cancelled = true;
    };
  }, [page, zoom, rotation]);
  void viewport;
  // ponytail: `PDF page {n} of {N}` is the a11y floor for screen
  // readers. The page proxy's `pageNumber` is 1-based; pair with the
  // doc's `numPages` for the count.
  return <canvas ref={ref} data-testid="page-canvas" role="img" aria-label={`PDF page ${page.pageNumber} of ${numPages}`} className="absolute inset-0 block" />;
}
