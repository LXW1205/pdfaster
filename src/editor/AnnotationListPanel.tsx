// ponytail: shows the annotations for the current page in a small
// right-side panel. "Focus" (scrolling the canvas to center an
// annotation) is a future enhancement — for v1, the panel is
// list + delete only. The panel is collapsible (chevron toggle in
// the toolbar) so it doesn't steal screen real estate on small
// viewports. The state is local because it doesn't need to
// roundtrip through undo — closing the panel doesn't lose
// anything (annotations live in useEditorStore regardless).
import { useState } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { AnnotationRegistry } from '../annotations/registry';
import type { Annotation } from '../annotations/types';

type Props = {
  pageIndex: number;
  open: boolean;
  onToggle: () => void;
};

const TYPE_LABEL: Record<Annotation['type'], string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  freedraw: 'Free draw',
  signature: 'Signature',
};

function shortTimestamp(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function AnnotationListPanel({ pageIndex, open, onToggle }: Props) {
  const annotations = useEditorStore((s) => s.annotations);
  const removeAnnotation = useEditorStore((s) => s.removeAnnotation);
  // ponytail: the timestamp in each row is rendered with the
  // current time at mount; it doesn't tick. The panel re-mounts
  // on every annotation add (zustand returns a new array ref
  // then) which forces a re-render with fresh timestamps.
  const [now] = useState(() => Date.now());

  if (!open) {
    return (
      <button
        type="button"
        data-testid="annotation-list-toggle"
        onClick={onToggle}
        aria-label="Show annotations"
        title="Show annotations"
        className="absolute right-2 top-2 z-10 rounded-md border border-ink/15 bg-bg/90 px-2 py-1 text-xs text-ink/60 shadow-sm hover:bg-bg hover:text-ink"
      >
        ▸ Annotations
      </button>
    );
  }

  // ponytail: filter+sort in render. The store's array ref is
  // stable across unrelated updates, so the filter only re-runs
  // on annotation add/remove or page change.
  const onPage = annotations
    .filter((a) => a.pageIndex === pageIndex)
    .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <aside
      data-testid="annotation-list-panel"
      aria-label="Annotations on this page"
      className="flex w-56 shrink-0 flex-col border-l border-ink/10 bg-bg/50"
    >
      <div className="flex items-center justify-between border-b border-ink/10 px-3 py-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink/60">
          Annotations ({onPage.length})
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide annotations"
          title="Hide annotations"
          className="rounded px-1 text-ink/50 hover:bg-ink/5 hover:text-ink"
        >
          ▾
        </button>
      </div>
      {onPage.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-ink/40">
          No annotations on this page.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-ink/10 overflow-y-auto">
          {onPage.map((a) => {
            const meta = AnnotationRegistry.get(a.type);
            const color = 'color' in a ? a.color : meta?.defaultStyle.color ?? [0, 0, 0];
            return (
              <li
                key={a.id}
                data-testid={`annotation-list-item-${a.type}`}
                className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-ink/5"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 shrink-0 rounded-sm border border-ink/20"
                  style={{
                    backgroundColor: `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`,
                  }}
                />
                <span className="flex-1 truncate text-ink">{TYPE_LABEL[a.type]}</span>
                <span className="shrink-0 text-ink/40 tabular-nums">{shortTimestamp(a.createdAt, now)}</span>
                <button
                  type="button"
                  data-testid={`annotation-list-delete-${a.type}`}
                  onClick={() => removeAnnotation(a.id)}
                  aria-label={`Delete ${TYPE_LABEL[a.type]}`}
                  className="rounded px-1 text-ink/50 hover:bg-red-50 hover:text-red-600"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
