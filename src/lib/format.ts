// ponytail: small formatters shared by the landing page's "Recent"
// section. The byte → "1.2 MB" math and the relative time math are
// 5 lines each — extracting them to a module keeps LandingPage.tsx
// focused on JSX. Promote to a real i18n locale (replace the
// `fmtRelative` hard-coded "ago" with the locale's
// `Intl.RelativeTimeFormat` strings) when the i18n switcher lands.

// ponytail: `Intl.RelativeTimeFormat` is the spec's tool for "3 min
// ago" / "2 days ago". We pick the largest sensible unit so the
// output is "2 days ago" not "172800 seconds ago". The threshold
// ladder is hand-rolled — Intl's relative format doesn't have a
// "auto-pick the unit" mode.
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtRelative(ts: number, now: number = Date.now()): string {
  const diffMs = now - ts;
  const s = Math.round(diffMs / 1000);
  if (s < 60) return RTF.format(-s, 'second');
  const m = Math.round(s / 60);
  if (m < 60) return RTF.format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return RTF.format(-h, 'hour');
  const d = Math.round(h / 24);
  if (d < 30) return RTF.format(-d, 'day');
  const mo = Math.round(d / 30);
  if (mo < 12) return RTF.format(-mo, 'month');
  return RTF.format(-Math.round(d / 365), 'year');
}
