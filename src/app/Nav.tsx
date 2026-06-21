import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';

type NavItem = { to: string; label: string; description: string };
type NavCategory = { id: string; label: string; items: NavItem[] };

// ponytail: 12 items wrapped to 2 rows was a bad use of horizontal
// space. Group by function (4 categories, 1 + 6 + 3 + 2 items),
// show 4 top-level chips, dropdown on hover/click for the 3 with
// sub-items. The Editor stays a direct link (1 item doesn't justify
// a dropdown chevron). `title` attribute gives native tooltips for
// free — no library, no delay, just a one-line attribute per item.
// Dropdown uses controlled state + click-outside + Escape to close.
const categories: NavCategory[] = [
  {
    id: 'organize', label: 'Organize',
    items: [
      { to: '/tools/merge',         label: 'Merge',        description: 'Combine multiple PDFs into one' },
      { to: '/tools/split',         label: 'Split',        description: 'Extract a range of pages into a new PDF' },
      { to: '/tools/extract',       label: 'Extract',      description: 'Pick specific pages (single or ranges) into a new PDF' },
      { to: '/tools/delete-pages',  label: 'Delete pages', description: 'Remove selected pages from a PDF' },
      { to: '/tools/reorder',       label: 'Reorder',      description: 'Rearrange the page order of a PDF' },
      { to: '/tools/rotate',        label: 'Rotate',       description: 'Rotate every page by 90°, 180°, or 270°' },
      { to: '/tools/crop',          label: 'Crop',         description: 'Trim a uniform margin from every page' },
    ],
  },
  {
    id: 'modify', label: 'Modify',
    items: [
      { to: '/tools/compress',       label: 'Compress',     description: 'Strip metadata to reduce file size' },
      { to: '/tools/watermark',      label: 'Watermark',    description: 'Stamp a text watermark on every page' },
      { to: '/tools/page-numbers',   label: 'Page numbers', description: 'Add page numbers to every page' },
    ],
  },
  {
    id: 'convert', label: 'Convert',
    items: [
      { to: '/tools/jpg-to-pdf', label: 'JPG → PDF', description: 'Convert images to a PDF document' },
      { to: '/tools/pdf-to-jpg', label: 'PDF → JPG', description: 'Export every page as a JPG image' },
    ],
  },
];

function NavDropdown({ category, currentPath }: { category: NavCategory; currentPath: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = category.items.some((it) => it.to === currentPath);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close the dropdown on navigation. The parent remounts this
  // component on every path change via `key={currentPath}` — that
  // resets `open` without a set-state-in-effect. See the parent's
  // `<NavDropdown key={currentPath} ... />` call.
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={`${category.label} tools`}
        className={isActive
          ? 'inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-base font-medium text-ink'
          : 'inline-flex items-center gap-1 rounded-md px-4 py-2 text-base font-medium text-ink/70 hover:bg-ink/5 hover:text-ink'}
      >
        {category.label}
        <span aria-hidden="true" className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={category.label}
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-ink/10 bg-bg py-1 shadow-lg"
        >
          {category.items.map((it) => {
            const itemActive = it.to === currentPath;
            return (
              <Link
                key={it.to}
                to={it.to}
                role="menuitem"
                title={it.description}
                className={itemActive
                  ? 'block px-4 py-2 bg-primary/30'
                  : 'block px-4 py-2 hover:bg-ink/5'}
              >
                <div className="text-sm font-medium text-ink">{it.label}</div>
                <div className="mt-0.5 text-xs text-ink/60">{it.description}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const location = useLocation();
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex max-w-6xl flex-nowrap items-center gap-x-2 px-8 py-3">
        <Link to="/" title="Back to home" className="mr-2 shrink-0 text-base font-semibold tracking-tight text-ink">
          pdfaster
        </Link>
        <nav aria-label="Main" className="flex flex-nowrap items-center gap-1">
          <NavLink
            to="/editor"
            title="Open the PDF editor"
            className={({ isActive }) =>
              isActive
                ? 'rounded-md bg-primary px-4 py-2 text-base font-medium text-ink'
                : 'rounded-md px-4 py-2 text-base font-medium text-ink/70 hover:bg-ink/5 hover:text-ink'
            }
          >
            Editor
          </NavLink>
          {categories.map((c) => (
            // ponytail: `key={currentPath}` resets the dropdown on
            // navigation — no set-state-in-effect, no stale "open"
            // after clicking a menu item. The cost is a re-mount on
            // every navigation; the component is tiny.
            <NavDropdown key={`${c.id}:${location.pathname}`} category={c} currentPath={location.pathname} />
          ))}
        </nav>
      </div>
    </header>
  );
}
