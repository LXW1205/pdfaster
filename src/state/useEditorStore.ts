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
  // ponytail: selection is ephemeral. It's deliberately omitted
  // from `partialize` so clicking around doesn't pollute the undo
  // stack — Ctrl+Z should revert the actual change (a move, a
  // resize, a delete), not "you clicked on something". Page
  // switches, tool switches, and document loads also don't push
  // history entries.
  selectedId: string | null;
  setDocument: (bytes: Uint8Array, fileName: string) => void;
  clearDocument: () => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  // ponytail: shallow-merge a patch into one annotation. For
  // `{ rect: newRect }` this swaps the rect; for `{ points: [...] }`
  // it swaps the points. We never patch `id` or `createdAt`
  // (the call sites don't). The history is partialize-tracked, so
  // every move/resize becomes one undo entry — the editor's
  // drag is "a series of intermediate updates" but the user
  // sees one logical action.
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  setFormFields: (fields: FormFieldState[]) => void;
  updateFormField: (name: string, value: string) => void;
  setToolColor: (tool: string, color: Rgb) => void;
  setSelectedId: (id: string | null) => void;
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
    selectedId: null,
    setDocument: (bytes, fileName) =>
      // ponytail: reset selectedId on document load. A selection
      // from the previous doc would point at a UUID that no longer
      // exists in `annotations`; rendering the visual would be a
      // no-op (the lookup returns null), but it's still a stale
      // ghost in the store. Cheaper to clear.
      set({ bytes, fileName, annotations: [], formFields: [], selectedId: null }),
    clearDocument: () =>
      set({ bytes: null, fileName: null, annotations: [], formFields: [], selectedId: null }),
    addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
    removeAnnotation: (id) =>
      // ponytail: clear selectedId when the selected annotation
      // goes away. Otherwise the store holds a dangling id and
      // the Delete keypress handler would silently no-op on a
      // phantom selection.
      set((s) => ({
        annotations: s.annotations.filter((a) => a.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      })),
    updateAnnotation: (id, patch) =>
      set((s) => ({
        annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } as Annotation : a)),
      })),
    setFormFields: (fields) => set({ formFields: fields }),
    updateFormField: (name, value) =>
      set((s) => ({
        formFields: s.formFields.map((f) =>
          f.name === name ? { ...f, value } : f,
        ),
      })),
    setToolColor: (tool, color) =>
      set((s) => ({ toolColors: { ...s.toolColors, [tool]: color } })),
    setSelectedId: (id) => set({ selectedId: id }),
  }), {
    // ponytail: 100-entry cap matches the spec. Switch to a command
    // pattern (one entry per logical action) when free-draw strokes
    // fill 100 entries after a single user gesture.
    limit: 100,
    partialize: (s) => ({ annotations: s.annotations }),
  }),
);
