// pdfaster MCP server — stdio JSON-RPC exposing the src/tools/* engine
// to a local coding agent. Inputs/outputs are absolute file paths; the
// tool functions themselves are reused untouched (Node 22 has the DOM
// File global, so bytes can be wrapped in `new File([bytes], name)`).
// Fully local: no network calls, nothing leaves the machine.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PDFDocument } from 'pdf-lib';

import { mergePdfs } from '../src/tools/merge';
import { rotateAllPages, type RotationAngle } from '../src/tools/rotate';
import { extractPages } from '../src/tools/extract';
import { deletePages } from '../src/tools/delete-pages';
import { reorderPages } from '../src/tools/reorder';
import { watermarkPdf } from '../src/tools/watermark';
import { addPageNumbers } from '../src/tools/page-numbers';
import { cropAllPages } from '../src/tools/crop';
import { compressPdf } from '../src/tools/compress';
import { jpgsToPdf } from '../src/tools/jpg-to-pdf';

// ---------- path / IO helpers ----------

function assertAbsolute(p: string, label: string): string {
  if (!path.isAbsolute(p)) {
    throw new Error(`${label} must be an ABSOLUTE file path, got: "${p}"`);
  }
  return p;
}

async function fileFromPath(p: string, type?: string): Promise<File> {
  const bytes = await fs.readFile(p);
  const name = path.basename(p);
  return new File([new Uint8Array(bytes)], name, type ? { type } : undefined);
}

/**
 * Write bytes to an absolute `out` path. Overwriting an existing file is
 * refused unless `out` is the same path as the (single) input — the bytes
 * are already read by then, so an in-place edit is safe.
 */
async function writeOut(out: string, bytes: Uint8Array, inputs: string[]): Promise<string> {
  assertAbsolute(out, 'out');
  try {
    await fs.access(out);
    if (!inputs.includes(out)) {
      throw new Error(
        `Refusing to overwrite existing file "${out}". Choose a new out path ` +
          `(or pass out equal to the input path for an in-place edit).`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Refusing')) throw e;
    // ENOENT — fresh path, fine.
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, bytes);
  return out;
}

function fileFromImagePath(p: string): Promise<File> {
  if (!/\.(jpe?g|png)$/i.test(p)) {
    throw new Error(`"${p}" is not a .jpg/.jpeg/.png file`);
  }
  return fileFromPath(p, /\.png$/i.test(p) ? 'image/png' : 'image/jpeg');
}

function text(result: string) {
  return { content: [{ type: 'text' as const, text: result }] };
}

// ---------- pdf_info ----------

async function pdfInfo(p: string) {
  const bytes = new Uint8Array(await fs.readFile(p));
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageSizes = doc.getPages().map((page) => {
    const { width, height } = page.getSize();
    return {
      widthPt: Math.round(width * 100) / 100,
      heightPt: Math.round(height * 100) / 100,
      rotation: page.getRotation().angle,
    };
  });
  let hasAcroForm = false;
  let formFields: string[] = [];
  try {
    const form = doc.getForm();
    formFields = form.getFields().map((f) => f.getName());
    hasAcroForm = true;
  } catch {
    // pdf-lib throws when the document carries no AcroForm — treat as "none".
  }
  return { pageCount: doc.getPageCount(), pageSizes, hasAcroForm, formFields, byteSize: bytes.byteLength };
}

// ---------- server ----------

const server = new McpServer({ name: 'pdfaster', version: '1.0.0' });

const AbsPath = z.string().describe('Absolute path (relative paths are rejected).');

server.registerTool(
  'pdf_info',
  {
    title: 'pdf_info',
    description:
      'Inspect a PDF before editing: page count, per-page size (pt) and rotation, AcroForm ' +
      'presence and form field names. Read-only — no output file. Run this first to plan edits.',
    inputSchema: { path: AbsPath },
  },
  async ({ path: p }) => {
    assertAbsolute(p, 'path');
    const info = await pdfInfo(p);
    return text(JSON.stringify(info, null, 2));
  },
);

// Every editing tool: read inputs → wrap in File → call the src/tools engine → persist `out`.
server.registerTool(
  'pdf_merge',
  {
    title: 'pdf_merge',
    description: 'Merge multiple PDFs, in the given order, into one PDF.',
    inputSchema: {
      paths: z.array(z.string()).describe('Absolute paths of the PDFs to merge, in array order.'),
      out: z.string().describe('Absolute path of the merged output PDF.'),
    },
  },
  async ({ paths, out }) => {
    const abs = paths.map((p) => assertAbsolute(p, 'paths member'));
    const files = await Promise.all(abs.map((p) => fileFromPath(p, 'application/pdf')));
    const bytes = await mergePdfs(files);
    await writeOut(out, bytes, abs);
    return text(`Merged ${abs.length} PDFs -> ${out}`);
  },
);

server.registerTool(
  'pdf_rotate',
  {
    title: 'pdf_rotate',
    description: 'Rotate every page of a PDF by a single angle (clockwise, cumulative with existing rotation).',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the PDF.'),
      angle: z
        .union([z.literal(90), z.literal(180), z.literal(270)])
        .describe('Rotation to apply to every page, degrees clockwise.'),
      out: z.string().describe('Absolute path of the rotated output PDF.'),
    },
  },
  async ({ path: p, angle, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await rotateAllPages(file, angle as RotationAngle);
    await writeOut(out, bytes, [p]);
    return text(`Rotated all pages by ${angle} degrees -> ${out}`);
  },
);

const Pages = z
  .array(z.number().int().min(0))
  .describe('0-based page indices (0 = first page; 1-based user page numbers minus 1).');

async function assertPagesInRange(p: string, pages: number[]) {
  let pageCount: number;
  try {
    const doc = await PDFDocument.load(await fs.readFile(p), { updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch {
    return; // malformed input — let the engine's own load surface the error
  }
  for (const i of pages) {
    if (i >= pageCount) {
      throw new Error(
        `Page index ${i} is out of range (document has ${pageCount} pages, 0-based). Run pdf_info first.`,
      );
    }
  }
}

server.registerTool(
  'pdf_extract_pages',
  {
    title: 'pdf_extract_pages',
    description:
      'Extract selected pages into a new PDF. Indices are 0-BASED (0 = first page). Duplicates ' +
      'are ignored; pages are always emitted in document order. Run pdf_info first to learn the page count.',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the source PDF.'),
      pages: Pages.describe('0-based indices of the pages to extract.'),
      out: z.string().describe('Absolute path of the extracted output PDF.'),
    },
  },
  async ({ path: p, pages, out }) => {
    assertAbsolute(p, 'path');
    await assertPagesInRange(p, pages);
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await extractPages(file, pages);
    await writeOut(out, bytes, [p]);
    return text(`Extracted ${pages.length} page(s) -> ${out}`);
  },
);

server.registerTool(
  'pdf_delete_pages',
  {
    title: 'pdf_delete_pages',
    description:
      'Delete pages from a PDF. `keep` lists the 0-BASED indices of the pages that SURVIVE ' +
      '(everything else is removed); the surviving pages are emitted in document order. ' +
      'E.g. to delete page 2 of 3, pass keep=[0, 2]. Run pdf_info first to learn the page count.',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the source PDF.'),
      keep: Pages.describe('0-based indices of the pages to KEEP.'),
      out: z.string().describe('Absolute path of the output PDF.'),
    },
  },
  async ({ path: p, keep, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await deletePages(file, keep);
    await writeOut(out, bytes, [p]);
    return text(`Kept page indices [${keep.join(', ')}] -> ${out}`);
  },
);

server.registerTool(
  'pdf_reorder',
  {
    title: 'pdf_reorder',
    description:
      'Reorder pages of a PDF. `order` is an array of 0-based source page indices in the desired ' +
      'final order (e.g. [2, 0, 1] puts the third page first). Run pdf_info first to learn the page count.',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the source PDF.'),
      order: Pages.describe('0-based indices forming the new page order.'),
      out: z.string().describe('Absolute path of the reordered output PDF.'),
    },
  },
  async ({ path: p, order, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await reorderPages(file, order);
    await writeOut(out, bytes, [p]);
    return text(`Reordered pages to [${order.join(', ')}] -> ${out}`);
  },
);

server.registerTool(
  'pdf_watermark',
  {
    title: 'pdf_watermark',
    description:
      'Stamp a text watermark on every page (Helvetica Bold; Latin-1/WinAnsi text only). ' +
      'position "diagonal" tilts the stamp 35 degrees. Sizes scale to the page.',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the PDF.'),
      text: z.string().describe('Watermark text (Latin-1 characters only).'),
      opacity: z.number().min(0).max(1).describe('Text opacity, 0..1 (e.g. 0.25).'),
      color: z.enum(['gray', 'red', 'blue', 'black']).describe('Watermark color.'),
      position: z.enum(['center', 'top', 'bottom', 'diagonal']).describe('Where the stamp lands on each page.'),
      out: z.string().describe('Absolute path of the watermarked output PDF.'),
    },
  },
  async ({ path: p, text: txt, opacity, color, position, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await watermarkPdf(file, { text: txt, opacity, color, position });
    await writeOut(out, bytes, [p]);
    return text(`Watermarked -> ${out}`);
  },
);

server.registerTool(
  'pdf_page_numbers',
  {
    title: 'pdf_page_numbers',
    description:
      'Burn page numbers into every page (12pt Helvetica, 24pt margin, drawn text — extractable).',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the PDF.'),
      position: z.enum(['bottom-center', 'bottom-right', 'top-right']).describe('Edge for the numbers.'),
      format: z
        .enum(['n', 'n-of-m', 'page-n-of-m'])
        .describe('Label style: "3", "3 / 10", or "Page 3 of 10".'),
      out: z.string().describe('Absolute path of the output PDF.'),
    },
  },
  async ({ path: p, position, format, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await addPageNumbers(file, { position, format });
    await writeOut(out, bytes, [p]);
    return text(`Page numbers added -> ${out}`);
  },
);

server.registerTool(
  'pdf_crop',
  {
    title: 'pdf_crop',
    description:
      'Crop a uniform margin (in PDF points, 1pt = 1/72 in) off all four sides of every page. ' +
      '0 is a no-op; a margin larger than half a page is an error.',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the PDF.'),
      marginPts: z.number().min(0).describe('Margin to remove on each side, points (e.g. 18).'),
      out: z.string().describe('Absolute path of the output PDF.'),
    },
  },
  async ({ path: p, marginPts, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const bytes = await cropAllPages(file, marginPts);
    await writeOut(out, bytes, [p]);
    return text(`Cropped ${marginPts}pt on each side -> ${out}`);
  },
);

server.registerTool(
  'pdf_compress',
  {
    title: 'pdf_compress',
    description:
      'Re-save a PDF with metadata stripped and object streams enabled. Honest compression: ' +
      'typically 1-10% smaller on text-heavy PDFs, ~0% on already-compressed ones (embedded ' +
      'images are NOT re-encoded). Returns before/after byte sizes.',
    inputSchema: {
      path: AbsPath.describe('Absolute path to the PDF.'),
      out: z.string().describe('Absolute path of the compressed output PDF.'),
    },
  },
  async ({ path: p, out }) => {
    assertAbsolute(p, 'path');
    const file = await fileFromPath(p, 'application/pdf');
    const { bytes, before, after } = await compressPdf(file);
    const written = await writeOut(out, bytes, [p]);
    return text(`Compressed -> ${written} (${before} -> ${after} bytes)`);
  },
);

server.registerTool(
  'pdf_jpg_to_pdf',
  {
    title: 'pdf_jpg_to_pdf',
    description:
      'Build a PDF out of image files (JPEG or PNG), one page per image at its native size ' +
      '(1pt = 1/72 in). Page order follows the array order.',
    inputSchema: {
      paths: z.array(z.string()).describe('Absolute paths to .jpg/.jpeg/.png images.'),
      out: z.string().describe('Absolute path of the output PDF.'),
    },
  },
  async ({ paths, out }) => {
    const abs = paths.map((p) => assertAbsolute(p, 'paths member'));
    const files = await Promise.all(abs.map(fileFromImagePath));
    const bytes = await jpgsToPdf(files);
    await writeOut(out, bytes, abs);
    return text(`Built PDF from ${abs.length} image(s) -> ${out}`);
  },
);

// ---------- start ----------

const transport = new StdioServerTransport();
await server.connect(transport);
