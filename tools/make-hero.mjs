/**
 * The hero photograph, from the original to the file the site ships.
 *
 * `Images/Hero Image.jpg` is the shop's own photograph at 746 kB. A phone
 * should not download that to see a band 210px tall, so this writes one
 * re-encoded copy — 1400px wide, which covers the hero column at 2x on a
 * laptop — and the build copies that copy into `dist/`.
 *
 *   node tools/make-hero.mjs
 *
 * Needs `sharp`, which is not a dependency of the site (the site has none).
 * Install it where the script can see it:
 *
 *   npm i --no-save sharp && node tools/make-hero.mjs
 *
 * If sharp is not there, the checked-in `src/hero.jpg` is still correct; this
 * only needs running again when the source photograph is replaced.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'Images', 'Hero Image.jpg');
const OUT = path.join(root, 'src', 'hero.jpg');

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('sharp is not installed — run `npm i --no-save sharp` first.');
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
if (!meta.width) {
  console.error('could not read the source photograph');
  process.exit(1);
}

/* 1400 is the hero column at 2x on a 700px layout; a bigger file would be
   bytes a phone pays for and never shows. */
const width = Math.min(1400, meta.width);
await sharp(SRC)
  .resize({ width })
  .jpeg({ quality: 78, mozjpeg: true, progressive: true })
  .toFile(OUT);

const out = await sharp(OUT).metadata();
console.log(
  `hero: ${out.width} × ${out.height}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB ` +
  `(from ${meta.width} × ${meta.height}, ${(fs.statSync(SRC).size / 1024).toFixed(0)} kB)`
);
