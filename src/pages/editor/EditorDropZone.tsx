import { useCallback, useRef, useState } from 'react';

type Props = {
  onFile: (file: File) => void;
  error: string | null;
  // ponytail: optional hint shown below the input — used by the
  // session-restore flow to nudge the user toward the original
  // file ("Drop sample.pdf to resume."). Reuse for any future
  // "contextual pick" UX.
  hint?: string;
};

export default function EditorDropZone({ onFile, error, hint }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // ponytail: native HTML5 DnD. preventDefault without setting
    // dropEffect leaves the cursor as a "no" symbol; the pair is
    // required for the drop to be accepted.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      // Reset so picking the same file again still fires onChange.
      e.target.value = '';
    },
    [onFile],
  );

  return (
    <div
      role="region"
      aria-label="Drop a PDF here to open in the editor"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        'flex h-full w-full flex-col items-center justify-center gap-6 p-8 transition-colors',
        'border-2 border-dashed',
        isDragging ? 'border-secondary bg-primary/10' : 'border-primary/70',
      ].join(' ')}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-2xl font-semibold sm:text-3xl">Drop a PDF here</p>
        <p className="text-sm text-ink/60">or</p>

        <label
          className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-5 py-3 text-base font-semibold text-ink shadow-sm transition-colors hover:bg-secondary hover:text-bg focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-bg"
        >
          Choose a PDF
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={handleInputChange}
            aria-label="Choose PDF file"
            className="sr-only"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="max-w-sm text-center text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <p className="text-xs text-ink/50">Stays on your device. Nothing uploads.</p>
      {hint && (
        <p data-testid="editor-drop-hint" className="rounded-md border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm font-medium text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}
