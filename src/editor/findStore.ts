// ponytail: a tiny external store so the FindBar and FindOverlay
// can live as siblings in the same PageView without prop-drilling.
// The `version` counter is a "force re-render" signal — we
// subscribe to it and read the latest snapshot on each commit.
// Split into its own file so FindOverlay.tsx can stay
// component-only (react-refresh's only-export-components rule).

export type FindMatch = { x: number; y: number; w: number; h: number };

type Store = {
  rects: FindMatch[];
  current: number;
  query: string;
  version: number;
};

export type FindOverlayStore = {
  getSnapshot: () => Store;
  subscribe: (cb: () => void) => () => void;
  set: (next: Partial<Omit<Store, 'version'>>) => void;
  clear: () => void;
};

export function createFindOverlayStore(): FindOverlayStore {
  let snapshot: Store = { rects: [], current: 0, query: '', version: 0 };
  const subs = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (cb) => {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
    set: (next) => {
      snapshot = { ...snapshot, ...next, version: snapshot.version + 1 };
      subs.forEach((cb) => cb());
    },
    clear: () => {
      snapshot = { rects: [], current: 0, query: '', version: 0 };
      subs.forEach((cb) => cb());
    },
  };
}
