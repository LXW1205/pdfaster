// ponytail: mirrors ExtractPage's single-PDF shell. Adds one extra
// state slot (currentRotation) read from page 1's `getRotation().angle`.
// The radio group is a native fieldset — accessible, keyboard-friendly,
// and Playwright finds the input via getByLabel('90°') because the
// label text is the input's parent <label>.
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

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
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
        setCurrentRotation(doc.getPage(0).getRotation().angle);
        setResult(null);
      } catch (e) {
        if (cancelled) return;
        setError(`Couldn't read that PDF. ${e instanceof Error ? e.message : String(e)}`);
        setFile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  async function onRotate() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { rotateAllPages } = await import('../../tools/rotate');
      const bytes = await rotateAllPages(file, angle);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotate failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setFile(f);
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Rotate PDF</h1>
        <p className="mt-2 text-base text-ink/70">Rotate every page of a PDF by 90°, 180°, or 270°. Stays on your device.</p>
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
            <span className="text-sm text-ink/50" data-testid="rotate-info">
              {fmtSize(file.size)} · {pageCount} {pageCount === 1 ? 'page' : 'pages'} · current rotation {currentRotation}°
            </span>
          </div>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium text-ink/80">Rotate by</legend>
            <div className="flex flex-wrap gap-4">
              {([90, 180, 270] as const).map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-ink/80">
                  <input
                    type="radio"
                    name="rotate-angle"
                    value={a}
                    checked={angle === a}
                    onChange={() => setAngle(a)}
                    className="h-4 w-4 accent-primary"
                  />
                  {a}°
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onRotate}
          disabled={!file || busy}
          data-testid="rotate-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Rotating…' : 'Rotate'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'rotated.pdf', 'application/pdf')}
            data-testid="rotate-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download rotated.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
