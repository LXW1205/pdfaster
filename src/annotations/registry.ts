import type { AnnotationTypeMeta } from './types';

// ponytail: one Map, three methods. Phase 5 adds an annotation type
// by writing more `AnnotationRegistry.register()` calls in register.ts
// (data, not code paths). Replace the Map with a frozen module array
// when registry mutation at runtime becomes a real concern.
const types = new Map<AnnotationTypeMeta['type'], AnnotationTypeMeta>();

export const AnnotationRegistry = {
  register(meta: AnnotationTypeMeta) {
    types.set(meta.type, meta);
  },
  get(type: AnnotationTypeMeta['type']): AnnotationTypeMeta | undefined {
    return types.get(type);
  },
  list(): AnnotationTypeMeta[] {
    return [...types.values()];
  },
};
