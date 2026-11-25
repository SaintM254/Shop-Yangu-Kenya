/**
 * PWA icons from the one square mark we already ship.
 *
 * `src/logo/apple-touch-icon.png` is a 180 × 180 PNG of the SYK bag on navy.
 * The install prompt wants 192, 512 and a 512 "maskable" — and there is no
 * SVG rasteriser available in this project (@resvg/resvg-js is a native
 * dependency and is deliberately not installed), so this script does the
 * rasterising itself:
 *
 *   1. decode the 180 px PNG (8-bit RGB + alpha, no interlace — the only
 *      shape the logo tool emits),
 *   2. upsample it to 3× the target with bilinear filtering,
 *   3. snap each pixel back to one of the mark's two flat colours, which
 *      removes the soft halo the upscale introduced,
 *   4. box-filter down to the target, which turns the hard snapped edge back
 *      into a proper anti-aliased one — geometry of a vector, sharpness of
 *      one too, at any size.
 *
 * The maskable variant gets its own pass: Android crops a maskable icon to a
 * circle of 80% of the width, so the bag is drawn at 62% and centred on a
 * full-bleed navy square. Without that, a launcher in a round mask would cut
 * the handle off.
 *
 * Run: node tools/make-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src/logo/apple-touch-icon.png');

/* ------------------------------------------------------------- PNG decode */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8;
  let w = 0, h = 0, depth = 0, colour = 0, interlace = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.slice(o + 4, o + 8).toString('latin1');
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    o += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (colour !== 6 && colour !== 2)) {
    throw new Error(`unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
  }

  const bpp = colour === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      out[d] = cur[s];
      out[d + 1] = cur[s + 1];
      out[d + 2] = cur[s + 2];
      out[d + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, data: out };
}

/* ------------------------------------------------------------- PNG encode */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- resampling */

/** Bilinear sample of `img` at fractional source coordinates. */
function sample(img, fx, fy) {
  const x0 = Math.max(0, Math.min(img.w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(img.h - 1, Math.floor(fy)));
  const x1 = Math.min(img.w - 1, x0 + 1);
  const y1 = Math.min(img.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x, y) => {
    const i = (y * img.w + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  };
  const a = at(x0, y0), b = at(x1, y0), c = at(x0, y1), d = at(x1, y1);
  return [0, 1, 2, 3].map((k) =>
    Math.round(
      (a[k] * (1 - tx) + b[k] * tx) * (1 - ty) + (c[k] * (1 - tx) + d[k] * tx) * ty
    )
  );
}

/** Box-filter downsample from a supersampled buffer. */
function downsample(img, size, factor) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * img.w + (x * factor + sx)) * 4;
          const al = img.data[i + 3] / 255;
          /* weight colour by alpha so transparent edges do not bleed dark */
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          b += img.data[i + 2] * al;
          a += img.data[i + 3];
        }
      }
      const n = factor * factor;
      const o = (y * size + x) * 4;
      const cov = a / n / 255;
      out[o] = cov ? Math.round(r / (cov * n)) : 0;
      out[o + 1] = cov ? Math.round(g / (cov * n)) : 0;
      out[o + 2] = cov ? Math.round(b / (cov * n)) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return { w: size, h: size, data: out };
}

/* --------------------------------------------------------------- the mark */

const source = decodePng(fs.readFileSync(src));

/** The mark's two colours: the navy field and the cream bag. */
function palette(img) {
  const counts = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 200) continue;
    const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k.split(',').map(Number));
}

const [field, ink] = palette(source);

/**
 * A crisp square icon of `size`, with the source drawn inside a box of
 * `content` × the square and centred — `content` 1 is full bleed.
 */
function buildIcon(size, content = 1) {
  const factor = 3;                       // supersample for the edges
  const big = size * factor;
  const inner = Math.round(big * content);
  const offset = Math.round((big - inner) / 2);

  /* 1 + 2: bilinear upsample the 180 px source into the inner box */
  const up = { w: big, h: big, data: Buffer.alloc(big * big * 4) };
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const o = (y * big + x) * 4;
      /* outside the content box: the navy field, full bleed */
      up.data[o] = field[0];
      up.data[o + 1] = field[1];
      up.data[o + 2] = field[2];
      up.data[o + 3] = 255;
      const dx = x - offset, dy = y - offset;
      if (dx < 0 || dy < 0 || dx >= inner || dy >= inner) continue;
      const p = sample(source, (dx + 0.5) * source.w / inner - 0.5, (dy + 0.5) * source.h / inner - 0.5);
      /* 3: snap to the palette — this is what removes the upscale's halo */
      const dField = Math.abs(p[0] - field[0]) + Math.abs(p[1] - field[1]) + Math.abs(p[2] - field[2]);
      const dInk = Math.abs(p[0] - ink[0]) + Math.abs(p[1] - ink[1]) + Math.abs(p[2] - ink[2]);
      const pick = dInk < dField ? ink : field;
      up.data[o] = pick[0];
      up.data[o + 1] = pick[1];
      up.data[o + 2] = pick[2];
      up.data[o + 3] = 255;
    }
  }
  /* 4: box filter back down */
  return downsample(up, size, factor);
}

const jobs = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  /* Android crops maskable icons to a circle: 62% keeps the handle inside */
  ['icon-maskable-512.png', 512, 0.62],
];

for (const [name, size, content] of jobs) {
  const out = path.join(root, 'src/logo', name);
  fs.writeFileSync(out, encodePng(size, size, buildIcon(size, content).data));
  console.log(`  ${name}  ${size}×${size}  ${(fs.statSync(out).size / 1024).toFixed(1)} kB`);
}

console.log(`  palette: field #${field.map((n) => n.toString(16).padStart(2, '0')).join('')}` +
  ` · ink #${ink.map((n) => n.toString(16).padStart(2, '0')).join('')}`);
