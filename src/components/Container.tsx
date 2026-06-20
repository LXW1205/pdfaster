import type { ReactNode } from 'react';

// ponytail: one component, one job. `max-w-4xl` is the spec sweet spot —
// wider would feel sparse on a tool page, narrower would cramp the file
// list / file-drop UI. Add a `size` prop (`sm | md | lg`) when the
// editor's chrome or the inspect page need a different width from
// the tool pages.
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-4xl px-6 ${className}`}>
      {children}
    </div>
  );
}
