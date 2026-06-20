// ponytail: 5 brand-aligned colors. The first slot is the spec's
// highlight yellow; the second is the spec's secondary teal. The
// rest are common PDF annotation picks (red for strikeout, dark
// gray for general text, black for "no color at all"). Split into
// its own file so ColorPicker.tsx can stay component-only
// (react-refresh's only-export-components rule).
import type { Rgb } from '../annotations/types';

export const PALETTE: Rgb[] = [
  [1.0, 0.92, 0.23],   // yellow (highlight default)
  [0.13, 0.59, 0.6],   // teal (spec secondary)
  [0.86, 0.15, 0.15],  // red
  [0.25, 0.25, 0.25],  // dark gray
  [0, 0, 0],           // black
];
