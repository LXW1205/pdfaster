import { NavLink, Link } from 'react-router-dom';

const items = [
  { to: '/editor', label: 'Editor' },
  { to: '/tools/merge', label: 'Merge' },
  { to: '/tools/split', label: 'Split' },
  { to: '/tools/delete-pages', label: 'Delete pages' },
  { to: '/tools/reorder', label: 'Reorder' },
  { to: '/tools/rotate', label: 'Rotate' },
  { to: '/tools/crop', label: 'Crop' },
  { to: '/tools/compress', label: 'Compress' },
  { to: '/tools/watermark', label: 'Watermark' },
  { to: '/tools/page-numbers', label: 'Page numbers' },
  { to: '/tools/jpg-to-pdf', label: 'JPG → PDF' },
  { to: '/tools/pdf-to-jpg', label: 'PDF → JPG' },
] as const;

// ponytail: NavLink is react-router-dom's built-in active-state helper.
// `flex-wrap` keeps the nav usable on narrow viewports without a
// hamburger (YAGNI in v1). `bg-bg/85 backdrop-blur` gives the modern
// translucent-header look using the spec's `--color-bg` token. Active
// state uses `--color-primary` so the user can see what page they're on
// at a glance.
//
// Upgrade path: when the nav grows past ~8 items, swap `flex-wrap` for
// a hamburger / drawer. When the brand wants a logo in place of the
// wordmark, swap `<Link to="/">` for an SVG + sr-only text.
export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link to="/" className="text-base font-semibold tracking-tight text-ink">
          pdfaster
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                isActive
                  ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-ink'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-ink/5 hover:text-ink'
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
