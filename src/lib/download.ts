// ponytail: copy into a fresh ArrayBuffer so the Blob constructor
// accepts the Uint8Array under pdfjs-dist 6's typing. The setTimeout
// before revoke keeps Safari from cancelling the download.
//
// Upgrade path: when downloads grow past the simple a-tag click (e.g.
// the user wants progress for a 50 MB export), swap to a `<dialog>`
// with a "Download" link instead of a synthetic click. File System
// Access API is the right answer for "save to disk in a chosen
// location" but Safari support is still partial — YAGNI for v1.
export function downloadBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
