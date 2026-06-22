// ponytail: mirrors ExtractPage's single-PDF shell. The page-1 size
// is read from `getSize()` (MediaBox-derived) and shown above the
// margin input. The number input is clamped to non-negative on
// every keystroke; the tool's own clamp + size check catches the
// "margin larger than half the page" case at click time.
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

export default function CropPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [margin, setMargin] = useState(36);
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
        const size = doc.getPage(0).getSize();
        setPageWidth(size.width);
        setPageHeight(size.height);
        setResult(null);
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't read that PDF. ${e instanceof Error ? e.message : String(e)}`);
        setFile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  async function onCrop() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { cropAllPages } = await import('../../tools/crop');
      const bytes = await cropAllPages(file, margin);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Crop failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setMargin(36);
    setPageWidth(0);
    setPageHeight(0);
    setFile(f);
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Crop PDF</h1>
        <p className="mt-2 text-base text-ink/70">Trim a uniform margin from every edge of every page. Stays on your device.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="application/pdf"
          onFiles={(fs) => { if (fs[0]) onFile(fs[0]); }}
          hint="Drop a single PDF."
        />
      </div>

      {file && pageWidth > 0 && pageHeight > 0 && (
        <section className="mt-6 rounded-md border border-ink/10 bg-bg p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate font-medium text-ink">{file.name}</span>
            <span className="text-sm text-ink/50" data-testid="crop-info">
              {fmtSize(file.size)} · Page 1: {pageWidth} × {pageHeight} pt
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">Trim from each edge (points)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={margin}
                onChange={(e) => setMargin(Math.max(0, Number(e.target.value) || 0))}
                data-testid="crop-margin"
                className="w-32 rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <span className="pb-2 text-sm text-ink/60">72 pt = 1 inch</span>
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onCrop}
          disabled={!file || busy}
          data-testid="crop-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Cropping…' : 'Crop'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'cropped.pdf', 'application/pdf')}
            data-testid="crop-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download cropped.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
