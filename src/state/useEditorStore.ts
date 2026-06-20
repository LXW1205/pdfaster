import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Annotation } from '../annotations/types';
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
  setDocument: (bytes: Uint8Array, fileName: string) => void;
  clearDocument: () => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setFormFields: (fields: FormFieldState[]) => void;
  updateFormField: (name: string, value: string) => void;
};

// ponytail: `partialize` keeps `bytes`, `fileName`, and `formFields`
// out of history — none are user-edit data that should roundtrip
// through undo. `formFields` is particularly load-bearing: typing
// "John" into a text field would otherwise create 4 history entries
// (J, Jo, Joh, John). Promote to a per-field sub-store + a separate
// `useFormHistory` (also zundo) when undo-of-form-fill ships.
export const useEditorStore = create(
  temporal<State, [], [], Pick<State, 'annotations'>>((set) => ({
    bytes: null,
    fileName: null,
    annotations: [],
    formFields: [],
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
  }), {
    // ponytail: 100-entry cap matches the spec. Switch to a command
    // pattern (one entry per logical action) when free-draw strokes
    // fill 100 entries after a single user gesture.
    limit: 100,
    partialize: (s) => ({ annotations: s.annotations }),
  }),
);
