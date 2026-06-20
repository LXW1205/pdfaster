// ponytail: page mirrors MergePage's shell — header, drop zone, file
// info, action button, status. The single-PDF-scope keeps state to
// 5 useState calls. Don't promote to a shared `<ToolPage>` component
// until a third tool wants the exact same chrome.
import { useEffect, useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { downloadBytes } from '../../lib/download';
import { PDFDocument } from 'pdf-lib';

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ponytail: derive the page count by loading the PDF once. Cheaper
  // than passing `pageCount` through FileDropZone's contract (which
  // only knows about files). The bytes are GC'd after the load — we
  // keep the `File` reference, not the bytes. pageCount stays at
  // its prior value when `file` is null; the UI hides the section
  // via `file && pageCount > 0` so no explicit reset is needed.
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
        setFrom(1);
        setTo(n);
        setResult(null);
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't read that PDF. ${e instanceof Error ? e.message : String(e)}`);
        setFile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const rangeValid = pageCount > 0 && from >= 1 && to >= from && to <= pageCount;

  async function onExtract() {
    if (!file || !rangeValid) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { splitPdf } = await import('../../tools/split');
      const bytes = await splitPdf(file, from, to);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extract failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setFrom(1);
    setTo(1);
    setFile(f);
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Split PDF</h1>
        <p className="mt-2 text-base text-ink/70">Extract a range of pages into a new PDF. Stays on your device.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="application/pdf"
          onFiles={(fs) => { if (fs[0]) onFile(fs[0]); }}
          hint="Drop a single PDF."
        />
      </div>

      {file && pageCount > 0 && (
        <section className="mt-6 rounded-md border border-ink/10 bg-bg p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate font-medium text-ink">{file.name}</span>
            <span className="text-sm text-ink/50">{fmtSize(file.size)} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">From</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={from}
                onChange={(e) => setFrom(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))}
                data-testid="split-from"
                className="w-24 rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">To</span>
              <input
                type="number"
                min={from}
                max={pageCount}
                value={to}
                onChange={(e) => setTo(Math.max(from, Math.min(pageCount, Number(e.target.value) || from)))}
                data-testid="split-to"
                className="w-24 rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <span className="pb-2 text-sm text-ink/60">1-based, inclusive</span>
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onExtract}
          disabled={!file || !rangeValid || busy}
          data-testid="split-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Extracting…' : 'Extract'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'split.pdf', 'application/pdf')}
            data-testid="split-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download split.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
