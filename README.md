# pdfaster

**Your PDF never leaves your browser.** Edit, annotate, merge, split, compress, convert — all in this tab. No account, no upload, no limits.

A pure client-side PDF editor + tool suite, built as a static SPA. Inspired by [PDFShelter](https://pdfshelter.com/), expanded with client-side-feasible picks from smallpdf's catalogue (Word/Excel/PPT, OCR, Redact, and all AI tools require a server, so they're out of scope).

## Run

```bash
npm install
npm run dev              # vite dev server
npm run build            # production build
npm run test:e2e         # playwright e2e (19 tests, all client-side)
npm run demo:coords      # pdf-points ↔ css-px round-trip self-check
```

## What's in the box

- **Editor** — 7 annotation tools (highlight, underline, strikethrough, rectangle, ellipse, free-draw, signature) with undo/redo, zoom, page nav, thumbnails, and AcroForm fill. All exports are vector-first (text stays searchable, forms stay fillable).
- **11 tool pages** — merge, split, delete-pages, reorder, rotate, crop, compress, watermark, page-numbers, JPG→PDF, PDF→JPG.
- **PWA** — installable, works offline.
- **Session restore** — IndexedDB saves your work-in-progress; an explicit prompt offers to restore on reload.
- **Strict CSP** — no remote calls, no analytics, no Google Fonts CDN. Self-hosted Blinker, self-hosted pdf.js worker.

## Stack

React 19 · Vite · TypeScript · [pdf.js](https://mozilla.github.io/pdf.js/) · [pdf-lib](https://pdf-lib.js.org/) · [zustand](https://github.com/pmndrs/zustand) · [zundo](https://github.com/charkour/zundo) · Tailwind v4 · [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) · Playwright.

## Architecture

See [docs/superpowers/specs/2026-06-19-pdfaster-design.md](docs/superpowers/specs/2026-06-19-pdfaster-design.md) for the design doc (architecture, export pipeline, storage strategy, threat model, honest ceilings).
