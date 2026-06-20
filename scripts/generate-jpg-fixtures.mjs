// e2e/fixtures/red.png and blue.png generators. 64×64 solid-color
// PNGs, ~150 bytes each. pdf-lib can't emit PNGs, so we hand-build
// the minimum-viable PNG container with zlib-deflated IDAT.
//
// ponytail: building PNGs from raw bytes is one Node script. Don't
// switch to a `canvas` / `sharp` dep — fixture size matters more
// than code clarity for a one-time e2e setup.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(r, g, b, size = 64) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR: width, height, bit depth, color type 2 (RGB), compression 0,
  // filter 0, interlace 0.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  // Raw image data: each row prefixed by a 0 filter byte, then RGB triples.
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0;
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.alloc(row.length * size);
  for (let y = 0; y < size; y++) row.copy(raw, y * row.length);
  const idatData = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../e2e/fixtures');
await mkdir(dir, { recursive: true });

const red = makePng(0xff, 0x33, 0x33);
await writeFile(resolve(dir, 'red.png'), red);
console.log(`wrote red.png (${red.length} bytes)`);

const blue = makePng(0x33, 0x66, 0xff);
await writeFile(resolve(dir, 'blue.png'), blue);
console.log(`wrote blue.png (${blue.length} bytes)`);
