import { AnnotationRegistry } from '../annotations/registry';
import { useUIStore } from '../state/useUIStore';

// ponytail: data-driven via AnnotationRegistry.list(). New tools =
// a new register() call in src/annotations/register.ts. No component
// changes. No icon library in phase 4 — phase 5 swaps `label` for
// an icon + sr-only text.
//
// The Move button is the visible affordance for the `select` tool
// (the no-op default). The underlying ToolId stays 'select' —
// the keyboard map (V), the state, and the ARIA semantics all
// reference `select`. Only the visible label is "Move", which
// matches the user's mental model: this tool moves existing
// annotations. (Ceiling: a true "select" semantic vs. "move"
// semantic would be a second ToolId; the move/resize code
// already lives in the overlay's select-mode branch.)
export function ToolPicker() {
  const active = useUIStore((s) => s.activeTool);
  const setActive = useUIStore((s) => s.setActiveTool);
  const tools = AnnotationRegistry.list();
  return (
    <div role="toolbar" aria-label="Annotation tools" className="flex gap-1">
      <button
        key="move"
        type="button"
        data-testid="tool-move"
        aria-pressed={active === 'select'}
        onClick={() => setActive('select')}
        className={
          active === 'select'
            ? 'rounded-md bg-primary px-3 py-2 text-base font-medium text-ink'
            : 'rounded-md border border-ink/30 px-3 py-2 text-base font-medium text-ink/70 hover:bg-ink/5'
        }
      >
        Move
      </button>
      {tools.map((t) => (
        <button
          key={t.type}
          type="button"
          aria-pressed={active === t.tool}
          onClick={() => setActive(t.tool)}
          className={
            active === t.tool
              ? 'rounded-md bg-primary px-3 py-2 text-base font-medium text-ink'
              : 'rounded-md border border-ink/30 px-3 py-2 text-base font-medium text-ink/70 hover:bg-ink/5'
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
