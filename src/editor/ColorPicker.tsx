// ponytail: a 5-color palette, hard-coded (no color wheel). The
// palette is shown when an annotation tool is active; hidden
// when 'select' is active (no point picking a color for the
// no-op). Each tool has its own "current color" — switching to
// a different tool restores that tool's last-picked color.
import { useEditorStore } from '../state/useEditorStore';
import { useUIStore, type ToolId } from '../state/useUIStore';
import { AnnotationRegistry } from '../annotations/registry';
import type { Rgb } from '../annotations/types';
import { PALETTE } from './colorPalette';

function defaultColorForTool(tool: ToolId): Rgb {
  if (tool === 'select') return [0, 0, 0];
  const meta = AnnotationRegistry.list().find((m) => m.tool === tool);
  return meta?.defaultStyle.color ?? [0, 0, 0];
}

export function ColorPicker() {
  const activeTool = useUIStore((s) => s.activeTool);
  const toolColors = useEditorStore((s) => s.toolColors);
  const setToolColor = useEditorStore((s) => s.setToolColor);
  // ponytail: hide the picker when 'select' is active. Showing
  // a color palette for a no-op tool confuses more than it helps.
  if (activeTool === 'select') return null;
  const picked = toolColors[activeTool] ?? defaultColorForTool(activeTool);
  return (
    <div
      data-testid="color-picker"
      role="group"
      aria-label="Annotation color"
      className="ml-2 flex items-center gap-1"
    >
      {PALETTE.map((c, i) => {
        const isActive =
          c[0] === picked[0] && c[1] === picked[1] && c[2] === picked[2];
        return (
          <button
            key={i}
            type="button"
            data-testid={`color-swatch-${i}`}
            onClick={() => setToolColor(activeTool, c)}
            aria-label={`Color ${i + 1}`}
            aria-pressed={isActive}
            title={`Color ${i + 1}`}
            className={`h-5 w-5 rounded-sm border ${
              isActive ? 'border-secondary ring-2 ring-primary' : 'border-ink/20'
            }`}
            style={{
              backgroundColor: `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`,
            }}
          />
        );
      })}
    </div>
  );
}
