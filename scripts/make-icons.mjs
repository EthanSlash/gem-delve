import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    rgba.copy(raw, y * rowBytes + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLORS = {
  background: [13, 11, 22],
  table: [220, 200, 255],
  crownLeft: [160, 108, 240],
  crownRight: [180, 140, 246],
  dark: [109, 60, 204],
  flash: [160, 108, 240],
  highlight: [255, 255, 255],
};

const FACETS = [
  { tri: [[-0.52, -0.5], [0.52, -0.5], [0, -0.06]], color: 'table' },
  { tri: [[0, -0.06], [-0.52, -0.5], [-1, 0]], color: 'crownLeft' },
  { tri: [[0, -0.06], [0.52, -0.5], [1, 0]], color: 'crownRight' },
  { tri: [[0, -0.06], [1, 0], [-1, 0]], color: 'dark' },
  { tri: [[-1, 0], [0, 0], [0, 1]], color: 'dark' },
  { tri: [[0, 0], [1, 0], [0, 1]], color: 'dark' },
  { tri: [[-0.22, 0.52], [0.22, 0.52], [0, 0.95]], color: 'flash' },
  { tri: [[-0.4, -0.44], [-0.14, -0.44], [-0.02, -0.16]], color: 'highlight' },
];

function edgeSign(a, b, px, py) {
  return (px - a[0]) * (b[1] - a[1]) - (py - a[1]) * (b[0] - a[0]);
}

function pointInTri(px, py, tri) {
  const d1 = edgeSign(tri[0], tri[1], px, py);
  const d2 = edgeSign(tri[1], tri[2], px, py);
  const d3 = edgeSign(tri[2], tri[0], px, py);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

function renderIcon(size) {
  const cx = size / 2;
  const cy = size / 2;
  const R = Math.round(size * 0.38);
  const bg = COLORS.background;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = bg[0];
    rgba[i * 4 + 1] = bg[1];
    rgba[i * 4 + 2] = bg[2];
    rgba[i * 4 + 3] = 255;
  }

  for (let y = 0; y < size; y++) {
    const py = (y + 0.5 - cy) / R;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5 - cx) / R;
      if (px < -1.1 || px > 1.1 || py < -0.6 || py > 1.1) continue;
      let color = null;
      for (const facet of FACETS) {
        if (pointInTri(px, py, facet.tri)) {
          color = COLORS[facet.color];
        }
      }
      if (color) {
        const offset = (y * size + x) * 4;
        rgba[offset] = color[0];
        rgba[offset + 1] = color[1];
        rgba[offset + 2] = color[2];
      }
    }
  }
  return encodePng(size, rgba);
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(rootDir, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

const outputs = [
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-192.png', size: 192 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of outputs) {
  writeFileSync(join(iconsDir, file), renderIcon(size));
  console.log(`wrote public/icons/${file} (${size}x${size})`);
}
