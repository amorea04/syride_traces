// Génère les icônes PWA (PNG) de `public/` sans dépendance : `node scripts/gen-icons.mjs`.
// Motif : trois barres ascendantes (histogramme) en « papier » sur fond « encre » (couleurs D13, pas de logo Syride).
// `icon.svg` est écrit à la main avec la même géométrie (repère 512 × 512).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const INK = [0x1f, 0x23, 0x58];
const PAPER = [0xf4, 0xf4, 0xf8];
// Barres (x, y haut, largeur) dans le repère 512 ; ligne de base y = 390.
const BARS = [
  [111, 280, 70],
  [221, 200, 70],
  [331, 120, 70],
];
const BASE = 390;

function crc32(buf) {
  let c;
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Couverture [0, 1] d'un point (repère 512) : 0 = hors forme, 1 = dans les barres. */
const inBars = (u, v) => BARS.some(([x, top, w]) => u >= x && u < x + w && v >= top && v < BASE);
/** Fond : carré à coins arrondis (rayon 96) si `rounded`, plein sinon (maskable). */
function inBackground(u, v, rounded) {
  if (!rounded) return true;
  const r = 96;
  const cx = Math.min(Math.max(u, r), 512 - r);
  const cy = Math.min(Math.max(v, r), 512 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

function render(size, { rounded }) {
  const SS = 4;
  return png(size, (x, y) => {
    let bg = 0;
    let bars = 0;
    for (let i = 0; i < SS; i++)
      for (let j = 0; j < SS; j++) {
        const u = ((x + (i + 0.5) / SS) / size) * 512;
        const v = ((y + (j + 0.5) / SS) / size) * 512;
        if (inBackground(u, v, rounded)) {
          bg++;
          if (inBars(u, v)) bars++;
        }
      }
    const n = SS * SS;
    if (bg === 0) return [0, 0, 0, 0];
    const t = bars / bg;
    const mix = (k) => Math.round(INK[k] * (1 - t) + PAPER[k] * t);
    return [mix(0), mix(1), mix(2), Math.round((255 * bg) / n)];
  });
}

writeFileSync(join(OUT, 'icon-192.png'), render(192, { rounded: true }));
writeFileSync(join(OUT, 'icon-512.png'), render(512, { rounded: true }));
writeFileSync(join(OUT, 'icon-maskable-512.png'), render(512, { rounded: false }));
writeFileSync(join(OUT, 'apple-touch-icon.png'), render(180, { rounded: false }));
console.log('Icônes écrites dans public/');
