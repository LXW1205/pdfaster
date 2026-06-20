// ponytail: the "Convert" step is implicit — it runs on file drop,
// not on a button click. The action button IS the drop zone. The
// per-page download buttons are the only post-conversion UI.
//
// Object URLs are tracked in state and revoked in an effect cleanup
// so we don't leak. The cleanup fires on every `pages` change AND
// on unmount.
import { useEffect, useRef, useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';

export default function PdfToJpgPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<{ name: string; url: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ponytail: synced via effect per the react-hooks/refs rule.
  const pagesRef = useRef<{ name: string; url: string }[] | null>(null);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // ponytail: revoke per-page object URLs when the result changes
  // or the component unmounts. Same pattern as JpgToPdfPage.
  useEffect(() => {
    return () => {
      pagesRef.current?.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);

  async function onFile(f: File) {
    setError(null);
    setFile(f);
    setBusy(true);
    // Revoke prior pages before starting a new conversion.
    pagesRef.current?.forEach((p) => URL.revokeObjectURL(p.url));
    setPages(null);
    try {
      const { pdfToJpgBlobs } = await import('../../tools/pdf-to-jpg');
      const out = await pdfToJpgBlobs(f);
      const next = out.map((o) => ({ name: o.name, url: URL.createObjectURL(o.blob) }));
      setPages(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Convert failed');
    } finally {
      setBusy(false);
    }
  }

  function onDownload(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Container className="py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">PDF → JPG</h1>
        <p className="mt-2 text-base text-ink/70">Render every page of a PDF to a JPG. Download them one by one. Stays on your device.</p>
      </header>

      <div className="mt-8">
        <FileDropZone
          accept="application/pdf"
          onFiles={(fs) => { if (fs[0]) onFile(fs[0]); }}
          hint="Drop a single PDF."
        />
      </div>

      {file && !busy && pages === null && (
        <p className="mt-4 text-sm text-ink/70" data-testid="pdf-to-jpg-filename">{file.name}</p>
      )}

      {busy && (
        <p className="mt-6 text-sm text-ink/70" data-testid="pdf-to-jpg-busy">Converting…</p>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      {pages && pages.length > 0 && (
        <section className="mt-8">
          <p className="mb-4 text-sm text-ink/70">{pages.length} {pages.length === 1 ? 'image' : 'images'} ready.</p>
          <ul aria-label="Rendered pages" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pages.map((p, i) => (
              <li key={p.name} className="rounded-md border border-ink/10 bg-bg p-3">
                <img src={p.url} alt={p.name} className="mx-auto block max-h-64 rounded bg-white" />
                <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink/80">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => onDownload(p.url, p.name)}
                    data-testid={`pdf-to-jpg-download-${i + 1}`}
                    className="rounded-md border border-ink/20 px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
                  >
                    Download
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
