import { AnnotationRegistry } from '../annotations/registry';
import { useUIStore } from '../state/useUIStore';

// ponytail: data-driven via AnnotationRegistry.list(). New tools =
// a new register() call in src/annotations/register.ts. No component
// changes. No icon library in phase 4 — phase 5 swaps `label` for
// an icon + sr-only text.
export function ToolPicker() {
  const active = useUIStore((s) => s.activeTool);
  const setActive = useUIStore((s) => s.setActiveTool);
  const tools = AnnotationRegistry.list();
  return (
    <div role="toolbar" aria-label="Annotation tools" className="flex gap-1">
      {tools.map((t) => (
        <button
          key={t.type}
          type="button"
          aria-pressed={active === t.tool}
          onClick={() => setActive(t.tool)}
          className={
            active === t.tool
              ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-ink'
              : 'rounded-md border border-ink/30 px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5'
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
