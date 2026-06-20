// ponytail: the form-fill overlay. Renders the AcroForm widgets
// (text / checkbox / dropdown / radio) on top of the canvas. The
// widget positions are read from the PDF at load time and stored
// in `useEditorStore.formFields` (see form.ts). Form values are
// kept in the editor state and applied to the source PDF at
// export time (see exportPdf.ts).
//
// The overlay does NOT attempt to position the form's value text
// in PDF coordinates — that would mean duplicating pdf-lib's
// /DA string parsing. The simple path: render an HTML input at
// the widget's CSS rect; the value the user types is the source
// of truth; on export we re-apply it to the source PDF's form
// via pdf-lib's setText/select/check. The appearance stream that
// pdf-lib generates at save-time is what the recipient sees.
//
// Render strategy: filter formFields by page once (useMemo), then
// position each field with absolute CSS at the pdfToCss(...)
// converted rect. The inputs are `pointerEvents: 'auto'` so the
// user can click them; the wrapper is `pointerEvents: 'none'` so
// the inputs don't block clicks to other UI (the canvas's text
// selection, for example). The signature overlay is z-5; this
// overlay is below it.
import { useMemo } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { pdfToCss, type Viewport } from '../lib/coords';
import type { FormFieldState } from '../state/form';

type Props = { viewport: Viewport; pageIndex: number };

export function FormOverlay({ viewport, pageIndex }: Props) {
  const formFields = useEditorStore((s) => s.formFields);
  const updateFormField = useEditorStore((s) => s.updateFormField);
  // ponytail: filter+stable reference via useMemo. zustand returns
  // the same array reference when nothing changed, so this only
  // re-runs on annotation/form mutations or page changes.
  const onPage = useMemo(
    () => formFields.filter((f) => f.pageIndex === pageIndex),
    [formFields, pageIndex],
  );
  if (onPage.length === 0) return null;
  return (
    <div
      data-testid="form-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    >
      {onPage.map((f) => (
        <FieldWidget
          key={f.name}
          field={f}
          viewport={viewport}
          onChange={(v) => updateFormField(f.name, v)}
        />
      ))}
    </div>
  );
}

function FieldWidget({
  field,
  viewport,
  onChange,
}: {
  field: FormFieldState;
  viewport: Viewport;
  onChange: (v: string) => void;
}) {
  // ponytail: same rect math as RectView / SignatureView — extract
  // to a `lib/rect-css.ts` helper when a third consumer lands.
  const minX = Math.min(field.rect.x, field.rect.x + field.rect.w);
  const minY = Math.min(field.rect.y, field.rect.y + field.rect.h);
  const w = Math.abs(field.rect.w);
  const h = Math.abs(field.rect.h);
  const ll = pdfToCss(viewport, minX, minY);
  const ur = pdfToCss(viewport, minX + w, minY + h);
  const left = Math.min(ll.x, ur.x);
  const top = Math.min(ll.y, ur.y);
  const width = Math.max(20, Math.abs(ur.x - ll.x));
  const height = Math.max(16, Math.abs(ur.y - ll.y));

  // ponytail: a 2px teal outline. On focus, swap to the secondary
  // token (deeper teal) for keyboard visibility. Reduced-motion is
  // honored via the global `* { transition: none }` guard.
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    width,
    height,
    border: '2px solid #48CFCB',
    borderRadius: 2,
    background: 'rgba(255,255,255,0.6)',
    pointerEvents: 'auto',
    display: 'flex',
    overflow: 'hidden',
  };

  // ponytail: native HTML inputs. The browser handles keyboard
  // focus, screen reader semantics, and platform affordances
  // (autocomplete, paste) for free. No custom widget lib needed.
  if (field.type === 'text') {
    return (
      <div data-testid={`form-field-${field.name}`} style={wrapperStyle}>
        <input
          type="text"
          value={field.value}
          aria-label={field.name}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full bg-transparent px-1 text-xs text-ink outline-none"
        />
      </div>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <div data-testid={`form-field-${field.name}`} style={wrapperStyle}>
        <input
          type="checkbox"
          checked={field.value === 'true'}
          aria-label={field.name}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          className="h-full w-full cursor-pointer"
        />
      </div>
    );
  }
  // radio + dropdown: native <select> with the field's options.
  // Promote to a radio-button group when a user complains that
  // <select> doesn't match the PDF's radio appearance.
  const options = field.options ?? [];
  return (
    <div data-testid={`form-field-${field.name}`} style={wrapperStyle}>
      <select
        value={field.value}
        aria-label={field.name}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full cursor-pointer bg-transparent text-xs text-ink outline-none"
      >
        {field.type === 'radio' && <option value="" />}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
