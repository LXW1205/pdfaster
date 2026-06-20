import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Annotation, Rgb } from '../annotations/types';
import type { FormFieldState } from './form';

type State = {
  bytes: Uint8Array | null;
  fileName: string | null;
  annotations: Annotation[];
  // ponytail: form fields live alongside annotations in the same
  // store for ergonomics (one source of truth for editor state),
  // but they are deliberately excluded from zundo history (see
  // `partialize` below) — undoing a form fill is a separate UX
  // pattern that ships in phase 8.
  formFields: FormFieldState[];
  // ponytail: per-tool current color. Keyed by tool id so switching
  // back to a tool restores its last-picked color. The picker
  // shows the entry for the active tool; picking a color updates
  // the entry. The annotation's `color` field stores the picked
  // value at draw time (so the in-place export is consistent with
  // the visual). The store is NOT history-tracked — picking a
  // color isn't an undoable action.
  toolColors: Partial<Record<string, Rgb>>;
  setDocument: (bytes: Uint8Array, fileName: string) => void;
  clearDocument: () => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setFormFields: (fields: FormFieldState[]) => void;
  updateFormField: (name: string, value: string) => void;
  setToolColor: (tool: string, color: Rgb) => void;
};

// ponytail: `partialize` keeps `bytes`, `fileName`, `formFields`,
// and `toolColors` out of history — none are user-edit data that
// should roundtrip through undo. `formFields` is particularly
// load-bearing: typing "John" into a text field would otherwise
// create 4 history entries (J, Jo, Joh, John). Promote to a
// per-field sub-store + a separate `useFormHistory` (also zundo)
// when undo-of-form-fill ships.
export const useEditorStore = create(
  temporal<State, [], [], Pick<State, 'annotations'>>((set) => ({
    bytes: null,
    fileName: null,
    annotations: [],
    formFields: [],
    toolColors: {},
    setDocument: (bytes, fileName) =>
      set({ bytes, fileName, annotations: [], formFields: [] }),
    clearDocument: () =>
      set({ bytes: null, fileName: null, annotations: [], formFields: [] }),
    addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
    removeAnnotation: (id) =>
      set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
    setFormFields: (fields) => set({ formFields: fields }),
    updateFormField: (name, value) =>
      set((s) => ({
        formFields: s.formFields.map((f) =>
          f.name === name ? { ...f, value } : f,
        ),
      })),
    setToolColor: (tool, color) =>
      set((s) => ({ toolColors: { ...s.toolColors, [tool]: color } })),
  }), {
    // ponytail: 100-entry cap matches the spec. Switch to a command
    // pattern (one entry per logical action) when free-draw strokes
    // fill 100 entries after a single user gesture.
    limit: 100,
    partialize: (s) => ({ annotations: s.annotations }),
  }),
);
