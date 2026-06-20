import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/Container';
import { SessionStore, type SessionRecord } from '../lib/session-store';
import { fmtSize, fmtRelative } from '../lib/format';

// ponytail: a quiet supporting element on the landing page. The
// session store has at most one record in v1 (we overwrite on every
// save), so the list is short — but the cap of 5 and the "click
// → re-drop" flow are spec'd for a future multi-record upgrade.
// We don't store the PDF binary (privacy compromise) — see the
// session-store.ts header.
export default function LandingPage() {
  const [recent, setRecent] = useState<SessionRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    SessionStore.list().then((rs) => {
      if (!cancelled) setRecent(rs);
    }).catch(() => {
      // ponytail: silent fail. The "Recent" section is a
      // nice-to-have; IndexedDB errors in private mode just hide it.
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <Container className="flex flex-1 flex-col py-16">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Your PDF never leaves your browser.
        </h1>
        <p className="mt-4 text-base text-ink/70 sm:text-lg">
          Drop, edit, merge, split, convert. All in this tab.
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/editor"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-base font-semibold text-ink shadow-sm transition-colors hover:bg-secondary hover:text-bg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Open the editor
          </Link>
          <Link
            to="/tools/merge"
            className="inline-flex items-center justify-center rounded-md border border-ink/15 bg-bg px-5 py-3 text-base font-medium text-ink transition-colors hover:border-ink/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Tools
          </Link>
        </div>

        {recent.length > 0 && (
          <section
            data-testid="recent-section"
            aria-label="Recent files"
            className="mt-12 w-full max-w-md text-left"
          >
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink/60">Recent</h2>
            <ul className="mt-3 divide-y divide-ink/10 overflow-hidden rounded-md border border-ink/10">
              {recent.map((s) => (
                <li key={s.sessionId}>
                  <Link
                    to={`/editor?resume=${encodeURIComponent(s.fileName)}`}
                    data-testid="recent-item"
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-ink/5"
                  >
                    <span className="truncate text-ink">{s.fileName}</span>
                    <span className="shrink-0 text-ink/50 tabular-nums">
                      {fmtSize(s.fileSize)} · {fmtRelative(s.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-12 text-xs text-ink/50">
          No account. No upload. No limits.
        </p>
      </div>
    </Container>
  );
}
