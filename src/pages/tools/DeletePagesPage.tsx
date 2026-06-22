// ponytail: mirrors MergePage's shell. The page-list is the only
// operation-specific UI: one row per page, checkbox on the right,
// quick "Select all/none" pair above. Default state: all checked
// (keep all) — the destructive action is opt-in by unchecking.
//
// Phase 12: the page list is rendered by PagedPageList (infinite
// scroll, IntersectionObserver). The 3-page fixture used by the
// prior e2e renders all 3 rows from the start (initial window = 20)
// — pagination is a no-op for small docs, which is the right default.
import { useEffect, useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { PagedPageList } from '../../components/PagedPageList';
import { PagePreview } from '../../components/PagePreview';
import { downloadBytes } from '../../lib/download';
import { usePdfDocument } from '../../lib/hooks/use-pdf-document';
import { PDFDocument } from 'pdf-lib';

export default function DeletePagesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ponytail: one pdf.js proxy per file, shared across every row's
  // PagePreview. The hook returns null until the proxy loads.
  const previewPdf = usePdfDocument(file);

  // ponytail: pageCount + keep stay at their prior values when
  // `file` is null; the UI hides the page list via `file &&
  // pageCount > 0` so no explicit reset is needed.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFDocument.load(bytes);
        if (cancelled) return;
        const n = doc.getPageCount();
        setPageCount(n);
        setKeep(Array(n).fill(true));
        setResult(null);
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't read that PDF. ${e instanceof Error ? e.message : String(e)}`);
        setFile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  function toggle(i: number) {
    setKeep((k) => k.map((v, idx) => (idx === i ? !v : v)));
  }

  function setAll(v: boolean) {
    setKeep((k) => k.map(() => v));
  }

  async function onSave() {
    if (!file || keep.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { deletePages } = await import('../../tools/delete-pages');
      const keepIndices = keep
        .map((v, i) => (v ? i : -1))
        .filter((i) => i >= 0);
      if (keepIndices.length === 0) {
        throw new Error("Can't remove every page — leave at least one checked.");
      }
      const bytes = await deletePages(file, keepIndices);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setFile(f);
  }

  const keepCount = keep.filter(Boolean).length;

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Delete pages</h1>
        <p className="mt-2 text-base text-ink/70">Uncheck the pages you want to remove. Checked pages stay. Stays on your device.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="application/pdf"
          onFiles={(fs) => { if (fs[0]) onFile(fs[0]); }}
          hint="Drop a single PDF."
        />
      </div>

      {file && pageCount > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm text-ink/70">
              <span className="font-medium text-ink">{keepCount}</span> of {pageCount} kept
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="rounded px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
                data-testid="delete-pages-select-all"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setAll(false)}
                className="rounded px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
                data-testid="delete-pages-select-none"
              >
                Select none
              </button>
            </div>
          </div>
          <PagedPageList
            count={pageCount}
            ariaLabel="Pages"
            className="divide-y divide-ink/10 rounded-md border border-ink/10"
            // ponytail: key on `i` (the position in the list). The
            // rows don't move around, so the index is the stable
            // identity. Same as the prior <ul key={i}>.
            getKey={(i) => `delete-${i}`}
            renderItem={(i) => {
              const k = keep[i]!;
              return (
                <div className="flex items-center gap-3 px-4 py-2 text-sm">
                  {previewPdf && <PagePreview pdf={previewPdf} pageIndex={i} />}
                  <span className="w-10 font-medium text-ink">{i + 1}.</span>
                  <span className="flex-1 text-ink/70">Page {i + 1}</span>
                  <label className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="checkbox"
                      checked={k}
                      onChange={() => toggle(i)}
                      data-testid={`delete-pages-checkbox-${i}`}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{k ? 'Keep' : 'Remove'}</span>
                  </label>
                </div>
              );
            }}
          />
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onSave}
          disabled={!file || keepCount === 0 || keepCount === pageCount || busy}
          data-testid="delete-pages-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save without unchecked pages'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'pages-removed.pdf', 'application/pdf')}
            data-testid="delete-pages-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download pages-removed.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
