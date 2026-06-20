// ponytail: mirrors SplitPage's single-PDF shell. The page count is
// derived from the file (no manual entry). Position + format are
// native selects — Playwright finds the format select via
// getByLabel(/format/i) because the wrapping <label> contains the
// word "Format".
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

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right' | 'top-right'>('bottom-center');
  const [format, setFormat] = useState<'n' | 'n-of-m' | 'page-n-of-m'>('n');
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
        setPageCount(doc.getPageCount());
        setResult(null);
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't read that PDF. ${e instanceof Error ? e.message : String(e)}`);
        setFile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  async function onAdd() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { addPageNumbers } = await import('../../tools/page-numbers');
      const bytes = await addPageNumbers(file, { position, format });
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add page numbers failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setPageCount(0);
    setFile(f);
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Add page numbers</h1>
        <p className="mt-2 text-base text-ink/70">Stamp a page number on every page. Stays on your device.</p>
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
            <span className="text-sm text-ink/50" data-testid="page-numbers-info">
              {fmtSize(file.size)} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">Position</span>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as typeof position)}
                data-testid="page-numbers-position"
                className="rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              >
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-right">Bottom right</option>
                <option value="top-right">Top right</option>
              </select>
            </label>
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
                data-testid="page-numbers-format"
                className="rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              >
                <option value="n">1</option>
                <option value="n-of-m">1 of N</option>
                <option value="page-n-of-m">Page 1 of N</option>
              </select>
            </label>
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onAdd}
          disabled={!file || busy}
          data-testid="page-numbers-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add page numbers'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'numbered.pdf', 'application/pdf')}
            data-testid="page-numbers-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download numbered.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
