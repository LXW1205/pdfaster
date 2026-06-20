// ponytail: the form field shape used by the editor. We mirror what
// pdf-lib returns (text/checkbox/radio/dropdown) into a flat array
// the UI can render. `pageIndex` and `rect` are the widget's
// position — pdf-lib returns the rect in PDF points, the FormOverlay
// converts to CSS px via the existing `pdfToCss` helper. `options`
// is only present for radio/dropdown.
//
// The shape is intentionally small: a future "create a new form
// field" feature would extend this with `kind: 'existing' | 'new'`
// and a `widget` factory. YAGNI today.
import type { RectPts } from '../annotations/types';

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown';

export type FormFieldState = {
  name: string;
  type: FormFieldType;
  value: string;
  pageIndex: number;
  rect: RectPts;
  options?: string[];
};
