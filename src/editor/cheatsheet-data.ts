// ponytail: single source of truth for the editor's keyboard
// shortcuts. SHORTCUTS is the cheatsheet's display rows;
// TOOL_KEY_MAP is the toolbar's keydown → ToolId map. Keep
// them in sync — adding a tool = adding a row + a key. Split
// out of Cheatsheet.tsx so the file only exports components
// (react-refresh's only-export-components rule is happy).

import type { ToolId } from '../state/useUIStore';

export const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['V'], desc: 'Select tool' },
  { keys: ['H'], desc: 'Highlight' },
  { keys: ['U'], desc: 'Underline' },
  { keys: ['T'], desc: 'Strikethrough' },
  { keys: ['R'], desc: 'Rectangle' },
  { keys: ['E'], desc: 'Ellipse' },
  { keys: ['F'], desc: 'Free draw' },
  { keys: ['S'], desc: 'Signature' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo' },
  { keys: ['['], desc: 'Previous page' },
  { keys: [']'], desc: 'Next page' },
  { keys: ['0'], desc: 'Zoom to fit' },
  { keys: ['Space', 'drag'], desc: 'Pan' },
  { keys: ['?'], desc: 'Show this cheatsheet' },
];

export const TOOL_KEY_MAP: Record<string, ToolId> = {
  v: 'select',
  h: 'highlight',
  u: 'underline',
  t: 'strikethrough',
  r: 'rectangle',
  e: 'ellipse',
  f: 'freedraw',
  s: 'signature',
};
