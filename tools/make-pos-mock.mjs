/**
 * The hero mock, from the artwork to the file the site ships.
 *
 * `Images/Mobile POS Receipt Mockup.png` is the source artwork: a phone at the
 * till with the receipt in the customer's hand, on a transparent background.
 * It is 1 MB and 1145 × 1374 with a wide transparent margin. A phone should
 * not download that to see a phone, so this trims the empty border and writes
 * one re-encoded copy — WebP with its alpha kept, so the mock sits on the
 * cream with no white plate behind it.
 *
 *   node tools/make-pos-mock.mjs
 *
 * Needs `sharp`, which is not a dependency of the site (the site has none).
 * Install it where the script can see it:
 *
 *   npm i --no-save sharp && node tools/make-pos-mock.mjs
 *
 * If sharp is not there, the checked-in `src/pos-mock.webp` is still correct;
 * this only needs running again when the artwork is replaced.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'Images', 'Mobile POS Receipt Mockup.png');
const OUT = path.join(root, 'src', 'pos-mock.webp');

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('sharp is not installed — run `npm i --no-save sharp` first.');
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
if (!meta.width) {
  console.error('could not read the source artwork');
  process.exit(1);
}

/* The artwork carries ~60px of empty margin on every side. Trimming it means
   the CSS can align the phone itself, not the box drawn around it. A 1/255
   threshold keeps the soft shadow at the foot of the receipt. */
const trimmed = await sharp(SRC).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });

/* 1065px wide is the mock at 2x the ~420px column it occupies on a laptop,
   plus headroom for the hover scale. Bigger would be bytes nobody sees. */
await sharp(trimmed.data)
  .webp({ quality: 88, alphaQuality: 90, effort: 6 })
  .toFile(OUT);

const out = await sharp(OUT).metadata();
console.log(
  `pos mock: ${out.width} × ${out.height}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB ` +
  `(from ${meta.width} × ${meta.height}, ${(fs.statSync(SRC).size / 1024).toFixed(0)} kB)`
);
