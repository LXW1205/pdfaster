import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';
import LandingPage from '../pages/LandingPage';
import NotFoundPage from '../pages/NotFoundPage';

// ponytail: standard createBrowserRouter (not the data API) — v7's
// data router adds loader/action plumbing we don't need yet. Switch
// to createBrowserRouter's data options only when we add route-level
// data fetching (phase 4+ editor saves to IndexedDB, phase 6 tools
// accept query params).
//
// The root route renders <Layout /> (which renders <Nav /> and
// <Outlet />). All concrete pages are children — they pick up the
// persistent nav for free. Route-level `lazy` is the v7 idiom for
// code-splitting a route's component on demand. The 5 tool pages
// each pull pdf-lib (merge, extract, delete-pages, jpg-to-pdf,
// compress) or pdf.js (pdf-to-jpg) — keeping them out of the main
// bundle is the whole point.
export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { path: '', Component: LandingPage },
      {
        path: 'editor',
        lazy: async () => {
          const m = await import('../pages/editor/EditorPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/merge',
        lazy: async () => {
          const m = await import('../pages/tools/MergePage');
          return { Component: m.default };
        },
      },
      // ponytail: phase 10 — Extract. Sibling to the removed Split:
      // Extract accepts non-contiguous page selections (single pages +
      // multiple ranges) via its range spec input. Split's single-
      // contiguous-range case is fully covered by typing "5-7" in
      // Extract's range field, so Split was removed in phase 14 as
      // a strict subset.
      {
        path: 'tools/extract',
        lazy: async () => {
          const m = await import('../pages/tools/ExtractPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/delete-pages',
        lazy: async () => {
          const m = await import('../pages/tools/DeletePagesPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/jpg-to-pdf',
        lazy: async () => {
          const m = await import('../pages/tools/JpgToPdfPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/pdf-to-jpg',
        lazy: async () => {
          const m = await import('../pages/tools/PdfToJpgPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/compress',
        lazy: async () => {
          const m = await import('../pages/tools/CompressPage');
          return { Component: m.default };
        },
      },
      // ponytail: phase 5d — five more single-PDF tool pages. Each
      // lazy-imports pdf-lib on first navigation; the 3page fixture's
      // pdf-lib cost is amortized across all of them via Vite's
      // chunk-level dedup. No pdf.js here (no rendering needed for
      // reorder / rotate / crop / watermark / page-numbers).
      {
        path: 'tools/reorder',
        lazy: async () => {
          const m = await import('../pages/tools/ReorderPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/rotate',
        lazy: async () => {
          const m = await import('../pages/tools/RotatePage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/crop',
        lazy: async () => {
          const m = await import('../pages/tools/CropPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/watermark',
        lazy: async () => {
          const m = await import('../pages/tools/WatermarkPage');
          return { Component: m.default };
        },
      },
      {
        path: 'tools/page-numbers',
        lazy: async () => {
          const m = await import('../pages/tools/PageNumbersPage');
          return { Component: m.default };
        },
      },
      {
        path: 'test/worker',
        lazy: async () => {
          const m = await import('../test-pages/WorkerCheckPage');
          return { Component: m.default };
        },
      },
      // ponytail: one component, two URLs. /test/inspect?file=<url> is
      // the export-roundtrip read path. Split into a dedicated
      // component when the inspect surface grows beyond "load a PDF,
      // dump its annotations + text" (phase 5+ adds font extraction,
      // image counts, etc.).
      {
        path: 'test/inspect',
        lazy: async () => {
          const m = await import('../test-pages/WorkerCheckPage');
          return { Component: m.default };
        },
      },
      // ponytail: catch-all 404. Replaces react-router-dom's
      // dev-only "Unexpected Application Error" UI when users hit
      // /tools/foo (unbuilt) or any other unbuilt route.
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
