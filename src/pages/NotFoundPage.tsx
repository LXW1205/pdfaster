// Catch-all for unmatched routes. Replaces react-router-dom's default
// dev-only "Unexpected Application Error" UI with a quiet page that
// names what the user tried to reach and offers a way back.
//
// Frontend-design note: explain what happened and how to recover. No
// apology, no stack trace, no debug noise.
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Not found
      </h1>
      <p className="mt-3 text-base text-ink/70">
        That page isn't part of pdfaster yet. Tools like merge, split, and convert land in a future update.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to="/"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-ink hover:bg-secondary"
        >
          Back to home
        </Link>
        <Link
          to="/editor"
          className="rounded-md border border-ink/30 px-4 py-2 text-sm font-medium text-ink/80 hover:bg-ink/5"
        >
          Open the editor
        </Link>
      </div>
    </main>
  );
}
