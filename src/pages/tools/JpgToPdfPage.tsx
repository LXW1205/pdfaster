// ponytail: mirrors MergePage's file-list (drag/drop, ↑/↓/✕).
// Thumbnails use `URL.createObjectURL(file)`; we revoke them in an
// effect cleanup so they don't leak. The cleanup runs on every
// `urls` change AND on unmount — the array length changes whenever
// the file list changes.
//
// Promote to a `useObjectUrls(files)` hook when a third tool needs
// file-list thumbnails (rotate, watermark, page-numbers).
import { useEffect, useRef, useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { downloadBytes } from '../../lib/download';

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function JpgToPdfPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ponytail: track "the latest urls we produced" so the cleanup
  // effect can revoke stale entries on each render. We sync the
  // ref via an effect (not at render time) per the
  // react-hooks/refs rule.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => { urlsRef.current = urls; }, [urls]);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // ponytail: derive urls from files. When a file is removed from
  // the list, its URL is revoked and dropped from the array.
  useEffect(() => {
    const next = files.map((f) => {
      const existing = urlsRef.current.find((_, i) => files[i] === f);
      return existing ?? URL.createObjectURL(f);
    });
    // Revoke urls that are no longer referenced.
    const nextSet = new Set(next);
    urlsRef.current.forEach((u) => { if (!nextSet.has(u)) URL.revokeObjectURL(u); });
    setUrls(next);
  }, [files]);

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

  async function onConvert() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { jpgsToPdf } = await import('../../tools/jpg-to-pdf');
      const bytes = await jpgsToPdf(files);
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Convert failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">JPG → PDF</h1>
        <p className="mt-2 text-base text-ink/70">Convert one or more JPG or PNG images into a PDF. One image per page. Stays on your device.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="image/jpeg,image/png"
          multiple
          onFiles={(fs) => { setFiles((prev) => [...prev, ...fs]); setResult(null); }}
          hint="Drop JPG or PNG files."
        />
      </div>

      {files.length > 0 && (
        <ul aria-label="Images to convert" className="mt-6 divide-y divide-ink/10 rounded-md border border-ink/10">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-3 text-sm">
              {urls[i] && (
                <img src={urls[i]} alt="" className="h-10 w-10 rounded object-cover" />
              )}
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
          onClick={onConvert}
          disabled={files.length === 0 || busy}
          data-testid="jpg-to-pdf-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Converting…' : `Convert ${files.length} image${files.length === 1 ? '' : 's'}`}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'images.pdf', 'application/pdf')}
            data-testid="jpg-to-pdf-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download images.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
