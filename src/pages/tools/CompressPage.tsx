// ponytail: mirrors MergePage's shell — header, drop zone, file
// info, action button, status. The size-delta is shown HONESTLY
// (before/after bytes, not a fake percentage). The "Saved N KB" /
// "No change" copy tells the user exactly what happened.
import { useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { downloadBytes } from '../../lib/download';
import type { CompressResult } from '../../tools/compress';

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDelta(a: number, b: number): { text: string; tone: 'saved' | 'same' | 'bigger' } {
  const d = a - b;
  if (d === 0) return { text: 'No change', tone: 'same' };
  if (d > 0) return { text: `Saved ${fmtSize(d)}`, tone: 'saved' };
  return { text: `Grew by ${fmtSize(-d)}`, tone: 'bigger' };
}

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(f: File) {
    setError(null);
    setResult(null);
    setFile(f);
  }

  async function onCompress() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { compressPdf } = await import('../../tools/compress');
      const r = await compressPdf(file);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compress failed');
    } finally {
      setBusy(false);
    }
  }

  const delta = result ? fmtDelta(result.before, result.after) : null;

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Compress PDF</h1>
        <p className="mt-2 text-base text-ink/70">Strips metadata and re-saves with object streams. Honest before/after — no fake percentage claim. Stays on your device.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="application/pdf"
          onFiles={(fs) => { if (fs[0]) onFile(fs[0]); }}
          hint="Drop a single PDF."
        />
      </div>

      {file && (
        <section className="mt-6 rounded-md border border-ink/10 bg-bg p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate font-medium text-ink">{file.name}</span>
            <span className="text-sm text-ink/50" data-testid="compress-original">
              Original: {fmtSize(file.size)}
            </span>
          </div>
        </section>
      )}

      {result && (
        <section className="mt-3 rounded-md border border-ink/10 bg-bg p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-ink/70" data-testid="compress-result">Compressed: {fmtSize(result.after)}</span>
            {delta && (
              <span
                data-testid="compress-delta"
                className={
                  delta.tone === 'saved' ? 'text-sm font-medium text-secondary'
                  : delta.tone === 'bigger' ? 'text-sm font-medium text-amber-700'
                  : 'text-sm text-ink/60'
                }
              >
                {delta.text}
              </span>
            )}
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onCompress}
          disabled={!file || busy}
          data-testid="compress-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Compressing…' : 'Compress'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result.bytes, 'compressed.pdf', 'application/pdf')}
            data-testid="compress-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download compressed.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
