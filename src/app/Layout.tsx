import { Outlet } from 'react-router-dom';
import { Nav } from './Nav';

// ponytail: <Outlet /> is the only child of <Layout />. The nav is
// rendered above it, persistent across every route (including the
// test pages — the e2e specs still pass because the test page's
// canvas / status text is below the nav, not behind it). The flex
// column lets full-bleed pages (the editor) fill the remaining
// height with `flex-1` instead of subtracting a magic nav-height
// number.
export function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Nav />
      <Outlet />
    </div>
  );
}
