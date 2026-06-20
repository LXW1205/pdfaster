// ponytail: discoverability for the editor's keyboard shortcuts.
// The SHORTCUTS array (in cheatsheet-data.ts) is the single source
// of truth for both the cheatsheet UI and (by import) the
// keybinding map in EditorToolbar. Adding a new shortcut = adding
// one row + one entry in the toolbar's `map` literal.
//
// Visual: a single backplate + a panel. No focus-trap — the editor
// has no input focus to lose (the page-jump input + signature pad
// are the only `<input>` elements; the cheatsheet's `?` shortcut
// is skipped when an input is focused, so the user can't open it
// accidentally). Promote to a true focus-trap (or `<dialog
// showModal>`) when a second modal surface lands.
import { useEffect } from 'react';
import { useUIStore } from '../state/useUIStore';
import { SHORTCUTS } from './cheatsheet-data';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function Cheatsheet() {
  const open = useUIStore((s) => s.cheatsheetOpen);
  const setOpen = useUIStore((s) => s.setCheatsheetOpen);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ponytail: `?` is shift + `/` on US layouts. Match the key
      // literally (don't branch on shiftKey) so non-US layouts (where
      // `?` is somewhere else) still get the shortcut. The
      // `isEditableTarget` check is the difference between a
      // useful shortcut and a frustrating one — without it, typing
      // a `?` in the page-jump input would open the dialog.
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setOpen(!open);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cheatsheet-title"
      data-testid="cheatsheet"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg bg-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cheatsheet-title" className="text-lg font-semibold text-ink">
          Keyboard shortcuts
        </h2>
        <ul className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base">
          {SHORTCUTS.map((s) => (
            <li key={s.desc} className="contents">
              <kbd className="rounded border border-ink/20 bg-ink/5 px-2 py-0.5 font-mono text-xs text-ink/80">
                {s.keys.join(' + ')}
              </kbd>
              <span className="text-ink/80">{s.desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink/50">
          Press <kbd className="rounded border border-ink/20 bg-ink/5 px-1 font-mono">?</kbd> or{' '}
          <kbd className="rounded border border-ink/20 bg-ink/5 px-1 font-mono">Esc</kbd> to close.
        </p>
      </div>
    </div>
  );
}
