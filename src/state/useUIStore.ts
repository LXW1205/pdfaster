import { create } from 'zustand';

// ponytail: `signature` is the 7th tool — the overlay is a full
// canvas-based signature pad (SignatureOverlay), not a draft
// rect, so the registry's `shape: 'rect'` meta is used as a
// no-op fallback (the overlay short-circuits when activeTool
// is 'signature').
export type ToolId = 'select' | 'highlight' | 'underline' | 'strikethrough' | 'rectangle' | 'ellipse' | 'freedraw' | 'signature';

type State = {
  activeTool: ToolId;
  pageIndex: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  setActiveTool: (t: ToolId) => void;
  setPageIndex: (i: number) => void;
  setZoom: (z: number) => void;
  setRotation: (r: 0 | 90 | 180 | 270) => void;
};

// ponytail: `select` is the no-op default. Phase 6 wires the rest
// of the ToolId values to AnnotationRegistry entries. `pageIndex`,
// `zoom`, `rotation` are wired to toolbar / thumbnails / canvas in
// phase 6 — they were placeholders in phase 4.
export const useUIStore = create<State>((set) => ({
  activeTool: 'select',
  pageIndex: 0,
  zoom: 1.0,
  rotation: 0,
  setActiveTool: (t) => set({ activeTool: t }),
  setPageIndex: (i) => set({ pageIndex: i }),
  setZoom: (z) => set({ zoom: z }),
  setRotation: (r) => set({ rotation: r }),
}));
