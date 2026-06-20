# pdfaster — Design Spec

- **Date:** 2026-06-19 (v1 design) · 2026-06-20 (phase 7 — polish + remaining features) · 2026-06-20 (phase 8 — quality-of-life polish)
- **Status:** v1 shipped · phase 7 closed the polish + remaining-features phase · phase 8 ships the QoL polish
- **Reference:** https://pdfshelter.com/

## Goal

Pure client-side PDF editor + tool suite. PDFShelter parity (merge / split / JPG↔PDF / delete pages) plus an interactive annotation editor. Static SPA on Vercel. Privacy-first: no backend, no analytics on file contents, no Google Fonts CDN.

## Non-goals (v1)

- Real existing-text edit (pdf-lib cannot; architecturally deferred)
- OCR · real-time collab · cloud / accounts · multi-doc tabs · dark mode · HTML→PDF
- i18n beyond English (key table present; add a locale = drop in a JSON file)
- Real redaction (spec defers; would need a content-stream rewrite)

## Stack

React 19 · Vite · TypeScript · `pdfjs-dist@6.0.227` (pinned, lazy) · `pdf-lib` (lazy) · `@pdf-lib/fontkit` (non-Latin form values) · Tailwind v4 + `@theme` · `@fontsource/blinker` variable · zustand + zundo + immer · `uuid` v4 · IndexedDB (raw API, no `idb` dep) · Vitest + Playwright · Vite static · `vite-plugin-pwa` (autoUpdate, no custom SW code) · Vercel static.

## Routes

- `/` — landing + tool picker
- `/editor` — the editor
- `/tools/:slug` — merge, split, delete-pages, jpg-to-pdf, pdf-to-jpg, compress, reorder, rotate, crop, watermark, page-numbers

## Architecture

Single Vite SPA. Editor: three-pane (left thumbnails · center page + overlay · right properties). Top toolbar + undo/redo + save/export. Bottom page nav. Mobile responsive (touch, pinch, 44 px hit targets).

### Render

pdf.js → HiDPI canvas. DOM overlay on top. All annotation geometry in **PDF user space** (points, origin bottom-left). One `lib/coords.ts` module is the single point of truth for any `(x * scale * dpr)` math; it ships with a `demo()` self-check (round-trip on fuzzed points).

### HiDPI

`canvas.width/height = floor(viewport.size * dpr)`, CSS size = `viewport.size`, `transform: [dpr, 0, 0, dpr, 0, 0]` passed to `page.render()`. *ponytail: one helper, used by viewer + export.*

### State (two stores)

- `useEditorStore` — document, annotations, **form fields**. zundo `partialize` drops non-historical fields. History capped at 100 entries. Free-draw strokes batched into one entry on `pointerup`. `formFields` is excluded from zundo (a per-keystroke undo history on form fills is not in v1).
- `useUIStore` — active tool, zoom, panel sizes, rotation. **Never** history-tracked.

### Registries (data, not code)

- `AnnotationRegistry.register({ type, render, hitTest, toPdf, fromPdf, icon, defaultProps })`
- `ToolRegistry.register({ id, slug, component, schema, icon })`

## PDF libraries

- **pdf.js** — render only. Module-top:
  ```ts
  GlobalWorkerOptions.workerSrc =
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  ```
  Day-1 Playwright e2e asserts the worker URL resolves.
- **pdf-lib** — single source of truth for **write**: form discovery, form fill, export. Standard 14 fonts (WinAnsi); `@pdf-lib/fontkit` for non-Latin. Bottom-left origin, Y-up.

## Export pipeline (vector-first — the architect's pivot)

Default is interactive, searchable, accessible, fillable PDF. Raster-on-export is **not** the default.

1. **Load.** `PDFDocument.load(bytes)`. For encrypted: `pdfjsLib.getDocument({ data, password }).promise` → `pdf.getData()` → plaintext bytes → pdf-lib. *ponytail: `pdf.getData()` is the only end-to-end decrypt path; add per-doc password store when "remember password" ships.*
2. **Apply form fills** to the loaded PDF's AcroForm via pdf-lib (`setText` / `check` / `select`).
3. **Append native PDF annotation objects** to each page's existing `/Annots` array (NEVER replace — the form widget annotations must be preserved). One annotation per registered type:

| Type | PDF |
|---|---|
| highlight / underline / strikethrough | `/Highlight` / `/Underline` / `/StrikeOut` + `/QuadPoints` |
| sticky note | `/Text` (with popup) |
| text box | `/FreeText` (fontkit if non-Latin) |
| free-draw | `/Ink` (vector strokes) |
| rectangle / ellipse / line / arrow | `/Square` / `/Circle` / `/Line` (line: `/LE` for arrowheads) |
| signature (drawn) | `/Stamp` annotation dict (no `/AP` in v1 — see Honesty callout) |
| form field (existing) | AcroForm value write (preserved by in-place strategy) |
| form field (new) | `form.createTextField(name).addToPage(page, { x, y, w, h, font, … })` (also checkbox, radio, dropdown) |
| page rotation (user-applied) | `page.setRotation(degrees(rotation))` |

4. **Save.** `pdfDoc.save()` → `Uint8Array` → blob → download.

**Why in-place, not copyPages.** pdf-lib's `copyPages` does NOT copy the AcroForm dict (which lives in the catalog). The earlier copyPages-based approach stripped the form on every export; the in-place approach mutates the loaded PDFDocument in place, so the form widget annotations stay in `/Annots` and the catalog `/AcroForm` is preserved. The original bytes in the store are unchanged, so re-exports are idempotent.

`form.flatten()` only behind an explicit user "Flatten form" action with a confirm dialog. Page-rasterization is not exposed in v1. *ponytail: default is interactive; flatten is opt-in.*

## Persistence (IndexedDB session restore)

- IndexedDB stores: `{ sessionId, fileName, fileSize, pageCount, annotations, formFields, createdAt, updatedAt }`. **No PDF binary.**
- On mount, `SessionStore.latest()` returns the most-recent record. If present, the editor shows an **explicit restore prompt** (NEVER silent auto-restore — threat model is a shared computer). The user clicks "Restore" and the drop zone shows `Drop {fileName} to resume`.
- Auto-save: a 1500ms-debounced subscription to `annotations + formFields` writes the latest record to IndexedDB. Auto-save is a no-op until a document is loaded.
- "Close" button in the toolbar clears the session.
- Raw `indexedDB` API (no `idb` / `dexie` dep). One object store keyed by `sessionId` with an index on `updatedAt` for the "latest" query. *ponytail: 80 lines is acceptable for one store; swap to `idb` if a second store lands (e.g. recent-files list, per-document annotations).*

## PWA / CSP / privacy

- `vite-plugin-pwa`. `registerType: 'autoUpdate'`. Workbox precaches JS/CSS/fonts (no pdf.js worker — pdf.js's own `?url` import handles it via the browser HTTP cache). `cleanupOutdatedCaches: true`. Single 512×512 maskable SVG icon (`public/icon.svg`). *ponytail: ship one icon; vite-plugin-pwa handles the rest.*
- CSP (unchanged from phase 1):
  ```
  default-src 'self';
  worker-src 'self';
  img-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline';
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  ```
- Permissions-Policy: `camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- No Google Fonts CDN. No analytics. No `unsafe-eval`. No `blob:` workers.
- `THIRD_PARTY_LICENSES.md` (pdf.js Apache-2.0 · pdf-lib MIT · fontkit MIT · Blinker SIL OFL 1.1).
- Adversarial PDF hardening: pdf.js modern build, warn on `/OpenAction` JS, surface embedded files in a panel (never auto-execute).

## v1 features (shipped)

- Highlight · underline · strikethrough · free-draw · rectangle · ellipse · signature (drawn, `/Stamp` annotation dict, visual `/AP` deferred) · form fill (AcroForm existing) · page rotation (intrinsic + user-applied) · undo/redo · zoom 25–400 % · pan · thumbnails · mobile responsive (touch, pinch, 44 px hit targets).
- PWA installability (`vite-plugin-pwa`, `manifest.webmanifest`, service worker).
- IndexedDB session restore (explicit prompt; never silent auto-restore).
- a11y pass: focus rings (`:focus-visible` brand-color), reduced-motion respected, every `<button>` labeled, every `<input type="file">` labeled, editor canvas `role="img" aria-label="PDF page {n} of {N}"`, restore prompt `role="dialog" aria-modal="true"` with `aria-labelledby`/`aria-describedby`, nav `<header>` and `<nav aria-label="Main">` labeled.

## Phase 8 polish (shipped 2026-06-20)

- **Bigger UI.** `:root { font-size: 17px }` is the single global change; every Tailwind `text-*` utility is rem-based, so the bump cascades to every text element. Button padding bumped to `px-3 py-2` (44 px hit target). Nav links + container + drop zones bumped to `px-4 py-2` / `px-8 py-14` / `px-8` for the spec's "comfortable" UI floor. The toolbar's text-ink/70 mute levels stay. *ponytail: a `Compact` UI is one class-toggle away — `body.compact { font-size: 15px }` — and YAGNI today.*
- **Thumbnail virtualization.** `EditorThumbnails` renders only the page indices within ±5 of the visible window. Pages outside the window are thin placeholder divs (just the page number) that keep the scrollbar accurate. A 200-page PDF costs the same as a 5-page PDF at any moment. The placeholder's height is an estimate (PDF point size of the thumbnail + label); for a more accurate spacer, render a hidden first thumb to measure.
- **Auto-zoom-to-fit.** A `Fit` button in the toolbar (between zoom-out and Reset) and the `0` shortcut. The fit math: `min(available.w / pageWidth, available.h / pageHeight, 4)` with a 32 px visual padding, capped at 4× to match the manual zoom ceiling. Reset pan on fit so the user's hand-eye expectation holds. `lib/coords.ts#fitZoom` is the single point of truth.
- **Tool keyboard shortcuts.** V/H/U/T/R/E/F/S map to the registered tool IDs. `[` / `]` for page nav, `0` for zoom-fit. `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`) for undo/redo. Every shortcut skips when an `<input>`, `<textarea>`, or `[contenteditable]` is focused — the difference between a useful shortcut and a frustrating one.
- **Space-drag pan.** Hold `Space` and drag the canvas, or middle-mouse-drag, to pan. The transform lives on a wrapper div (`translate(x, y)`); the page-canvas and overlays are not moved individually. Resets when the document changes (via `LoadedEditor`'s `key={bytes.byteLength}` remount). Cursor reflects the gate state (`grab` when Space is held).
- **`?` cheatsheet.** A discoverability overlay (`<div role="dialog" aria-modal="true">`) listing every keyboard shortcut. Triggered by `?` (shift + `/` on US layouts) and a `?` button in the toolbar. Closes on `Esc` or a click on the backplate. The `SHORTCUTS` array in `src/editor/cheatsheet-data.ts` is the single source of truth — the toolbar's keydown map and the cheatsheet's display rows are both derived from it.

## Tool suite (v1 — 11 tool pages)

The suite follows PDFShelter's lead, expanded with client-side-feasible picks from smallpdf.com's catalogue. PDF↔Word/Excel/PPT, OCR, Redact, Compare, and all AI features are out of scope (require server-side processing — incompatible with the "no-cloud" positioning).

- **Merge:** `copyPages` from each source into a new `PDFDocument`. (Phase 5b.)
- **Split:** page-range UI → `copyPages` selected indices into a new `PDFDocument`. (Phase 5c.)
- **Delete pages:** `removePage` from highest index downward. *ponytail: avoids index-shift bugs.* (Phase 5c.)
- **JPG → PDF:** `embedJpg` per image, one page per image. (Phase 5c.)
- **PDF → JPG:** pdf.js render each page → `canvas.toBlob('image/jpeg')`; show a grid of previews with per-page download. (Phase 5c.)
- **Compress PDF:** strip metadata + re-save with object streams. Image re-encoding deferred (real compression is hard in pure-client; honest about the ceiling). (Phase 5c.)
- **Reorder pages:** `copyPages` in user-chosen order. Index-based swap; HTML5 drag-and-drop deferred. (Phase 5d.)
- **Rotate:** `page.setRotation(degrees(n))` on every page; intrinsic-rotation display deferred. (Phase 5d.)
- **Crop:** `setMediaBox` shrinks by a uniform margin in PDF points; per-edge / per-page crop deferred. (Phase 5d.)
- **Watermark:** `drawText` (Helvetica Bold) on every page; text-only, single size formula. Image / per-page / non-Latin watermarks deferred. (Phase 5d.)
- **Page numbers:** `drawText` (Helvetica) on every page; three position × three format combos. "Skip page 1" and "start at N" deferred. (Phase 5d.)

## Error handling

- **Encrypted:** password via `pdfjsLib.onPassword` → `pdf.getData()` → pdf-lib. Friendly fail on decrypt error.
- **Corrupt:** catch from `getDocument`, friendly message, log to local IndexedDB (never network).
- **OOM / large PDFs:** warn at 50 rendered pages, suggest closing tabs.
- **WinAnsi failure:** catch pdf-lib throw, offer font switch.

## Testing

- **Vitest** — `lib/coords.ts` round-trips, registry CRUD, form write/read, pdf-lib wrappers. *ponytail: only the gnarly logic.*
- **Playwright e2e (19 tests, all green)** — load sample PDF → draw highlight + free-draw → fill a form field → draw a signature → export → re-open exported in pdf.js → assert annotations present + form value persisted. Plus: worker URL assertion, session restore, a11y smoke (landing/editor/merge page), and the round-trip checks for each tool page.
- **Visual** — snapshot 4 zoom levels on a known page. *ponytail: 4 levels not exhaustive; expand when regressions appear.*
- **Demo** — `lib/coords.ts` ships a runnable `demo()` self-check (asserts round-trip on fuzzed points). *ponytail: one runnable check behind the gnarliest module, no test framework for it.*

## File layout

```
src/
  app/           shell, routing, PWA registration, CSP meta
  editor/
    canvas/      pdf.js + HiDPI wrapper
    overlay/     DOM layer per page
    tools/       one file per tool
    panels/      toolbar, properties, thumbnails, page-nav
    state/       zustand stores (useEditorStore, useUIStore, form)
    export/      pdf-lib pipeline (in-place, not copyPages)
  tools/         merge, split, delete-pages, jpg-to-pdf, pdf-to-jpg, compress, reorder, rotate, crop, watermark, page-numbers
  lib/
    coords.ts          one coordinate module + demo()
    pdf-render.ts      pdf.js wrapper
    pdf-write.ts       pdf-lib wrapper
    registry.ts        annotation + tool registry
    session-store.ts   raw indexedDB adapter (no idb dep)
    id.ts              uuid v4
  styles/        tailwind v4 @theme tokens
  i18n/          en.json (key table)
  assets/        self-hosted
```

## Design tokens (Tailwind v4 `@theme`)

```
--color-bg:        #F5F5F5
--color-primary:   #48CFCB
--color-secondary: #229799
--color-ink:       #424242
--font-sans:       "Blinker", "Inter", system-ui, sans-serif
```

## Day-1 build order

1. Vite scaffold + Tailwind v4 + Blinker via `@fontsource/blinker` + CSP meta.
2. `lib/coords.ts` with `demo()`.
3. pdf.js worker setup + Playwright e2e asserting worker URL.
4. Empty editor: load sample PDF, HiDPI render, no annotations.
5. Annotation registry + highlight tool end-to-end (save → export → reopen in pdf.js).
6. Remaining annotation tools + form fill + signature + rotation.
7. Tool suite pages.
8. PWA, IndexedDB session restore, a11y pass. ✅ **shipped 2026-06-20**

*ponytail: ship the three riskiest primitives (coords, worker, render) before any feature work. The rest is mechanical.*

## Honesty callout (phase 7)

**Signature `/Stamp` appearance stream is deferred.** The signature annotation's `/Stamp` dict is real and survives the export (preserved by the in-place `/Annots` append, counted by `getAnnotations`), but the visual rendering of the drawn PNG in the exported PDF requires building a `/AP` appearance stream that embeds the PNG as a Form XObject. That's a non-trivial hand-roll (50+ lines of `embedPng` → `PDFImage` → Form XObject wiring). The e2e signature test asserts annotation count + text extractability, not visual rendering. The in-editor visual is an HTML `<img>` overlay; the canonical record is the `pngDataUrl` on the annotation.

Upgrade path: build the appearance stream in `exportPdf.ts` using pdf-lib's `embedPng`, then patch the `/Stamp` annotation dict's `/AP` to a Form XObject that draws the image into the annotation's `/Rect`.

## Deferred (design-compatible, not built)

- Real existing-text edit. Annotation overlay positioning stays flexible enough to host a future `contentEditable`.
- OCR (Tesseract.wasm).
- Real-time collab. UUIDs make annotations CRDT-friendly for a future Yjs integration.
- Signature `/AP` appearance stream (see Honesty callout above) — the only meaningful deferral left in the editor's annotation pipeline.
- Flatten form action.
- Unlock (password — needs an encrypted PDF fixture pdf-lib can't produce).
- Compact UI toggle (`:root` is hard-coded to 17px; a `body.compact` class is a one-day add when a user asks).
- Pan re-anchor on zoom change (the pan offset is reset on fit-zoom but not on manual zoom-in; if a user reports a "jump on zoom" we'll add the re-anchor).
- Per-page thumbnail height measurement (placeholders use an estimated row height; for a 1000-page doc with mixed aspect ratios the scrollbar will be off by a few percent).

## Open questions for implementation planning

- **pdfjs-dist version pinning:** `6.0.227`. Bump deliberately, with a release-notes read.
- **Encryption UX:** `pdf.getData()` once and proceed; do not keep the password around in v1.
- **Annotation ID format:** UUID v4 (CRDT-friendly).
- **i18n:** keys only, no runtime locale switcher in v1. Browser language → table lookup.
- **PDF output version:** pdf-lib default 1.4 is fine for our use cases; expose override later if legal/archival users need 1.7.
