// ponytail: vector-first export. We modify the source PDF in place
// (form fills, annotations appended to /Annots) and save it. The
// original bytes in the store are unchanged, so re-exports are
// idempotent — each export starts from a fresh `PDFDocument.load`
// of the original bytes. The earlier copyPages-based approach lost
// the AcroForm: copyPages copies the page + /Annots but not the
// catalog's /AcroForm dict, and replacing /Annots stripped the
// form widget annotations. The in-place path preserves everything:
// the form widget stays in /Annots, the catalog /AcroForm stays
// in place, the form's filled values come along, and our new
// annotations are appended.
//
// Form fill: the form values in `useEditorStore.formFields` are
// applied to the loaded PDF's form before the annotation loop.
// `setText` regenerates the field's appearance stream so the
// recipient reader shows the filled value. We use `try/throw`
// per-field so a session-restored field whose name doesn't exist
// in the current PDF is silently skipped (the alternative is a
// thrown Promise rejection that aborts the export — not worth it
// for a stale field name).
//
// Signature stamps: the toPdf in register.ts returns a /Stamp
// annotation dict WITHOUT /AP. The visual rendering of the drawn
// PNG in the exported PDF is DEFERRED to phase 8 (see the
// register.ts comment). For v1 the stamp's /Rect is the only
// visual record in the exported file; the e2e signature test
// asserts the annotation dict is present + text is extractable,
// not that the signature image renders.
import { PDFName, PDFArray, PDFRef } from 'pdf-lib';
import { useEditorStore } from '../state/useEditorStore';
import { AnnotationRegistry } from '../annotations/registry';

export async function exportPdf(): Promise<Uint8Array> {
  const { bytes, annotations, formFields } = useEditorStore.getState();
  if (!bytes) throw new Error('No document loaded');

  // ponytail: dynamic import keeps `pdf-lib` out of the EditorPage
  // chunk — it's loaded on first Export click. Verify the build
  // output (dist/assets/) shows a separate pdf-lib chunk.
  const { PDFDocument } = await import('pdf-lib');

  const doc = await PDFDocument.load(bytes);

  // Apply form values to the loaded PDF's form. The field's
  // appearance stream is regenerated on save.
  if (formFields.length > 0) {
    const form = doc.getForm();
    for (const f of formFields) {
      try {
        if (f.type === 'text') {
          form.getTextField(f.name).setText(f.value);
        } else if (f.type === 'checkbox') {
          const cb = form.getCheckBox(f.name);
          if (f.value === 'true') cb.check();
          else cb.uncheck();
        } else if (f.type === 'dropdown') {
          form.getDropdown(f.name).select(f.value);
        } else if (f.type === 'radio') {
          if (f.value) form.getRadioGroup(f.name).select(f.value);
        }
      } catch {
        // ponytail: silent skip on unknown field name. The
        // session-restore flow re-uses field names from a previous
        // document; if the new PDF doesn't have that field, we'd
        // rather export the rest of the form correctly than abort.
        // Promote to a per-field warning toast when the user
        // reports confusion about "missing" form values.
      }
    }
  }

  const context = doc.context;
  const pages = doc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const annots = annotations.filter((a) => a.pageIndex === i);
    if (annots.length === 0) continue;
    const page = pages[i]!;

    // ponytail: registry lookup replaces a 50-line if/switch chain.
    // Unknown types are silently skipped (defensive — phase 6 ships
    // all six types, but a later phase might add a 7th and an old
    // session saved an unknown one).
    const newAnnots = annots
      .map((a) => AnnotationRegistry.get(a.type))
      .filter((meta): meta is NonNullable<typeof meta> => meta !== undefined)
      .map((meta, idx) => meta.toPdf(context, doc, page, annots[idx]!));

    // ponytail: APPEND to /Annots, never replace. The source page
    // may already carry annotations (form widgets, links, popups);
    // replacing the array would strip them. The in-place strategy
    // relies on this — the form widget stays so the AcroForm
    // round-trips, and our new annotations join it.
    const annotsName = PDFName.of('Annots');
    const existing = page.node.get(annotsName);
    let arr: PDFArray;
    if (existing instanceof PDFArray) {
      arr = existing;
    } else if (existing instanceof PDFRef) {
      const looked = context.lookup(existing);
      arr = looked instanceof PDFArray ? looked : context.obj([]);
    } else {
      arr = context.obj([]);
    }
    for (const a of newAnnots) arr.push(a);
    page.node.set(annotsName, arr);
  }

  return doc.save();
}
