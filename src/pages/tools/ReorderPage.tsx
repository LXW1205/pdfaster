// ponytail: mirrors MergePage's file-list shell. The state is just
// `order: number[]` — a permutation of `[0..pageCount-1]`. Up/down
// buttons swap adjacent entries (same MergePage `move` closure).
// Thumbnails are deferred to phase 5e (needs pdf.js + canvas per
// page; heavy); the "Page N" text is the placeholder.
//
// The label on each row's buttons uses the original page number
// (order[i] + 1) so the user can read "Move page 1 down" before AND
// after a swap. Same UX as MergePage, which labels by file name.
//
// Phase 12: the page list is rendered by PagedPageList (infinite
// scroll, IntersectionObserver). The 3-page fixture used by the
// prior e2e renders all 3 rows from the start (initial window = 20)
// — pagination is a no-op for small docs, which is the right default.
import { useEffect, useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { PagedPageList } from '../../components/PagedPageList';
import { downloadBytes } from '../../lib/download';
import { PDFDocument } from 'pdf-lib';

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function ReorderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [order, setOrder] = useState<number[]>([]);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setOrder(Array.from({ length: n }, (_, i) => i));
        setResult(null);
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't read that PDF. ${e instanceof Error ? e.message : String(e)}`);
        setFile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  function move(i: number, dir: -1 | 1) {
    setOrder((o) => {
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const next = o.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  async function onReorder() {
    if (!file || order.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { reorderPages } = await import('../../tools/reorder');
      const bytes = await reorderPages(file, order);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reorder failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setOrder([]);
    setPageCount(0);
    setFile(f);
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Reorder pages</h1>
        <p className="mt-2 text-base text-ink/70">Reorder the pages of a PDF. Use the arrows to move a page up or down. Stays on your device.</p>
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
          <div className="mb-3 flex items-baseline justify-between gap-3 text-sm text-ink/70">
            <span className="font-medium text-ink">{file.name}</span>
            <span>{fmtSize(file.size)} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
          </div>
          <PagedPageList
            count={pageCount}
            ariaLabel="Pages"
            className="divide-y divide-ink/10 rounded-md border border-ink/10"
            // ponytail: key on the original page index (order[i])
            // — when the user moves pages, the keys follow the
            // pages, not the rows. Keeps React's identity stable
            // across moves (the button that was on row 0 is still
            // on row 0; the same key just resolved to a different
            // origIdx after the move).
            getKey={(i) => `reorder-${order[i]}`}
            renderItem={(i) => {
              const origIdx = order[i]!;
              return (
                <div className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-10 font-medium text-ink">{i + 1}.</span>
                  <span className="flex-1 text-ink/80">Page {origIdx + 1}</span>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move page ${origIdx + 1} up`}
                    className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5 disabled:opacity-30"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                    aria-label={`Move page ${origIdx + 1} down`}
                    className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5 disabled:opacity-30"
                  >↓</button>
                </div>
              );
            }}
          />
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onReorder}
          disabled={!file || pageCount === 0 || busy}
          data-testid="reorder-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Reordering…' : 'Reorder'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'reordered.pdf', 'application/pdf')}
            data-testid="reorder-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download reordered.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
