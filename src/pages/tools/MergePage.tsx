// ponytail: page mirrors the spec's editor chrome pattern — header at
// the top, action button at the bottom, status inline. New tool pages
// are 80% this template with their operation-specific UI swapped in.
// Don't add a state-management library: local useState is enough for
// the single-page scope of every tool. Lift to the editor store only
// when the same state has to span pages (e.g. "merge the editor's
// current document with an uploaded one" in a future release).
import { useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { downloadBytes } from '../../lib/download';
import { mergePdfs } from '../../tools/merge';

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function MergePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(i: number, dir: -1 | 1) {
    setFiles((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const next = f.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function remove(i: number) {
    setFiles((f) => f.filter((_, idx) => idx !== i));
    setResult(null);
  }

  async function onMerge() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = await mergePdfs(files);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Merge PDFs</h1>
        <p className="mt-2 text-base text-ink/70">Combine multiple PDFs into one. Order matters — files merge top to bottom.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="application/pdf"
          multiple
          onFiles={(fs) => { setFiles((prev) => [...prev, ...fs]); setResult(null); }}
          hint="Drop one or more PDFs. Stays on your device."
        />
      </div>

      {files.length > 0 && (
        <ul aria-label="Files to merge" className="mt-6 divide-y divide-ink/10 rounded-md border border-ink/10">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="font-medium text-ink">{i + 1}.</span>
              <span className="flex-1 truncate text-ink/80">{f.name}</span>
              <span className="text-ink/50">{fmtSize(f.size)}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${f.name} up`} className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5 disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label={`Move ${f.name} down`} className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${f.name}`} className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onMerge}
          disabled={files.length < 2 || busy}
          data-testid="merge-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Merging…' : `Merge ${files.length} file${files.length === 1 ? '' : 's'}`}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'merged.pdf', 'application/pdf')}
            data-testid="merge-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download merged.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
