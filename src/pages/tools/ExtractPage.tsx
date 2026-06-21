// ponytail: mirrors DeletePagesPage's shell. Default state is
// UNCHECKED — Extract is opt-in: "I want these specific pages",
// the inversion of Delete where the default is "keep all" and you
// uncheck what you want to remove. The bulk-action + range-input
// UX is two ways to do the same thing; the range input is the
// power-user shortcut.
import { useEffect, useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { downloadBytes } from '../../lib/download';
import { PDFDocument } from 'pdf-lib';

export default function ExtractPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [rangeSpec, setRangeSpec] = useState('');
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
        // ponytail: pdf-lib's getSize() returns the same {w, h} as
        // pdf.js's getViewport({ scale: 1 }) — no extra library load.
        // Same pattern as DeletePagesPage's useEffect; promote to a
        // usePageSize(file) hook when a third tool needs it.
        const { width, height } = doc.getPage(0).getSize();
        setPageWidth(Math.round(width));
        setPageHeight(Math.round(height));
        // ponytail: default unchecked — Extract is opt-in (the
        // inversion of Delete where the default is "keep all").
        setSelected(Array(n).fill(false));
        setRangeSpec('');
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
    setSelected((s) => s.map((v, idx) => (idx === i ? !v : v)));
  }
  function selectAll() { setSelected((s) => s.map(() => true)); }
  function selectNone() { setSelected((s) => s.map(() => false)); }
  function selectInvert() { setSelected((s) => s.map((v) => !v)); }
  async function applyRangeSpec() {
    if (pageCount === 0) return;
    // ponytail: range input is the power-user shortcut — a
    // text alternative to the checkbox bulk actions.
    const { parseRangeSpec } = await import('../../tools/extract');
    const indices = parseRangeSpec(rangeSpec, pageCount);
    const next = Array(pageCount).fill(false);
    for (const i of indices) next[i] = true;
    setSelected(next);
  }

  async function onExtract() {
    if (!file) return;
    const indices = selected.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
    if (indices.length === 0) { setError('Select at least one page'); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { extractPages } = await import('../../tools/extract');
      const bytes = await extractPages(file, indices);
      setResult(bytes);
      // ponytail: one-click UX — clicking Extract generates the
      // result AND triggers the download. The Download button is
      // a re-download affordance shown after the first result.
      downloadBytes(bytes, 'extracted.pdf', 'application/pdf');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extract failed');
    } finally {
      setBusy(false);
    }
  }

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setFile(f);
  }

  const selectedCount = selected.filter(Boolean).length;

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Extract pages</h1>
        <p className="mt-2 text-base text-ink/70">Pick the pages you want in a new PDF. Single pages or ranges. Stays on your device.</p>
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
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-ink/70">
                <span className="font-medium text-ink">{selectedCount}</span> of {pageCount} selected
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  data-testid="extract-select-all"
                  className="rounded px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  data-testid="extract-select-none"
                  className="rounded px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
                >
                  Select none
                </button>
                <button
                  type="button"
                  onClick={selectInvert}
                  data-testid="extract-select-invert"
                  className="rounded px-3 py-1.5 text-sm text-ink/70 hover:bg-ink/5"
                >
                  Invert
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 text-sm text-ink/80">
                <span className="mb-1 block font-medium">Or type ranges, e.g. 1, 3, 5-7</span>
                <input
                  type="text"
                  value={rangeSpec}
                  onChange={(e) => setRangeSpec(e.target.value)}
                  placeholder="1, 3, 5-7"
                  data-testid="extract-ranges"
                  className="w-full rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={applyRangeSpec}
                data-testid="extract-apply"
                className="rounded-md border border-ink/20 px-4 py-1.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
              >
                Apply
              </button>
            </div>
          </div>
          <ul aria-label="Pages" className="divide-y divide-ink/10 rounded-md border border-ink/10">
            {selected.map((sel, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-10 font-medium text-ink">{i + 1}.</span>
                <span className="flex-1 text-ink/70">Page {i + 1} / {pageWidth}×{pageHeight} pt</span>
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggle(i)}
                  aria-label={`Select page ${i + 1}`}
                  data-testid={`extract-checkbox-${i}`}
                  className="h-4 w-4 accent-primary"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onExtract}
          disabled={!file || selectedCount === 0 || busy}
          data-testid="extract-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Extracting…' : `Extract ${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'}`}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'extracted.pdf', 'application/pdf')}
            data-testid="extract-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download extracted.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
