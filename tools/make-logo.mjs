/**
 * Regenerates every logo asset in src/logo/ from the artwork in Images/Icon.svg.
 *
 *   node tools/make-logo.mjs
 *
 * The artwork is one 2000 × 2000 page: a shopping bag with SYK on it (the
 * mark), then the wordmark. The site only ever uses the mark — the wordmark is
 * 900 px wide in a header that is 40 px tall, so it is kept for print and for
 * the social card, and the name is set in Public Sans as text.
 *
 * The mark is pulled out here rather than by hand so that when the artwork is
 * corrected — it was, once — one command puts the fix everywhere: the header,
 * the rail, the favicon, the app icon, the PDFs.
 *
 * Needs nothing but Node. The PNGs are written with @resvg/resvg-js, which is
 * a dev-only tool: `npm i --no-save @resvg/resvg-js` first, or skip the PNGs
 * and only the SVGs are refreshed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = 'Images/Icon.svg';

/* ---- matrices ---- */

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

function matrix(s) {
  const n = s.replace(/[a-z]+\(|\)/gi, '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (/^matrix/.test(s)) return n;
  if (/^translate/.test(s)) return [1, 0, 0, 1, n[0], n[1] || 0];
  if (/^scale/.test(s)) return [n[0], 0, 0, n[1] === undefined ? n[0] : n[1], 0, 0];
  throw new Error('unsupported transform: ' + s);
}

/* ---- the path, flattened onto the page ---- */

function flatten(d, M) {
  const ap = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const n = () => parseFloat(tokens[i++]);
  const subs = [];
  let cur = null;
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        let x = n();
        let y = n();
        if (rel) { x += cx; y += cy; }
        cx = sx = x;
        cy = sy = y;
        cur = { start: ap(x, y), segs: [] };
        subs.push(cur);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        let x = n();
        let y = n();
        if (rel) { x += cx; y += cy; }
        cx = x;
        cy = y;
        cur.segs.push({ t: 'L', p: ap(x, y) });
        break;
      }
      case 'C': {
        let x1 = n();
        let y1 = n();
        let x2 = n();
        let y2 = n();
        let x = n();
        let y = n();
        if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
        cur.segs.push({ t: 'C', c1: ap(x1, y1), c2: ap(x2, y2), p: ap(x, y) });
        cx = x;
        cy = y;
        break;
      }
      case 'Z':
        cx = sx;
        cy = sy;
        break;
      default:
        throw new Error('unsupported command: ' + cmd);
    }
  }
  return subs;
}

function bounds(subs) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = ([x, y]) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (const s of subs) {
    add(s.start);
    let prev = s.start;
    for (const g of s.segs) {
      add(g.p);
      if (g.t === 'C') {
        for (const ax of [0, 1]) {
          const P = [prev[ax], g.c1[ax], g.c2[ax], g.p[ax]];
          const A = -P[0] + 3 * P[1] - 3 * P[2] + P[3];
          const B = 2 * (P[0] - 2 * P[1] + P[2]);
          const C = P[1] - P[0];
          const roots = [];
          if (Math.abs(A) < 1e-12) {
            if (Math.abs(B) > 1e-12) roots.push(-C / B);
          } else {
            const disc = B * B - 4 * A * C;
            if (disc >= 0) {
              const sq = Math.sqrt(disc);
              roots.push((-B + sq) / (2 * A), (-B - sq) / (2 * A));
            }
          }
          for (const t of roots) {
            if (t <= 0 || t >= 1) continue;
            const m = 1 - t;
            const v = m * m * m * P[0] + 3 * m * m * t * P[1] + 3 * m * t * t * P[2] + t * t * t * P[3];
            if (ax === 0) {
              x0 = Math.min(x0, v);
              x1 = Math.max(x1, v);
            } else {
              y0 = Math.min(y0, v);
              y1 = Math.max(y1, v);
            }
          }
        }
      }
      prev = g.p;
    }
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function toPath(subs, box) {
  const r = (v) => Math.round(v * 100) / 100;
  let d = '';
  for (const s of subs) {
    d += 'M' + r(s.start[0] - box.x0) + ' ' + r(s.start[1] - box.y0);
    for (const g of s.segs) {
      d += g.t === 'L'
        ? 'L' + r(g.p[0] - box.x0) + ' ' + r(g.p[1] - box.y0)
        : 'C' + r(g.c1[0] - box.x0) + ' ' + r(g.c1[1] - box.y0) + ' ' +
          r(g.c2[0] - box.x0) + ' ' + r(g.c2[1] - box.y0) + ' ' +
          r(g.p[0] - box.x0) + ' ' + r(g.p[1] - box.y0);
    }
    d += 'Z';
  }
  return d;
}

/* ---- 1. the mark ---- */

const svg = read(SRC);
const raw = /<path d="([^"]*)"/.exec(svg)[1];
const chain = [...svg.matchAll(/<g[^>]*transform="([^"]*)"/g)].map((m) => m[1]).slice(0, 3);
const M = chain.map(matrix).reduceRight((acc, m) => mul(m, acc));
const subs = flatten(raw, M);
const box = bounds(subs);
const d = toPath(subs, box);
const W = Math.round(box.w);
const H = Math.round(box.h);

const wrap = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Shop Yangu Kenya">` +
  `<path fill="${fill}" d="${d}"/></svg>\n`;

fs.writeFileSync(path.join(root, 'src/logo/mark.svg'), wrap('currentColor'));
fs.writeFileSync(path.join(root, 'src/logo/mark-syk.svg'), wrap('#287094'));
fs.writeFileSync(path.join(root, 'src/logo/mark-cream.svg'), wrap('#FFF8E1'));
fs.writeFileSync(path.join(root, 'src/logo/mark-white.svg'), wrap('#FFFFFF'));

/* The browser tab wears the mark alone — no plate, no tile: a tab strip is
   already a surface. It is white by default, as asked; and because a white
   mark vanishes on a light tab strip, the file carries one media query that
   turns it to the shop's blue in a light browser. Same artwork, no
   background either way, visible on both. */
fs.writeFileSync(
  path.join(root, 'src/logo/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 ${W + 80} ${H + 80}">` +
    `<style>path{fill:#fff}@media (prefers-color-scheme:light){path{fill:#287094}}</style>` +
    `<path fill="#FFFFFF" d="${d}"/></svg>\n`
);
console.log(`mark: ${W} × ${H}, ${(d.length / 1024).toFixed(1)} kB of path`);

/* ---- 2. the PNGs, when the rasteriser is around ---- */

let Resvg = null;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.log('  @resvg/resvg-js not installed — SVGs refreshed, PNGs left alone');
}

if (Resvg) {
  const render = (markup, width) =>
    new Resvg(markup, { fitTo: { mode: 'width', value: width } }).render().asPng();

  /* The home-screen icon is the one place a plate is allowed: iOS puts the
     artwork straight onto the wallpaper, and a white bag would vanish on a
     light one. Navy, the brand's dark, with the mark in cream. */
  fs.writeFileSync(
    path.join(root, 'src/logo/apple-touch-icon.png'),
    render(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${W + 120} ${H + 120}">` +
        `<rect x="-60" y="-60" width="${W + 120}" height="${H + 120}" fill="#023246"/>` +
        `<path fill="#FFF8E1" d="${d}"/></svg>`,
      180
    )
  );

  /* The social card: the mark, the name, the line under it, the price. */
  const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#023246"/>
  <g transform="translate(84,150) scale(0.38)"><path fill="#FFF8E1" d="${d}"/></g>
  <text x="340" y="300" font-family="Helvetica, Arial, sans-serif" font-size="70" font-weight="bold" fill="#FFF8E1">Shop Yangu Kenya</text>
  <text x="340" y="364" font-family="Helvetica, Arial, sans-serif" font-size="29" fill="#9DC6D8">Sales, receipts and stock in one place</text>
  <text x="340" y="468" font-family="Helvetica, Arial, sans-serif" font-size="25" fill="#E7DDB5">Mombasa Branch  ·  Ksh 1,500 a month</text>
</svg>`;
  fs.writeFileSync(path.join(root, 'src/logo/og.png'), render(og, 1200));
  console.log('  apple-touch-icon.png, og.png written');
}
