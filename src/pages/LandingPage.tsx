import { Link } from 'react-router-dom';
import { Container } from '../components/Container';

export default function LandingPage() {
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

        <p className="mt-12 text-xs text-ink/50">
          No account. No upload. No limits.
        </p>
      </div>
    </Container>
  );
}
