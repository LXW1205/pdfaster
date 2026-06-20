// ponytail: mirrors SplitPage's single-PDF shell. The form is a
// small block of native inputs (text, range, select, radio) — no
// new abstraction. Defaults match the prompt's spec: text "DRAFT",
// opacity 0.3, gray, center.
//
// Opacity slider uses a native range input. The current value is
// shown next to the slider so the user can see exactly what they're
// applying (0.00–1.00, step 0.05). The watermark text is then drawn
// once per page using pdf-lib's `drawText` with `opacity` passed
// through. No new dependency; opacity is a built-in pdf-lib option.
import { useState } from 'react';
import { Container } from '../../components/Container';
import { FileDropZone } from '../../components/FileDropZone';
import { downloadBytes } from '../../lib/download';

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('DRAFT');
  const [opacity, setOpacity] = useState(0.3);
  const [color, setColor] = useState<'gray' | 'red' | 'blue' | 'black'>('gray');
  const [position, setPosition] = useState<'center' | 'top' | 'bottom' | 'diagonal'>('center');
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApply() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { watermarkPdf } = await import('../../tools/watermark');
      const bytes = await watermarkPdf(file, { text, opacity, color, position });
      setResult(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Watermark failed');
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
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Watermark PDF</h1>
        <p className="mt-2 text-base text-ink/70">Overlay a text watermark on every page. Stays on your device.</p>
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
          <div className="text-sm text-ink/70">
            <span className="font-medium text-ink">{file.name}</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">Watermark text</span>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="watermark-text"
                className="rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">Opacity ({opacity.toFixed(2)})</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                data-testid="watermark-opacity"
                className="h-2 cursor-pointer accent-primary"
              />
            </label>
            <label className="flex flex-col text-sm text-ink/80">
              <span className="mb-1 font-medium">Color</span>
              <select
                value={color}
                onChange={(e) => setColor(e.target.value as typeof color)}
                data-testid="watermark-color"
                className="rounded-md border border-ink/20 px-3 py-1.5 text-ink focus:border-primary focus:outline-none"
              >
                <option value="gray">Gray</option>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
                <option value="black">Black</option>
              </select>
            </label>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink/80">Position</legend>
              <div className="flex flex-wrap gap-4">
                {(['center', 'top', 'bottom', 'diagonal'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="radio"
                      name="watermark-position"
                      value={p}
                      checked={position === p}
                      onChange={() => setPosition(p)}
                      className="h-4 w-4 accent-primary"
                    />
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onApply}
          disabled={!file || busy || text.length === 0}
          data-testid="watermark-action"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-secondary disabled:opacity-50"
        >
          {busy ? 'Applying…' : 'Apply watermark'}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => downloadBytes(result, 'watermarked.pdf', 'application/pdf')}
            data-testid="watermark-download"
            className="rounded-md border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5"
          >
            Download watermarked.pdf
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </Container>
  );
}
