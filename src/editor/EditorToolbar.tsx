// ponytail: the editor's chrome. Tool picker, undo/redo, zoom,
// page nav, export, cheatsheet. All buttons are small + quiet
// per the frontend-design brief — the canvas is the subject.
//
// Subscriptions are scoped: undo/redo subscribe to history depth
// only, not the past/future arrays. This keeps the toolbar from
// re-rendering on every annotation add (which would also re-render
// the canvas, the thumbnails, etc.).
//
// Phase 8 polish:
//   1. Bigger hit targets (px-3 py-2 = 44px-ish on the IconButton).
//   2. Zoom-to-fit button + `0` shortcut — EditorPage owns the
//      container ref; the toolbar calls the onFit callback.
//   3. Single keyboard handler for tool selection, undo/redo,
//      page nav, zoom-fit. Skips when an <input>/<textarea>/
//      [contenteditable] is focused. The Cheatsheet has its own
//      handler for the `?` toggle.
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useEditorStore } from '../state/useEditorStore';
import { useUIStore } from '../state/useUIStore';
import { Container } from '../components/Container';
import { ToolPicker } from './ToolPicker';
import { exportPdf } from './exportPdf';
import { downloadBytes } from '../lib/download';
import { TOOL_KEY_MAP } from './cheatsheet-data';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type Props = {
  pdf: PDFDocumentProxy | null;
  pageCount: number;
  fileName?: string | null;
  disabled?: boolean;
  onExport?: () => void;
  // ponytail: onClose is the "drop the saved session" affordance.
  // The threat model is a shared computer: the user must explicitly
  // click Close to evict the IndexedDB record. We do not hook
  // beforeunload to clear (unreliable across browsers). Promoting
  // to a "Clear session on tab close" hook is a 1-day add when
  // the threat model demands it.
  onClose?: () => void;
  // ponytail: onFit is the toolbar's hook into the page's CSS size
  // + the container's available area. EditorPage owns the ref; the
  // toolbar just calls the callback (the math lives in the page
  // because that's where the dimensions are measurable).
  onFit?: () => void;
  // ponytail: onShowCheatsheet is the discoverability button. The
  // keyboard shortcut (`?`) toggles the cheatsheet via the
  // useUIStore; the click handler does the same so users without
  // the shortcut get the same surface.
  onShowCheatsheet?: () => void;
};

// ponytail: zundo 2.x types `useEditorStore.temporal` as a vanilla
// `StoreApi<...>` (not a hook). `useStore(store, selector)` from
// `zustand` wraps it in a React subscription — the zundo README's
// recommended pattern. We only subscribe to the history-depth
// numbers, not the arrays themselves.
const usePastDepth = () =>
  useStore(useEditorStore.temporal, (s) => s.pastStates.length);
const useFutureDepth = () =>
  useStore(useEditorStore.temporal, (s) => s.futureStates.length);

// ponytail: the export invocation lives in EditorPage so the
// toolbar can stay prop-driven (and so error / exporting state can
// live in the page). When the toolbar is rendered without an
// `onExport` (e.g. pre-load drop-zone state), the export button is
// disabled.
export function EditorToolbar({ pdf, pageCount, fileName, disabled, onExport, onClose, onFit, onShowCheatsheet }: Props) {
  // ponytail: subscribe to pastStates / futureStates lengths only,
  // not the full arrays. Re-renders fire only when history depth
  // changes. The buttons call `useEditorStore.temporal.getState()`
  // on click — the temporal store is a stable reference; the
  // returned `undo` / `redo` functions are also stable.
  const past = usePastDepth();
  const future = useFutureDepth();

  const zoom = useUIStore((s) => s.zoom);
  const setZoom = useUIStore((s) => s.setZoom);
  const pageIndex = useUIStore((s) => s.pageIndex);
  const setPageIndex = useUIStore((s) => s.setPageIndex);
  const rotation = useUIStore((s) => s.rotation);
  const setRotation = useUIStore((s) => s.setRotation);

  const [exporting, setExporting] = useState(false);

  async function handleExportClick() {
    if (onExport) {
      onExport();
      return;
    }
    setExporting(true);
    try {
      const out = await exportPdf();
      downloadBytes(out, 'edited.pdf', 'application/pdf');
    } finally {
      setExporting(false);
    }
  }

  // ponytail: one keyboard handler for all editor shortcuts. The
  // `isEditableTarget` skip is the difference between a useful
  // shortcut and a frustrating one — without it, typing a `v` in
  // the page-jump input would switch the active tool. The Cheatsheet
  // owns its own `?` toggle (a separate effect in Cheatsheet.tsx)
  // so this handler can stay focused on editor actions. The
  // `pageIndex` + `pageCount` + `onFit` deps force a fresh handler
  // when the navigation state changes; the cheatsheet never closes
  // a text input mid-type, so input-skipping is the load-bearing
  // detail.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      // Undo/redo.
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        useEditorStore.temporal.getState().redo();
        return;
      }
      // Zoom fit.
      if (!e.ctrlKey && !e.metaKey && e.key === '0') {
        e.preventDefault();
        onFit?.();
        return;
      }
      // Page nav.
      if (e.key === '[') {
        e.preventDefault();
        useUIStore.getState().setPageIndex(Math.max(0, pageIndex - 1));
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        useUIStore.getState().setPageIndex(Math.min(pageCount - 1, pageIndex + 1));
        return;
      }
      // Tool selection. Skip when a modifier is held so Ctrl+V
      // (paste), Cmd+S (save), etc. don't switch tools.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOL_KEY_MAP[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          useUIStore.getState().setActiveTool(tool);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageIndex, pageCount, onFit]);

  const hasDoc = !disabled && pdf !== null && pageCount > 0;

  return (
    <div
      data-testid="editor-toolbar"
      data-page-count={pageCount}
      className="sticky top-0 z-20 border-b border-ink/10 bg-bg/85 backdrop-blur"
    >
      <Container className="flex flex-wrap items-center gap-1.5 py-2">
        {fileName && (
          <span
            data-testid="editor-filename"
            className="mr-2 max-w-[12rem] truncate text-base font-medium text-ink/80"
            title={fileName}
          >
            {fileName}
          </span>
        )}
        <ToolPicker />

        <Divider />

        <IconButton
          testId="undo"
          label="Undo"
          onClick={() => useEditorStore.temporal.getState().undo()}
          disabled={past === 0}
        >
          ↶
        </IconButton>
        <IconButton
          testId="redo"
          label="Redo"
          onClick={() => useEditorStore.temporal.getState().redo()}
          disabled={future === 0}
        >
          ↷
        </IconButton>

        <Divider />

        <IconButton
          testId="zoom-out"
          label="Zoom out"
          onClick={() => setZoom(Math.max(0.25, Math.round((zoom - 0.25) * 100) / 100))}
        >
          −
        </IconButton>
        <span
          data-testid="zoom-label"
          className="min-w-[3.25rem] select-none text-center text-base tabular-nums text-ink/70"
        >
          {Math.round(zoom * 100)}%
        </span>
        <IconButton
          testId="zoom-in"
          label="Zoom in"
          onClick={() => setZoom(Math.min(4, Math.round((zoom + 0.25) * 100) / 100))}
        >
          +
        </IconButton>
        <button
          type="button"
          data-testid="zoom-fit"
          onClick={() => onFit?.()}
          aria-label="Zoom to fit"
          title="Zoom to fit (0)"
          className="rounded px-3 py-2 text-xs text-ink/60 hover:bg-ink/5"
        >
          Fit
        </button>
        <button
          type="button"
          data-testid="zoom-reset"
          onClick={() => setZoom(1)}
          className="rounded px-3 py-2 text-xs text-ink/60 hover:bg-ink/5"
        >
          Reset
        </button>

        <Divider />

        <IconButton
          testId="page-prev"
          label="Previous page"
          onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
          disabled={!hasDoc || pageIndex === 0}
        >
          ‹
        </IconButton>
        <span
          data-testid="page-indicator"
          className="flex items-center gap-1 text-base tabular-nums text-ink/70"
        >
          {/*
            ponytail: the page number is a visible text node, not an
            input's value attribute. (An input's `value` is not part
            of the parent's `textContent` — accessibility tools and
            the e2e `toContainText` matcher see the empty string
            there.) The input is a separate, visually quiet jump
            affordance; click it to type a page number.
          */}
          <span className="min-w-[1.25rem] text-center text-ink/80">{pageIndex + 1}</span>
          <span className="text-ink/50">/ {pageCount || '–'}</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, pageCount)}
            value={pageIndex + 1}
            onChange={(e) => {
              const n = Math.max(1, Math.min(Math.max(1, pageCount), Number(e.target.value) || 1));
              setPageIndex(n - 1);
            }}
            aria-label="Jump to page"
            className="ml-1 w-12 rounded border border-ink/15 bg-transparent px-1 py-0.5 text-center text-sm tabular-nums text-ink/80 focus:border-primary focus:outline-none"
            disabled={!hasDoc}
          />
        </span>
        <IconButton
          testId="page-next"
          label="Next page"
          onClick={() => setPageIndex(Math.min(Math.max(0, pageCount - 1), pageIndex + 1))}
          disabled={!hasDoc || pageIndex >= pageCount - 1}
        >
          ›
        </IconButton>

        <Divider />

        <select
          data-testid="rotation-select"
          aria-label="Page rotation"
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value) as 0 | 90 | 180 | 270)}
          className="rounded border border-ink/15 bg-transparent px-3 py-2 text-base text-ink/70 focus:border-primary focus:outline-none"
        >
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {onShowCheatsheet && (
            <button
              type="button"
              data-testid="cheatsheet-open"
              onClick={() => onShowCheatsheet()}
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              className="rounded-md px-3 py-2 text-base text-ink/60 hover:bg-ink/5 hover:text-ink"
            >
              ?
            </button>
          )}
          {onClose && (
            <button
              type="button"
              data-testid="editor-close"
              onClick={onClose}
              aria-label="Close editor and clear saved session"
              title="Clear the saved session"
              className="rounded-md px-4 py-2 text-base font-medium text-ink/60 hover:bg-ink/5 hover:text-ink"
            >
              Close
            </button>
          )}
          <button
            type="button"
            data-testid="export-pdf"
            onClick={handleExportClick}
            disabled={disabled || exporting}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-base font-semibold text-ink shadow-sm transition-colors hover:bg-secondary hover:text-bg disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </Container>
    </div>
  );
}

function Divider() {
  return <div aria-hidden="true" className="mx-1 h-6 w-px bg-ink/10" />;
}

function IconButton({
  testId,
  label,
  onClick,
  disabled,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  // ponytail: px-3 py-2 ≈ 44px hit target on a 17px root font — the
  // spec's a11y floor. Bumping the root font from 16px to 17px in
  // index.css also stretches every text-* utility, but the padding
  // is on the box, not the text, so this needs an explicit change.
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded px-3 py-2 text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
