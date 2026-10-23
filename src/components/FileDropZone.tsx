import { useRef } from 'react';

type Props = {
  accept: string;                          // e.g. 'application/pdf' or 'image/jpeg'
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
};

// ponytail: native HTML5 DnD + native file input. The drop zone is
// visually quieter than the editor's empty state — it's a sub-component
// of a tool page, not the hero. Promote to a true drag-reorderable
// multi-file preview when the merge UI grows past the up/down-arrow
// pattern (phase 5c adds split / jpg-to-pdf which only need a single
// pick, so the upgrade can wait).
export function FileDropZone({ accept, multiple = false, onFiles, hint }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      role="region"
      aria-label="Drop files here"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...(e.dataTransfer.files ?? [])];
        if (files.length) onFiles(multiple ? files : [files[0]!]);
      }}
      className="rounded-md border-2 border-dashed border-ink/30 bg-surface-2 px-8 py-14 text-center"
    >
      <p className="font-display text-lg text-ink">Drop {multiple ? 'files' : 'a file'} here</p>
      <p className="mt-1 text-sm text-ink/60">or</p>
      <label className="mt-3 inline-block cursor-pointer rounded-md bg-primary px-4 py-2 font-display text-sm text-primary-ink shadow-shaft hover:bg-signal hover:shadow-shaft-hover focus-within:ring-2 focus-within:ring-signal-press">
        Choose {multiple ? 'files' : 'a file'}
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          aria-label={`Choose ${multiple ? 'files' : 'a file'}`}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) onFiles(files);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
      </label>
      {hint && <p className="mt-3 text-xs text-ink/50">{hint}</p>}
    </div>
  );
}
