/**
 * Shop Yangu Kenya — static site build.
 *
 * Zero dependencies on purpose: GitHub Actions runs `node build.js` with nothing
 * to install, so the Pages deploy cannot break on a registry outage or a lockfile
 * drift. Everything the site needs is in this repository.
 *
 * Inputs:  src/content.json, src/styles.css, src/app/*, src/logo/*,
 *          Images/Icon.svg, shop-yangu-kenya.md, src/fonts/*
 * Outputs: dist/index.html, dist/login/index.html, dist/spec/index.html,
 *          dist/<route>/index.html for every screen in the app,
 *          dist/app/app.css, dist/app/app.js, dist/fonts/*, dist/logo.svg,
 *          dist/favicon.svg, dist/apple-touch-icon.png, dist/og.png,
 *          dist/.nojekyll, dist/404.html
 *
 * Every address is a folder. No page links to a .html file, and the build
 * fails if one does.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(root, 'dist');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const content = JSON.parse(read('src/content.json'));
const css = read('src/styles.css');

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** DD/MM/YY — the format the product uses, so the site writes dates the same way. */
const dmy = (d) =>
  [d.getDate(), d.getMonth() + 1].map((n) => String(n).padStart(2, '0')).join('/') +
  '/' +
  String(d.getFullYear()).slice(-2);

/** Ksh 12,345 — the product's own money format, used everywhere on this page. */
const kes = (n) => 'Ksh ' + Number(n).toLocaleString('en-KE');

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

/* lucide-style line icons, 1.75 stroke — the product's only icon language. */
const ICONS = {
  wallet:
    '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h13.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5H5a2 2 0 0 1-2-2V6"/><path d="M16 12h.01"/>',
  phone:
    '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  box:
    '<path d="M3.5 8.2 12 3.5l8.5 4.7v7.6L12 20.5l-8.5-4.7z"/><path d="M3.5 8.2 12 12.9l8.5-4.7"/><path d="M12 12.9v7.6"/>',
  users:
    '<path d="M15.5 20v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.6A3.6 3.6 0 0 0 3 18.2V20"/><circle cx="9.2" cy="7.4" r="3.4"/><path d="M21 20v-1.8a3.6 3.6 0 0 0-2.7-3.5"/><path d="M15.4 4.2a3.4 3.4 0 0 1 0 6.6"/>',
  upload:
    '<path d="M21 15v3.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5V15"/><path d="M16.5 8.5 12 4 7.5 8.5"/><path d="M12 4v11"/>',
  shield:
    '<path d="M12 21s7-3.2 7-9V5.6L12 3 5 5.6V12c0 5.8 7 9 7 9z"/><path d="m9 12 2 2 4-4"/>',
  chart:
    '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/>',
  receipt:
    '<path d="M5 3h14v18l-3.5-2-3.5 2-3.5-2L5 21z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  arrow: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"/>',
  book:
    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19"/>',
  rocket:
    '<path d="M13.5 4.5c3 3 4.5 6.5 3 10l-3 3-4-4 3-3c.5-1.5 1-4 1-6z"/><path d="M9.5 13.5 5 18l1 1 4.5-4.5"/><circle cx="15" cy="9" r="1.2"/>',
  smartphone:
    '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  eye:
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2"/><path d="M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4.4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2 22 22"/>',
  lock:
    '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  mail:
    '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
};

const icon = (name, cls = 'ic') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"` +
  ` fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"` +
  ` stroke-linejoin="round">${ICONS[name] || ICONS.check}</svg>`;

const sparkline = (() => {
  const pts = [
    [0, 46],
    [26, 40],
    [52, 44],
    [78, 30],
    [104, 34],
    [130, 22],
    [156, 26],
    [182, 12],
    [208, 16],
    [234, 6],
  ];
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return `<svg class="spark" viewBox="0 0 234 56" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#287094" stop-opacity=".28"/>
        <stop offset="100%" stop-color="#287094" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${d} L234,56 L0,56 Z" fill="url(#sparkFill)"/>
      <path d="${d}" fill="none" stroke="#287094" stroke-width="2.25" stroke-linecap="round"/>
    </svg>`;
})();

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1B4A63"/>
  <path d="M16 40V22h5l7 10 7-10h5v18h-4V28l-8 11-8-11v12z" fill="#FFF8E1"/>
  <circle cx="46" cy="38" r="4" fill="#287094"/>
</svg>`;

/* ------------------------------------------------------------------ */
/* markdown → html (the subset shop-yangu-kenya.md actually uses)      */
/* ------------------------------------------------------------------ */

function inline(raw) {
  const codes = [];
  let s = raw.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const url = fixLink(href);
    const ext = /^https?:/.test(url) ? ' rel="noopener"' : '';
    return `<a href="${url}"${ext}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[+i])}</code>`);
  return s;
}

/** Repo-relative links become published page links, never 404s. */
function fixLink(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const base = href.split('#')[0];
  const hash = href.includes('#') ? '#' + href.split('#')[1] : '';
  if (/shop-yangu-kenya\.html$/.test(base)) return 'prototype.html' + hash;
  if (/shop-yangu-kenya\.md$/.test(base)) return 'spec.html' + hash;
  if (/\.md$/.test(base)) return base.replace(/\.md$/, '.html') + hash;
  return href;
}

const isTableSep = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');

function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  const headings = [];
  let i = 0;

  const startsBlock = (l) =>
    /^\s*$/.test(l) ||
    /^```/.test(l) ||
    /^#{1,4}\s/.test(l) ||
    /^\s*>/.test(l) ||
    /^\s*\|/.test(l) ||
    /^\s*[-*]\s/.test(l) ||
    /^\s*\d+\.\s/.test(l) ||
    /^\s*---+\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(
        `<div class="codeblock${lang === 'sql' ? ' codeblock--sql' : ''}">` +
          (lang ? `<span class="codeblock__lang">${escapeHtml(lang)}</span>` : '') +
          `<pre><code>${escapeHtml(buf.join('\n'))}</code></pre></div>`
      );
      continue;
    }

    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s*/, '');
      const id = slug(text);
      if (level === 1) {
        out.push(`<h1 id="${id}">${inline(text)}</h1>`);
      } else {
        headings.push({ level, id, text: text.replace(/[`*]/g, '') });
        out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      }
      i++;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).filter((r) => !isTableSep(r)).map(cells);
      out.push(
        '<div class="tablewrap"><table><thead><tr>' +
          head.map((h) => `<th>${inline(h)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body
            .map(
              (r) =>
                '<tr>' +
                r
                  .map((c) => {
                    if (/^(yes|no)$/i.test(c)) {
                      const yes = /^yes$/i.test(c);
                      return `<td><span class="tick ${yes ? 'tick--yes' : 'tick--no'}">${icon('check')}${c}</span></td>`;
                    }
                    return `<td>${inline(c)}</td>`;
                  })
                  .join('') +
                '</tr>'
            )
            .join('') +
          '</tbody></table></div>'
      );
      continue;
    }

    if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s/.test(lines[i]) || /^\s*\d+\.\s/.test(lines[i]))) {
        let item = lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
        i++;
        // continuation lines, indented
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.)\s/.test(lines[i])) {
          item += ' ' + lines[i].trim();
          i++;
        }
        items.push(item);
      }
      const tag = ordered ? 'ol' : 'ul';
      const anyTask = items.some((t) => /^\[[ x]\]\s/.test(t));
      out.push(
        `<${tag}${anyTask ? ' class="tasklist"' : ''}>` +
          items
            .map((t) => {
              const task = t.match(/^\[([ x])\]\s+(.*)$/);
              if (task) {
                return `<li class="task"><span class="task__box${task[1] === 'x' ? ' task__box--done' : ''}" aria-hidden="true"></span><span>${inline(task[2])}</span></li>`;
              }
              return `<li>${inline(t)}</li>`;
            })
            .join('') +
          `</${tag}>`
      );
      continue;
    }

    const buf = [];
    while (i < lines.length && !startsBlock(lines[i])) buf.push(lines[i++]);
    if (!buf.length) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  return { html: out.join('\n'), headings };
}

/* ------------------------------------------------------------------ */
/* shared chrome                                                       */
/* ------------------------------------------------------------------ */

/* Every address on the published site is a folder — /login/, /dashboard/ —
   never a .html file. GitHub Pages answers the folder with its index.html. */
const CANON = 'https://saintm254.github.io/Shop-Yangu-Kenya';

/* Pages serves this site from a sub-folder (/Shop-Yangu-Kenya/), so a URL
   that starts with "/" would leave it. Every link is relative to the page's
   own folder instead, which works at a domain root, under a sub-folder, and
   from disk. `depth` is how many folders deep the page sits. */
/* How far a page sits from the site root. /login/ is one folder down;
   /auth/link/ and /admin/link/ are two, and every relative URL in their heads
   has to know it. */
const DEPTHS = { 'link': 2 };
const depth = (page) => (page === 'index' || page === '404' ? 0 : DEPTHS[page] || 1);
const rel = (page, path) => '../'.repeat(depth(page)) + path;

/* The 404 page is served at whatever address was mistyped, so a relative link
   in it would resolve against that wrong folder. It carries a <base> pointing
   at the site root — the one place an absolute path is the right answer. */
const SITE_PATH = new URL(CANON).pathname.replace(/\/$/, '');

/* The 404 page is written from the site root rather than relatively: Pages
   serves it at whatever address was mistyped, and it must still find the CSS.
   This is the one page allowed to carry a root-absolute URL. */
const siteUrl = (p) => SITE_PATH + '/' + p;

function head({ title, description, page, styles }) {
  const fix = (p) => (page === '404' ? siteUrl(p) : rel(page, p));
  const stylesheets = styles || [fix('styles.css')];
  return `<!doctype html>
<html lang="en-KE">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#1B4A63" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="icon" href="${fix('favicon.svg')}" type="image/svg+xml" />
<link rel="canonical" href="${CANON}/${page === 'index' || page === '404' ? '' : page + '/'}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<link rel="apple-touch-icon" href="${fix('apple-touch-icon.png')}" />
${stylesheets.map((h) => `<link rel="stylesheet" href="${h}" />`).join('\n')}
</head>`;
}

/* The mark from Images/Icon.svg, recoloured to the palette and inlined once
   per page, so the site, the login card and the app's rail all wear the same
   logo. A CSS background image would be a second request for 2 kB. */
function brandMark(cls) {
  const d = /\sd="([^"]+)"/.exec(read('src/logo/mark-syk.svg'))[1];
  return `<span class="${cls}" aria-hidden="true">` +
    `<svg viewBox="0 0 636 722" fill="currentColor"><path d="${d}"/></svg></span>`;
}

/* The same mark, inline and unlabelled, for the pale watermark that closes
   the advert. Decorative only, so it carries no accessible name. */
function brandMarkInline() {
  const d = /\sd="([^"]+)"/.exec(read('src/logo/mark-syk.svg'))[1];
  return `<svg viewBox="0 0 636 722" fill="currentColor" focusable="false"><path d="${d}"/></svg>`;
}

function siteHeader(current) {
  /* Section anchors live on the home page; from any other page they need it first. */
  const here = (href) => {
    if (current === '404') return href.startsWith('#') ? siteUrl('') + href : siteUrl(href.replace(/^\.\//, ''));
    return href.startsWith('#') && current !== 'index' ? rel(current, '') + href : href;
  };
  const nav = [
    ['#what', 'What it does'],
    ['#start', 'Price'],
  ];
  const isNav = (href) => href === current;
  return `<header class="hdr">
  <div class="wrap hdr__in">
    <a class="brand" href="${current === '404' ? siteUrl('') : current === 'index' ? './' : '../'}" aria-label="${escapeHtml(content.brand.name)} — home">
      ${brandMark('brand__mark')}
      <span class="brand__text">
        <span class="brand__name">${escapeHtml(content.brand.name)}</span>
        <span class="brand__sub">${escapeHtml(content.brand.tagline)}</span>
      </span>
    </a>
    <nav class="hdr__nav" aria-label="Sections">
      ${nav
        .map(
          ([href, label]) =>
            `<a href="${here(href)}"${isNav(href) ? ' aria-current="page"' : ''}>${label}</a>`
        )
        .join('\n      ')}
    </nav>
    <a class="btn btn--primary btn--sm hdr__cta" href="${current === '404' ? siteUrl('login/') : rel(current, 'login/')}">
      <span class="cta-full">Sign up / Log in</span><span class="cta-short">Log in</span>${icon('arrow', 'ic ic--sm')}
    </a>
  </div>
</header>`;
}

function siteFooter(current) {
  const here = (href) => {
    if (current === '404') return href.startsWith('#') ? siteUrl('') + href : siteUrl(href.replace(/^\.\//, ''));
    return href.startsWith('#') && current !== 'index' ? rel(current, '') + href : href;
  };
  return `<footer class="ftr">
  <div class="wrap ftr__in">
    <div class="ftr__brand">
      ${brandMark('brand__mark brand__mark--light')}
      <div>
        <p class="ftr__name">${escapeHtml(content.brand.name)}</p>
        <p class="ftr__sub">${escapeHtml(content.brand.tagline)} · ${escapeHtml(content.brand.branch)}</p>
      </div>
    </div>
    <div class="ftr__cols">
      <div>
        <p class="ftr__h">The system</p>
        <a href="${here('#what')}">What it does</a>
        <a href="${here('#start')}">Price and sign-up</a>
        <a href="${current === '404' ? siteUrl('login/') : rel(current, 'login/')}">Sign up / Log in</a>
      </div>
      <div>
        <p class="ftr__h">The price</p>
        <p class="ftr__price num">${kes(content.plan.price_kes)} <span>/ ${escapeHtml(content.plan.period)}</span></p>
        <p class="ftr__meta">Free for ${content.plan.trial_days} days</p>
      </div>
      <div>
        <p class="ftr__h">Talk to us</p>
        <p class="ftr__meta">${escapeHtml(content.brand.phone)}</p>
        <p class="ftr__meta">${escapeHtml(content.brand.branch)}</p>
      </div>
    </div>
  </div>
  <div class="wrap ftr__base">
    <p>${escapeHtml(content.brand.name)} · ${escapeHtml(content.brand.branch)} · ${dmy(new Date())}</p>
    <p>${kes(content.plan.price_kes)} / ${escapeHtml(content.plan.period)} · free for ${content.plan.trial_days} days</p>
  </div>
</footer>`;
}

function document({ title, description, page, body, bodyClass = '', styles }) {
  return `${head({ title, description, page, styles })}
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${siteHeader(page)}
${body}
${siteFooter(page)}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* index.html                                                          */
/* ------------------------------------------------------------------ */

/* The hero: the headline on the left, the phone at the till on the right.
   The mock is the argument — the sale on the phone and the receipt in the
   customer's hand — so nothing is drawn on top of it. It carries its own
   transparency, so it stands on the cream with no plate or frame behind it:
   a border would make it a picture on a poster instead of the machine the
   shopkeeper holds. It tilts and lifts as the page scrolls and settles under
   the pointer; both are in styles.css and both are off for anyone who asked
   the system for less motion. */
const hero = `
<section class="hero">
  <div class="wrap hero__in">
    <div class="hero__copy">
      <h1 class="hero__title">${escapeHtml(content.hero.title)}</h1>
      <p class="hero__lede">${escapeHtml(content.hero.lede)}</p>
      <div class="hero__cta">
        <a class="btn btn--primary" href="${content.hero.primary_cta.href}">${escapeHtml(content.hero.primary_cta.label)}${icon('arrow')}</a>
        <a class="btn btn--ghost" href="${content.hero.secondary_cta.href}">${escapeHtml(content.hero.secondary_cta.label)}</a>
      </div>
    </div>
    <div class="hero__mock">
      <div class="hero__mockglow" aria-hidden="true"></div>
      <img class="hero__mockimg" src="pos-mock.webp" width="1065" height="1234" fetchpriority="high" decoding="async"
        alt="A phone at the till showing the sale, with the customer's printed receipt coming out of it: items, subtotal, tax and the total, with a barcode and receipt number." />
    </div>
  </div>
</section>
<script>
/* The mock settles as the page moves: it straightens and lifts a little as
   the hero scrolls out from under the header, and leans toward the pointer
   when the mouse is over it. Both are one transform, driven by two custom
   properties, so they cannot fight each other. The loop stops the moment the
   value has arrived — nothing runs while the page sits still — and the whole
   script bows out if the reader asked for less motion, or has no JavaScript
   at all: the CSS lays it out correctly either way. */
(function () {
  var mock = document.querySelector('.hero__mock');
  if (!mock || !window.matchMedia) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var target = 0, shown = 0, tilt = 0, running = false;

  function paint() {
    mock.style.setProperty('--settle', shown.toFixed(4));
    mock.style.setProperty('--tilt', tilt.toFixed(2) + 'deg');
  }

  function frame() {
    var moving = Math.abs(target - shown) > 0.002;
    shown = moving ? shown + (target - shown) * 0.16 : target;
    paint();
    if (moving) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      mock.classList.remove('is-moving');
    }
  }

  function start() {
    if (running) return;
    running = true;
    /* mid-flight the frame loop owns the value, so the CSS transition must
       stand aside; when it stops, the class goes and CSS takes over again */
    mock.classList.add('is-moving');
    requestAnimationFrame(frame);
  }

  function onScroll() {
    var r = mock.getBoundingClientRect();
    var vh = window.innerHeight || 1;
    /* 0 while the hero is in view, 1 once it has scrolled past the header */
    target = Math.min(1, Math.max(0, -r.top / (r.height * 0.85 + vh * 0.1)));
    start();
  }

  mock.addEventListener('pointermove', function (ev) {
    if (ev.pointerType !== 'mouse') return;
    var r = mock.getBoundingClientRect();
    tilt = Math.max(-4, Math.min(4, ((ev.clientX - r.left) / r.width - 0.5) * 8));
    start();
  });
  mock.addEventListener('pointerleave', function () {
    tilt = 0;
    start();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
</script>`;

/* What it does. The whole block sits on the deep cerulean, so it reads as the
   middle of the page rather than another cream band; the six promises are
   cream cards on it — a surface, not a frame, with no rule of their own. The
   icons are the product's line glyphs, unchanged: the words do the selling. */
const features = `
<section class="sec sec--services" id="what">
  <div class="wrap">
    <header class="sec__head">
      <h2 class="sec__title sec__title--lg">Everything your shop does,<br />in one place.</h2>
      <p class="sec__lede">Sell, get paid, keep your stock right and see how the day went, without a book or a second person to check the M-Pesa messages.</p>
    </header>
    <div class="features">
      ${content.features
        .map(
          (f) => `<article class="feature">
        <span class="feature__icon" aria-hidden="true">${icon(f.icon)}</span>
        <h3 class="feature__title">${escapeHtml(f.title)}</h3>
        <p class="feature__body">${escapeHtml(f.body)}</p>
      </article>`
        )
        .join('\n      ')}
    </div>
  </div>
</section>`;

/* The close of the advert: one card, split by a rule — what it costs on the
   left, one way in on the right — and the shop's own mark, large and pale,
   exactly where the page stops. It is the last thing on the page, so the
   watermark is set at the end of the section, not floating over the footer. */
const signup = `
<section class="sec sec--close" id="start">
  <div class="wrap">
    <div class="close">
      <div class="close__plan">
        <p class="close__kicker">The plan</p>
        <p class="close__price num">${kes(content.plan.price_kes)}<span>/${escapeHtml(content.plan.period)}</span></p>
        <p class="close__trial">Free for ${content.plan.trial_days} days. No card needed to start.</p>
        <ul class="close__list">
          ${content.plan.includes.map((i) => `<li>${escapeHtml(i)}</li>`).join('\n          ')}
        </ul>
      </div>
      <div class="close__cta">
        <h2 class="close__title">${escapeHtml(content.plan.card_title)}</h2>
        <a class="btn btn--primary btn--sm" href="${content.plan.card_cta.href}">${escapeHtml(content.plan.card_cta.label)}</a>
      </div>
    </div>
  </div>
  <div class="close__mark" aria-hidden="true">${brandMarkInline()}</div>
</section>`;

const indexBody = `
<main id="main">
  ${hero}
  ${features}
  ${signup}
</main>`;

/* ------------------------------------------------------------------ */
/* spec.html                                                           */
/* ------------------------------------------------------------------ */

function specPage() {
  const md = read('shop-yangu-kenya.md')
    .replace(/docs\/shop-yangu-kenya\.html/g, 'prototype.html')
    .replace(/docs\/shop-yangu-kenya\.md/g, 'spec.html');
  const { html, headings } = renderMarkdown(md);
  const toc = headings
    .filter((h) => h.level === 2)
    .map((h) => `<a href="#${h.id}">${escapeHtml(h.text)}</a>`)
    .join('\n      ');

  const body = `<main id="main" class="docwrap">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="../">Home</a><span aria-hidden="true">/</span><span>Build spec</span>
    </nav>
    <div class="doc">
      <aside class="doc__toc" aria-label="On this page">
        <p class="doc__toc-h">Contents</p>
        ${toc}
        <a class="doc__back" href="../login/">${icon('arrow', 'ic ic--sm')} Open the shop</a>
      </aside>
      <article class="doc__body prose">
        ${html}
      </article>
    </div>
  </div>
</main>`;

  return document({
    title: `Build spec — ${content.brand.name}`,
    description:
      'The full build prompt for Shop Yangu Kenya: the single shop login, screens, data model, money rules, import rules and the definition of done.',
    page: 'spec',
    body,
    bodyClass: 'page-doc',
  });
}

/* ------------------------------------------------------------------ */
/* the app — /dashboard, /till, /stock … one shell, one page per route  */
/* ------------------------------------------------------------------ */

/* The screens moved out of `shop-yangu-kenya.html` and into src/app/: a
   shell, a stylesheet and one script per job. build.js inlines them into one
   page — no bundler, no network cost per screen — and writes that page into a
   folder per route, so every address is a real web address without .html. */

const APP_ROUTES = {
  dashboard: 'Dashboard',
  till: 'Point of sale',
  stock: 'Stock',
  purchases: 'Purchases',
  sales: 'Sales',
  customers: 'Customers',
  import: 'Import records',
  reports: 'Reports',
  etims: 'KRA eTIMS',
  settings: 'Settings',
  audit: 'Audit log',
};

const APP_SCRIPTS = [
  'lib.js',
  'data.js',
  'ui.js',
  'dashboard.js',
  'pos.js',
  'stock.js',
  'people.js',
  'reports.js',
  'import.js',
  'backend.js',
  'excel.js',
  'pdf.js',
  'exports.js',
  'shell.js',
  'pwa.js',
  'boot.js',
];

function appScript() {
  return APP_SCRIPTS.map((f) => `/* ---------- src/app/${f} */\n` + read('src/app/' + f)).join('\n') + '\n';
}

function appPage(route) {
  const markD = /\sd="([^"]+)"/.exec(read('src/logo/mark-syk.svg'))[1];
  const icons = read('src/app/icons.svg').trim().replace(
    /(<symbol id="i-logo"[^>]*><path d=")[^"]*/,
    `$1${markD}`
  );
  const shell = read('src/app/shell.html').trim();
  const title = (APP_ROUTES[route] || 'Dashboard') + ' — ' + content.brand.name;

  /* Where the API lives. Empty for same-origin (development, and behind the
     Pages proxy); set API_URL at build time when the app is published from
     GitHub Pages and the API is on another host. */
  const apiBase = process.env.API_URL || '';

  return `<!doctype html>
<html lang="en-KE" data-shell="app">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#1B4A63" />
<link rel="manifest" href="../manifest.json" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Shop Yangu" />
<meta name="mobile-web-app-capable" content="yes" />
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex" />
<meta name="description" content="Shop Yangu Kenya — the shop's own screens: sell, take payment, check stock and print the receipt." />
<link rel="icon" href="../favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="../apple-touch-icon.png" />
<link rel="stylesheet" href="../styles.css" />
<link rel="stylesheet" href="../app/app.css" />
</head>
<body class="page-app">
${icons}
${shell}
<script>window.SYK_API = ${JSON.stringify(apiBase)};</script>
<script src="../app/app.js" defer></script>
</body>
</html>
`;
}

/* One file per route: /dashboard/index.html and so on. The folder is what
   makes the address clean. */
function writeRoute(route) {
  fs.mkdirSync(path.join(dist, route), { recursive: true });
  fs.writeFileSync(path.join(dist, route, 'index.html'), appPage(route));
  pages.add(route + '/index.html');
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* login.html — the door                                               */
/*                                                                    */
/* One email field. No password, no second screen between entering the */
/* code and standing at the till. Sign-up asks for three things and   */
/* emails a code; sign-in asks for one and emails a code. Both finish  */
/* on the same "check your email" step, both accept a link instead of  */
/* a code, and both end in one redirect.                              */
/*                                                                    */
/* The page has to work when the API is on another host (GitHub Pages */
/* serving the app, the API elsewhere) and when it is on the same one */
/* (the API serving the built site in development). AUTH.base decides: */
/* empty for same-origin, an absolute URL otherwise.                  */
/* ------------------------------------------------------------------ */

function loginPage() {
  const markD = /\sd="([^"]+)"/.exec(read('src/logo/mark-syk.svg'))[1];
  /* The app's own icon, the one the home screen gets. This is the page that
     installs the app, so it is the one page that should show it. */
  const appIcon = `<span class="authicon" aria-hidden="true">` +
    `<svg viewBox="0 0 512 512"><path fill="#1B4A63" d="M0 0h512v512H0z"/>` +
    `<path fill="#FFF8E1" d="${markD}" transform="translate(102 79) scale(.485)"/></svg></span>`;

  const body = `<main id="main" class="auth">
  <div class="authcard">
    <header class="authcard__head">
      ${appIcon}
      <h1 class="authcard__shop">${escapeHtml(content.brand.name)}</h1>
    </header>

    <div class="authtabs" role="tablist" aria-label="Log in or sign up">
      <button class="authtab" id="tabLogin" type="button" role="tab" aria-selected="true"
              aria-controls="panelLogin" tabindex="0">Log in</button>
      <button class="authtab" id="tabSignup" type="button" role="tab" aria-selected="false"
              aria-controls="panelSignup" tabindex="-1">Sign up</button>
    </div>

    <!-- step 1: who you are --------------------------------------------- -->
    <form class="authtabpanel authform" id="loginForm" role="tabpanel" aria-labelledby="tabLogin" novalidate>
      <div class="field-group">
        <label class="label" for="email">Email address</label>
        <div class="inputwrap">
          ${icon('mail', 'ic ic--sm')}
          <input class="field" id="email" name="email" type="email" inputmode="email"
                 autocomplete="username" autocapitalize="none" spellcheck="false"
                 placeholder="you@yourshop.co.ke" required />
        </div>
      </div>

      <p class="autherror" id="loginError" role="alert" hidden></p>

      <button class="btn btn--primary btn--lg btn--block" id="loginBtn" type="submit">
        Email me a sign-in code${icon('arrow', 'ic ic--sm')}
      </button>

      <p class="authfine">No password to remember. We send a six-digit code, and a
        link you can tap instead if the code is a bother.</p>
    </form>

    <!-- step 1: a new shop ---------------------------------------------- -->
    <form class="authtabpanel authform" id="signupForm" role="tabpanel" aria-labelledby="tabSignup" hidden novalidate>
      <div class="field-group">
        <label class="label" for="suShop">Shop name</label>
        <div class="inputwrap">
          ${icon('store', 'ic ic--sm')}
          <input class="field" id="suShop" name="shop" type="text" autocomplete="organization"
                 placeholder="Wanjiku's Duka" required />
        </div>
      </div>

      <div class="field-group">
        <label class="label" for="suName">Your name</label>
        <div class="inputwrap">
          ${icon('user-round', 'ic ic--sm')}
          <input class="field" id="suName" name="name" type="text" autocomplete="name"
                 placeholder="Wanjiku Kamau" required />
        </div>
      </div>

      <div class="field-group">
        <label class="label" for="suEmail">Email address</label>
        <div class="inputwrap">
          ${icon('mail', 'ic ic--sm')}
          <input class="field" id="suEmail" name="email" type="email" inputmode="email"
                 autocomplete="email" autocapitalize="none" spellcheck="false"
                 placeholder="you@yourshop.co.ke" required />
        </div>
      </div>

      <p class="autherror" id="signupError" role="alert" hidden></p>

      <button class="btn btn--primary btn--lg btn--block" id="signupBtn" type="submit">
        Open my shop${icon('arrow', 'ic ic--sm')}
      </button>
      <p class="authfine">One login for the whole shop, as you asked. The shop name
        prints on every receipt.</p>
    </form>

    <!-- step 2: the code ----------------------------------------------- -->
    <form class="authtabpanel authform" id="verifyForm" role="tabpanel" hidden novalidate>
      <div class="authsent">
        <p class="authsent__h" id="sentTitle">Check your email</p>
        <p class="authsent__to" id="sentTo"></p>
      </div>

      <div class="field-group">
        <label class="label" for="code">Six-digit code</label>
        <div class="inputwrap">
          ${icon('lock', 'ic ic--sm')}
          <input class="field field--code" id="code" name="code" type="text"
                 inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*"
                 maxlength="6" placeholder="••••••" required />
        </div>
      </div>

      <p class="autherror" id="verifyError" role="alert" hidden></p>

      <button class="btn btn--primary btn--lg btn--block" id="verifyBtn" type="submit">
        Open the shop${icon('arrow', 'ic ic--sm')}
      </button>

      <div class="authresend">
        <button type="button" class="btn btn--ghost btn--sm" id="resendBtn">Send a new code</button>
        <button type="button" class="btn btn--ghost btn--sm" id="backBtn">Use another email</button>
      </div>

      <p class="authfine" id="resendNote" hidden></p>
    </form>
  </div>
</main>
<script>
(function () {
  /* ---------------------------------------------------------------------
     Where the API is.

     Same-origin in development, because the API serves this build. On GitHub
     Pages the site has no API of its own, so BACKEND_BASE has to be set at
     build time (see docs/03-link-the-page.md):

       node build.js --api=https://your-api.example.com
       API_URL=https://your-api.example.com node build.js

     With nothing set, the page says so plainly instead of failing silently.
     ------------------------------------------------------------------- */
  var AUTH = {
    base: ${JSON.stringify(process.env.API_URL || '')},
    app: ${JSON.stringify(content.brand.name)}
  };

  var mode = 'signin';       /* signin | signup — which step 1 sent us here */
  var pendingEmail = '';

  var el = function (id) { return document.getElementById(id); };
  var tabs = {
    login: { tab: el('tabLogin'), panel: el('loginForm') },
    signup: { tab: el('tabSignup'), panel: el('signupForm') }
  };
  var verify = el('verifyForm');

  function show(which) {
    Object.keys(tabs).forEach(function (k) {
      var on = k === which;
      tabs[k].tab.setAttribute('aria-selected', String(on));
      tabs[k].tab.setAttribute('tabindex', on ? '0' : '-1');
      tabs[k].tab.classList.toggle('is-on', on);
      tabs[k].panel.hidden = !on;
    });
    verify.hidden = true;
    var first = tabs[which].panel.querySelector('input');
    if (first) first.focus();
  }

  /* Step 2 replaces the form rather than sitting beneath it: one thing to look
     at, one thing to do. */
  function showVerify(email, title) {
    tabs.login.panel.hidden = true;
    tabs.signup.panel.hidden = true;
    el('tabLogin').parentNode.hidden = false;
    verify.hidden = false;
    el('sentTitle').textContent = title || 'Check your email';
    el('sentTo').textContent = email;
    el('code').value = '';
    clear(el('verifyError'));
    el('code').focus();
  }

  tabs.login.tab.onclick = function () { show('login'); };
  tabs.signup.tab.onclick = function () { show('signup'); };

  document.querySelector('.authtabs').addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    var to = tabs.login.tab.getAttribute('aria-selected') === 'true' ? 'signup' : 'login';
    show(to);
    tabs[to].tab.focus();
  });

  /* ---------------------------------------------------------------------
     The API. One helper, because every call wants the same three things:
     a timeout (a phone on a bad connection should not spin forever), the
     server's own message when it has one, and the cookie.
     ------------------------------------------------------------------- */
  function api(path, body) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 20000);
    return fetch(AUTH.base + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctl.signal
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'The server answered ' + res.status + '.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }, function (err) {
      clearTimeout(timer);
      var e = new Error(
        err.name === 'AbortError'
          ? 'The shop server did not answer. Check your connection and try again.'
          : 'Cannot reach the shop server. Check your connection and try again.'
      );
      e.offline = true;
      throw e;
    });
  }

  /* ---------------------------------------------------------------------
     Plain checks, no regex: three layers of escaping (Python, the template
     literal, the browser) made a backslash class unreadable and wrong.
     ------------------------------------------------------------------- */
  function looksLikeEmail(v) {
    if (!v || v.indexOf(' ') !== -1) return false;
    var parts = v.split('@');
    if (parts.length !== 2) return false;
    var domain = parts[1];
    return parts[0].length > 0 && domain.indexOf('.') > 0 &&
           domain.indexOf('.') < domain.length - 1;
  }

  function fail(box, msg, field) {
    box.textContent = msg;
    box.hidden = false;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function clear(box) {
    box.hidden = true;
    box.textContent = '';
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.textContent = label || 'One moment…';
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  /* Where to go after the code works. "next" in the address bar wins, but
     only for a route inside this app: never a link off the site. */
  function enter(next) {
    var asked = new URLSearchParams(location.search).get('next');
    var safe = asked && /^[a-z]{2,12}$/.test(asked) ? asked : null;
    var target = next === 'admin' ? '../admin/' : '../' + (safe || 'dashboard') + '/';
    location.replace(target);
  }

  /* --------------------------------------------------------------------
     Step 1 — ask for a code
     ------------------------------------------------------------------ */
  var loginError = el('loginError');
  var email = el('email');
  var loginBtn = el('loginBtn');

  el('loginForm').onsubmit = function (ev) {
    ev.preventDefault();
    clear(loginError);
    [email].forEach(function (f) { f.setAttribute('aria-invalid', 'false'); });

    var e = email.value.trim().toLowerCase();
    if (!e) return fail(loginError, 'Enter the email address you use for the shop.', email);
    if (!looksLikeEmail(e)) return fail(loginError, 'That does not look like an email address.', email);

    pendingEmail = e;
    mode = 'signin';
    busy(loginBtn, true, 'Sending…');

    api('/api/auth/signin', { email: e }).then(function (data) {
      busy(loginBtn, false);
      if (data.role === 'super_admin') {
        /* The admin's link goes to /admin/, not /auth/link/. */
        sessionStorage.setItem('syk-admin-pending', e);
      }
      showVerify(e, 'Check your email');
    }).catch(function (err) {
      busy(loginBtn, false);
      fail(loginError, err.message, email);
    });
  };

  /* --------------------------------------------------------------------
     Step 1 — a new shop
     ------------------------------------------------------------------ */
  var suError = el('signupError');
  var suBtn = el('signupBtn');
  var su = { shop: el('suShop'), name: el('suName'), email: el('suEmail') };

  el('signupForm').onsubmit = function (ev) {
    ev.preventDefault();
    clear(suError);

    if (!su.shop.value.trim()) return fail(suError, 'Give the shop a name — it prints on every receipt.', su.shop);
    if (!su.name.value.trim()) return fail(suError, 'Enter your own name.', su.name);
    var e = su.email.value.trim().toLowerCase();
    if (!looksLikeEmail(e)) return fail(suError, 'That does not look like an email address.', su.email);

    pendingEmail = e;
    mode = 'signup';
    busy(suBtn, true, 'Sending…');

    api('/api/auth/signup', { shop: su.shop.value.trim(), name: su.name.value.trim(), email: e })
      .then(function (data) {
        busy(suBtn, false);
        if (data.existing) {
          /* The address already has a shop: the email that just went out is a
             sign-in, not a sign-up. Say so rather than pretending. */
          mode = 'signin';
          showVerify(e, 'You already have a shop');
        } else {
          showVerify(e, 'Check your email');
        }
      })
      .catch(function (err) {
        busy(suBtn, false);
        fail(suError, err.message, su.email);
      });
  };

  /* --------------------------------------------------------------------
     Step 2 — the code
     ------------------------------------------------------------------ */
  var verifyError = el('verifyError');
  var code = el('code');
  var verifyBtn = el('verifyBtn');

  /* Six digits is not a number to be formatted, it is a code. Strip anything
     else as it is typed, and submit on the sixth digit: fewer taps. */
  code.oninput = function () {
    var digits = code.value.replace(/\D/g, '').slice(0, 6);
    if (code.value !== digits) code.value = digits;
    code.removeAttribute('aria-invalid');
    if (digits.length === 6) el('verifyForm').requestSubmit();
  };

  el('verifyForm').onsubmit = function (ev) {
    ev.preventDefault();
    clear(verifyError);

    var digits = code.value.replace(/\D/g, '');
    if (digits.length !== 6) return fail(verifyError, 'The code is six digits.', code);

    busy(verifyBtn, true, 'Checking…');
    var path = mode === 'signup' ? '/api/auth/signup/verify' : '/api/auth/signin/verify';

    api(path, { email: pendingEmail, code: digits }).then(function (data) {
      busy(verifyBtn, false);
      enter(data.next || 'dashboard');
    }).catch(function (err) {
      busy(verifyBtn, false);
      fail(verifyError, err.message, code);
      code.value = '';
      code.focus();
    });
  };

  el('resendBtn').onclick = function () {
    var btn = this;
    busy(btn, true, 'Sending…');
    var path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin';
    var payload = mode === 'signup'
      ? { shop: su.shop.value.trim(), name: su.name.value.trim(), email: pendingEmail }
      : { email: pendingEmail };

    api(path, payload).then(function () {
      busy(btn, false);
      var note = el('resendNote');
      note.hidden = false;
      note.textContent = 'Sent again. The newest code is the one that works.';
      setTimeout(function () { note.hidden = true; }, 6000);
    }).catch(function (err) {
      busy(btn, false);
      fail(verifyError, err.message);
    });
  };

  el('backBtn').onclick = function () {
    show(mode === 'signup' ? 'signup' : 'login');
  };

  /* --------------------------------------------------------------------
     A link instead of a code.

     Both kinds of link land on /auth/link/?token=…; the page there posts the
     token and redirects. Nothing is done here.
     ------------------------------------------------------------------- */

  /* The address in the query string pre-fills the field, so a link from an
     email that says "sign in as amina@…" is one tap. */
  var asked = new URLSearchParams(location.search).get('email');
  if (asked) email.value = asked;

  email.focus();
})();
</script>`;

  return document({
    title: `Log in — ${content.brand.name}`,
    description:
      'Sign in to Shop Yangu Kenya to take sales, send M-Pesa prompts, print receipts and see your stock and daily reports. A six-digit code by email, no password.',
    page: 'login',
    body,
    bodyClass: 'page-auth',
  });
}

/* ------------------------------------------------------------------ */
/* auth/link and admin/link — where a sign-in link lands               */
/*                                                                    */
/* The token in the address bar is posted to the API, which consumes  */
/* it and sets the session cookie. It is done by a POST from this page */
/* rather than by the API answering the GET, because an email scanner  */
/* that prefetches the link would burn it before the person taps it.   */
/*                                                                    */
/* Both pages are the same machine with a different endpoint.          */
/* ------------------------------------------------------------------ */

function linkPage({ admin = false } = {}) {
  const endpoint = admin ? '/api/admin/link' : '/api/auth/link';
  /* These pages sit two folders deep (/auth/link/, /admin/link/), so every
     link in them goes up two. */
  const next = admin ? '../../admin/' : '../../dashboard/';
  const signInHref = '../../login/';
  const title = admin ? 'Opening the console' : 'Signing you in';

  const body = `<main id="main" class="auth">
  <div class="authcard authcard--link">
    <header class="authcard__head">
      <h1 class="authcard__shop">${escapeHtml(title)}</h1>
    </header>

    <div class="linkstate" id="linkState" role="status" aria-live="polite">
      <div class="linkstate__spin" aria-hidden="true"></div>
      <p class="linkstate__h" id="linkTitle">One moment</p>
      <p class="linkstate__p" id="linkText">Checking your link.</p>
    </div>

    <p class="autherror" id="linkError" role="alert" hidden></p>

    <div class="linkactions" id="linkActions" hidden>
      <a class="btn btn--primary btn--lg btn--block" id="linkGo" href="${signInHref}">
        ${admin ? 'Open the console' : 'Open the shop'}
      </a>
      <a class="btn btn--ghost btn--sm" href="../../login/">Use another address</a>
    </div>
  </div>
</main>
<script>
(function () {
  var API = ${JSON.stringify(process.env.API_URL || '')};
  var token = new URLSearchParams(location.search).get('token');
  var state = document.getElementById('linkState');
  var errBox = document.getElementById('linkError');
  var actions = document.getElementById('linkActions');
  var go = document.getElementById('linkGo');
  var nextAfter = ${JSON.stringify(next)};

  function fail(message) {
    state.hidden = true;
    errBox.hidden = false;
    errBox.textContent = message;
    actions.hidden = false;
    go.textContent = 'Sign in instead';
    go.href = '../../login/';
    document.getElementById('linkGo').dataset.fallback = '1';
  }

  if (!token) return fail('This link has no token. Ask for a new email.');

  /* A link is single-use, so this must run once — a re-render or a back
     button would otherwise try to redeem a token that is already spent. */
  fetch(API + ${JSON.stringify(endpoint)}, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: token })
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) throw new Error(data.error || 'The link did not work.');
      return data;
    });
  }).then(function (data) {
    /* The token is out of the address bar before the redirect, so it does not
       end up in history or in a screenshot. */
    history.replaceState(null, '', location.pathname);
    location.replace(data.next === 'admin' ? '../../admin/' : nextAfter);
  }).catch(function (err) {
    fail(err.message || 'The link did not work. Ask for a new one.');
  });
})();
</script>`;

  /* Written standalone rather than through document(): these pages sit two
     folders deep (/auth/link/, /admin/link/), and the site header's links are
     relative to the root. A sign-in landing page needs no navigation anyway —
     it needs one button. */
  return `${head({
    title: `${title} — ${content.brand.name}`,
    description: 'Finishing your Shop Yangu Kenya sign-in.',
    page: 'link',
  })}
<body class="page-auth page-link">
<a class="skip" href="#main">Skip to content</a>
${body}
</body>
</html>
`;
}

function adminLinkPage() {
  return linkPage({ admin: true });
}

/* ------------------------------------------------------------------ */
/* admin/index.html — the super-admin console                          */
/*                                                                    */
/* Not part of the shop's app, and not in the rail. It is one page     */
/* with one job: show who is signed in, across every shop, and let a   */
/* person who runs the platform pause a shop that has stopped paying.  */
/*                                                                    */
/* It shares the app's stylesheet and its icon sprite, because a second */
/* design language for one screen nobody uses daily would be a second   */
/* thing to keep in step. It does not share the app's session: a       */
/* super admin's cookie is rejected by every shop route (see           */
/* api/lib/auth.js), so the two doors stay separate.                   */
/* ------------------------------------------------------------------ */

function adminPage() {
  const markD = /\sd="([^"]+)"/.exec(read('src/logo/mark-syk.svg'))[1];
  const icons = read('src/app/icons.svg').trim().replace(
    /(<symbol id="i-logo"[^>]*><path d=")[^"]*/,
    `$1${markD}`
  );

  const body = `<main id="main" class="admin">
  <header class="adminhead">
    <div class="adminhead__in">
      <a class="adminhead__brand" href="../">
        ${icon('logo', 'ic adminhead__mark')}
        <span>
          <b>Shop Yangu Kenya</b>
          <span class="adminhead__sub">Platform console</span>
        </span>
      </a>
      <div class="adminhead__right">
        <span class="adminhead__who" id="adminWho" hidden></span>
        <button type="button" class="btn btn--ghost btn--sm" id="adminRefresh" title="Refresh now">
          ${icon('arrow-down-to-line', 'ic ic--sm')} Refresh
        </button>
        <button type="button" class="btn btn--ghost btn--sm" id="adminSignOut" hidden data-signout>
          ${icon('log-out', 'ic ic--sm')} Sign out
        </button>
      </div>
    </div>
  </header>

  <div class="adminwrap">
    <!-- the door: an email and a code, the same as a shop's -->
    <section class="adminlogin" id="adminLogin" hidden>
      <div class="authcard">
        <header class="authcard__head">
          <h1 class="authcard__shop">Platform console</h1>
        </header>

        <form class="authform" id="adminEmailForm" novalidate>
          <div class="field-group">
            <label class="label" for="adminEmail">Admin email address</label>
            <div class="inputwrap">
              ${icon('shield-check', 'ic ic--sm')}
              <input class="field" id="adminEmail" type="email" inputmode="email"
                     autocomplete="username" autocapitalize="none" spellcheck="false"
                     placeholder="you@shopyangu.co.ke" required />
            </div>
          </div>
          <p class="autherror" id="adminEmailError" role="alert" hidden></p>
          <button class="btn btn--primary btn--lg btn--block" type="submit" id="adminEmailBtn">
            Email me a code${icon('arrow', 'ic ic--sm')}
          </button>
        </form>

        <form class="authform" id="adminCodeForm" hidden novalidate>
          <p class="authfine" id="adminSentTo"></p>
          <div class="field-group">
            <label class="label" for="adminCode">Six-digit code</label>
            <div class="inputwrap">
              ${icon('lock', 'ic ic--sm')}
              <input class="field field--code" id="adminCode" type="text" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" placeholder="••••••" required />
            </div>
          </div>
          <p class="autherror" id="adminCodeError" role="alert" hidden></p>
          <button class="btn btn--primary btn--lg btn--block" type="submit" id="adminCodeBtn">
            Open the console${icon('arrow', 'ic ic--sm')}
          </button>
        </form>
      </div>
    </section>

    <!-- the console -->
    <div id="adminApp" hidden>
      <section class="adminstats" id="adminStats" aria-label="Platform totals"></section>

      <section class="adminpanel">
        <div class="adminpanel__head">
          <h2 class="adminpanel__h">Signed in now</h2>
          <p class="adminpanel__sub" id="liveSub">Live sessions across every shop.</p>
          <div class="adminpanel__tools">
            <label class="check">
              <input type="checkbox" id="showEnded" />
              <span>Include ended sessions</span>
            </label>
          </div>
        </div>
        <div class="admintablewrap">
          <table class="admintable" id="sessionsTable">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Shop</th>
                <th scope="col">Device</th>
                <th scope="col">Signed in</th>
                <th scope="col">Last seen</th>
                <th scope="col"><span class="visuallyhidden">Actions</span></th>
              </tr>
            </thead>
            <tbody id="sessionsBody"></tbody>
          </table>
        </div>
      </section>

      <section class="adminpanel">
        <div class="adminpanel__head">
          <h2 class="adminpanel__h">Shops</h2>
          <p class="adminpanel__sub" id="shopsSub"></p>
          <div class="adminpanel__tools">
            <div class="inputwrap inputwrap--find">
              ${icon('search', 'ic ic--sm')}
              <input class="field" id="shopFind" type="search" placeholder="Find a shop" />
            </div>
          </div>
        </div>
        <div class="admintablewrap">
          <table class="admintable" id="shopsTable">
            <thead>
              <tr>
                <th scope="col">Shop</th>
                <th scope="col">Owner</th>
                <th scope="col">Live</th>
                <th scope="col" class="num">Today</th>
                <th scope="col" class="num">All time</th>
                <th scope="col" class="num">Credit out</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="visuallyhidden">Actions</span></th>
              </tr>
            </thead>
            <tbody id="shopsBody"></tbody>
          </table>
        </div>
      </section>

      <p class="adminfoot" id="adminFoot"></p>
    </div>
  </div>
</main>
<script>
(function () {
  /* Same rule as the login page: empty for same-origin, absolute when the
     console is served from GitHub Pages and the API lives elsewhere. */
  var API = ${JSON.stringify(process.env.API_URL || '')};

  var state = { me: null, totals: null, shops: [], sessions: [], liveOnly: true };
  var el = function (id) { return document.getElementById(id); };

  /* Money in shillings, grouped. The same rule as the app: the number is the
     API's, the formatting is the screen's. */
  function kes(n) {
    var v = Number(n) || 0;
    return 'Ksh ' + v.toLocaleString('en-KE', { maximumFractionDigits: 0 });
  }

  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 1440) return Math.round(mins / 60) + ' h ago';
    if (mins < 10080) return Math.round(mins / 1440) + ' d ago';
    return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function device(ua) {
    var s = String(ua || '');
    if (!s) return 'Unknown device';
    /* Escaped for the template literal: the page needs a real backslash. */
    var browser = /Edg\\//.test(s) ? 'Edge' : /OPR\\//.test(s) ? 'Opera'
      : /Firefox\\//.test(s) ? 'Firefox' : /Chrome\\//.test(s) ? 'Chrome'
      : /Safari\\//.test(s) ? 'Safari' : 'Browser';
    var os = /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS'
      : /Windows/.test(s) ? 'Windows' : /Mac OS X/.test(s) ? 'macOS'
      : /Linux/.test(s) ? 'Linux' : '';
    return browser + (os ? ' on ' + os : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'The server answered ' + res.status + '.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* ------------------------------------------------------------------
     The door
     ------------------------------------------------------------------ */
  var pendingEmail = '';
  var emailBox = el('adminEmailError');
  var codeBox = el('adminCodeError');

  function fail(box, msg, field) {
    box.textContent = msg;
    box.hidden = false;
    if (field) field.focus();
  }
  function clear(box) { box.hidden = true; box.textContent = ''; }

  function showDoor() {
    el('adminLogin').hidden = false;
    el('adminApp').hidden = true;
    el('adminWho').hidden = true;
    el('adminSignOut').hidden = true;
    el('adminEmail').focus();
  }

  el('adminEmailForm').onsubmit = function (ev) {
    ev.preventDefault();
    clear(emailBox);
    var email = el('adminEmail').value.trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) return fail(emailBox, 'Enter the admin email address.', el('adminEmail'));

    pendingEmail = email;
    el('adminEmailBtn').disabled = true;
    api('/api/admin/signin', { method: 'POST', body: { email: email } }).then(function () {
      el('adminEmailBtn').disabled = false;
      el('adminEmailForm').hidden = true;
      el('adminCodeForm').hidden = false;
      el('adminSentTo').textContent = 'If ' + email + ' is an admin, the code is on its way.';
      el('adminCode').value = '';
      el('adminCode').focus();
    }).catch(function (err) {
      el('adminEmailBtn').disabled = false;
      fail(emailBox, err.message, el('adminEmail'));
    });
  };

  el('adminCode').oninput = function () {
    var digits = this.value.replace(/\D/g, '').slice(0, 6);
    if (this.value !== digits) this.value = digits;
  };

  el('adminCodeForm').onsubmit = function (ev) {
    ev.preventDefault();
    clear(codeBox);
    var digits = el('adminCode').value.replace(/\D/g, '');
    if (digits.length !== 6) return fail(codeBox, 'The code is six digits.', el('adminCode'));

    el('adminCodeBtn').disabled = true;
    api('/api/admin/signin/verify', { method: 'POST', body: { email: pendingEmail, code: digits } })
      .then(function () { location.reload(); })
      .catch(function (err) {
        el('adminCodeBtn').disabled = false;
        fail(codeBox, err.message, el('adminCode'));
        el('adminCode').value = '';
      });
  };

  el('adminSignOut').onclick = function () {
    /* Destructive, so confirm — same rule as the shop's sign-out. */
    if (!confirm('Sign out of the platform console?')) return;
    api('/api/auth/signout', { method: 'POST' }).then(function () { location.reload(); });
  };

  /* ------------------------------------------------------------------
     The console
     ------------------------------------------------------------------ */
  function stat(label, value, note) {
    return '<div class="adminstat"><p class="adminstat__k">' + esc(label) + '</p>' +
      '<p class="adminstat__v">' + esc(value) + '</p>' +
      (note ? '<p class="adminstat__n">' + esc(note) + '</p>' : '') + '</div>';
  }

  function paint() {
    var t = state.totals || {};
    el('adminStats').innerHTML =
      stat('Shops', t.shops, t.newShops7d ? t.newShops7d + ' new this week' : '') +
      stat('Signed in now', t.liveLogins, 'live sessions') +
      stat('Taken today', kes(t.salesToday), 'every shop') +
      stat('Taken all time', kes(t.salesAll), '') +
      stat('Credit out', kes(t.creditOut), 'owed by customers');

    var shops = state.shops;
    el('shopsSub').textContent = shops.length + (shops.length === 1 ? ' shop' : ' shops') +
      ', newest first.';

    el('shopsBody').innerHTML = shops.map(function (s) {
      return '<tr' + (s.suspended ? ' class="is-paused"' : '') + '>' +
        '<td><b>' + esc(s.name) + '</b><span class="adminsub">' + esc(s.branch) +
          (s.hasMpesa ? ' · M-Pesa ready' : ' · no till yet') + '</span></td>' +
        '<td>' + esc(s.ownerName || '—') + '<span class="adminsub">' + esc(s.ownerEmail || '') + '</span></td>' +
        '<td class="num">' + s.liveSessions + '</td>' +
        '<td class="num">' + kes(s.salesToday) + '</td>' +
        '<td class="num">' + kes(s.lifetimeSales) + '<span class="adminsub">' + s.sales + ' receipts</span></td>' +
        '<td class="num">' + kes(s.creditOut) + '</td>' +
        '<td>' + (s.suspended
          ? '<span class="pill low">Paused</span>'
          : '<span class="pill ok">Active</span>') + '</td>' +
        '<td class="admintable__act">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-open-shop="' + esc(s.id) + '">Details</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    var sessions = state.sessions;
    el('liveSub').textContent = state.liveOnly
      ? sessions.length + ' live session' + (sessions.length === 1 ? '' : 's') + ' right now.'
      : 'Every session, newest activity first.';

    el('sessionsBody').innerHTML = sessions.length ? sessions.map(function (s) {
      return '<tr>' +
        '<td><b>' + esc(s.person) + '</b><span class="adminsub">' + esc(s.email) +
          (s.role === 'super_admin' ? ' · admin' : '') + '</span></td>' +
        '<td>' + (s.shopName ? esc(s.shopName) : '<span class="adminsub">no shop</span>') + '</td>' +
        '<td>' + esc(device(s.userAgent)) + '<span class="adminsub">' + esc(s.ip || '') + '</span></td>' +
        '<td>' + when(s.signedInAt) + '</td>' +
        '<td>' + when(s.lastSeenAt) + '</td>' +
        '<td class="admintable__act">' +
          (s.revokedAt
            ? '<span class="adminsub">ended ' + when(s.revokedAt) + '</span>'
            : '<button type="button" class="btn btn--ghost btn--sm" data-end-session="' + esc(s.sessionId) + '">End</button>') +
        '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="6" class="adminempty">Nobody is signed in.</td></tr>';

    el('adminFoot').textContent = 'Updated ' + new Date().toLocaleTimeString('en-KE');
  }

  function load() {
    return api('/api/admin/overview').then(function (data) {
      state.me = data.admin;
      state.totals = data.totals;
      state.shops = data.shops;
      state.sessions = data.sessions;
      document.title = 'Console — ' + data.admin.name;
      el('adminWho').hidden = false;
      el('adminWho').textContent = data.admin.email;
      el('adminSignOut').hidden = false;
      el('adminLogin').hidden = true;
      el('adminApp').hidden = false;
      paint();
    });
  }

  function loadSessions() {
    return api('/api/admin/logins' + (state.liveOnly ? '' : '?all=1')).then(function (data) {
      state.sessions = data.sessions;
      paint();
    });
  }

  el('showEnded').onchange = function () {
    state.liveOnly = !this.checked;
    loadSessions();
  };

  el('adminRefresh').onclick = function () {
    var btn = this;
    btn.disabled = true;
    load().then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
  };

  el('shopFind').oninput = function () {
    var q = this.value.trim().toLowerCase();
    var rows = Array.prototype.slice.call(el('shopsBody').querySelectorAll('tr'));
    rows.forEach(function (tr) {
      tr.hidden = q && tr.textContent.toLowerCase().indexOf(q) === -1;
    });
  };

  el('shopsBody').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-open-shop]');
    if (!btn) return;
    var shop = state.shops.filter(function (s) { return s.id === btn.dataset.openShop; })[0];
    if (!shop) return;

    var action = shop.suspended
      ? 'resume'
      : 'pause';
    var msg = shop.suspended
      ? 'Resume ' + shop.name + '? Its owner will be able to sign in and sell again.'
      : 'Pause ' + shop.name + '?\\n\\nIts owner is signed out immediately and cannot sell until you resume it. ' +
        'Nothing is deleted: receipts, stock and customers stay exactly as they are.';
    if (!confirm(msg)) return;

    var body = action === 'pause' ? { reason: 'Paused from the console' } : undefined;
    api('/api/admin/shops/' + shop.id + '/' + action, { method: 'POST', body: body })
      .then(function () { return load(); })
      .catch(function (err) { alert(err.message); });
  });

  el('sessionsBody').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-end-session]');
    if (!btn) return;
    if (!confirm('End this session? That device will have to sign in again.')) return;
    api('/api/admin/sessions/' + btn.dataset.endSession + '/end', { method: 'POST' })
      .then(function () { return loadSessions(); })
      .catch(function (err) { alert(err.message); });
  });

  /* An admin does not sit on this screen all day; refresh the live list while
     it is open, and stop when the tab is hidden. */
  var timer = null;
  function startTimer() {
    stopTimer();
    timer = setInterval(function () {
      if (document.hidden || el('adminApp').hidden) return;
      loadSessions().catch(function () {});
    }, 30000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadSessions().catch(function () {});
  });

  /* ------------------------------------------------------------------ */
  load().then(startTimer, function (err) {
    if (err.status === 401 || err.status === 403) return showDoor();
    showDoor();
    fail(emailBox, err.message);
  });
})();
</script>`;

  return `<!doctype html>
<html lang="en-KE" data-shell="admin">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#1B4A63" />
<title>Platform console — ${escapeHtml(content.brand.name)}</title>
<meta name="robots" content="noindex" />
<meta name="description" content="The Shop Yangu Kenya platform console: signed-in shops, live sessions and shop status." />
<link rel="icon" href="../favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="../styles.css" />
<link rel="stylesheet" href="../app/app.css" />
<script>window.SYK_API = ${JSON.stringify(process.env.API_URL || '')};</script>
</head>
<body class="page-admin">
${icons}
<a class="skip" href="#main">Skip to content</a>
${body}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* write                                                               */
/* ------------------------------------------------------------------ */

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const pages = new Set();

function write(name, html) {
  fs.mkdirSync(path.dirname(path.join(dist, name)), { recursive: true });
  fs.writeFileSync(path.join(dist, name), html);
  pages.add(name);
}

write(
  'index.html',
  document({
    title: `${content.brand.name} — ${content.brand.tagline}`,
    description:
      'A phone-first wholesale and retail shop system for Kenya: split payments, customer credit, stock and expiry, Excel migration, KRA eTIMS receipts. Ksh 1,500 a month.',
    page: 'index',
    body: indexBody,
  })
);

write('spec/index.html', specPage());
write('login/index.html', loginPage());
write('auth/link/index.html', linkPage());
write('admin/index.html', adminPage());
write('admin/link/index.html', adminLinkPage());

/* the app: one page, one folder per screen */
for (const route of Object.keys(APP_ROUTES)) writeRoute(route);

/* The page the worker falls back to when a shop opens the installed app with
   no connection. It is deliberately not a route in the app: the app needs its
   data to be useful, and pretending otherwise would show empty numbers. */
fs.mkdirSync(path.join(dist, 'offline'), { recursive: true });
fs.writeFileSync(
  path.join(dist, 'offline', 'index.html'),
  `<!doctype html>
<html lang="en-KE">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#1B4A63" />
<title>No connection — ${escapeHtml(content.brand.name)}</title>
<meta name="robots" content="noindex" />
<meta name="description" content="Shop Yangu could not reach the internet. Your last sale is still on this device." />
<link rel="icon" href="../favicon.svg" type="image/svg+xml" />
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center;
    background: #F5EFE6; color: #1F1B16;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px;
  }
  .card { max-width: 380px; text-align: center; }
  .offlinemark { width: 64px; height: 72px; color: #1B4A63; margin: 0 auto 18px; display: block; }
  h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 8px; }
  p { color: #6A6054; margin: 0 0 20px; }
  button {
    font: inherit; font-weight: 600; min-height: 48px; padding: 0 22px;
    border: 0; border-radius: 999px; background: #1B4A63; color: #fff; cursor: pointer;
  }
</style>
</head>
<body>
<div class="card">
  <svg class="offlinemark" viewBox="0 0 636 722" aria-hidden="true"><use href="#mark"/></svg>
  <h1>No connection</h1>
  <p>Shop Yangu could not reach the internet. Your last sale is still on this device.
     Reconnect, then open the app again.</p>
  <button onclick="location.reload()">Try again</button>
</div>
<svg width="0" height="0" aria-hidden="true"><defs>
  <symbol id="mark" viewBox="0 0 636 722"><path fill="currentColor" d="${/\sd="([^"]+)"/.exec(read('src/logo/mark-syk.svg'))[1]}"/></symbol>
</defs></svg>
</body>
</html>
`
);
pages.add('offline/index.html');

/* assets */
fs.cpSync(path.join(root, 'src/styles.css'), path.join(dist, 'styles.css'));
fs.mkdirSync(path.join(dist, 'app'), { recursive: true });
fs.copyFileSync(path.join(root, 'src/app/app.css'), path.join(dist, 'app', 'app.css'));
fs.writeFileSync(path.join(dist, 'app', 'app.js'), appScript());

/* the logo, used by the browser tab and the app's rail */
for (const [from, to] of [
  ['src/logo/favicon.svg', 'favicon.svg'],
  ['src/logo/mark-syk.svg', 'logo.svg'],
]) {
  fs.copyFileSync(path.join(root, from), path.join(dist, to));
}

fs.copyFileSync(path.join(root, 'src/logo/apple-touch-icon.png'), path.join(dist, 'apple-touch-icon.png'));

/* ---- installable app: manifest, worker, icons -------------------------

   The manifest sits at the site root so its scope is the whole site, and the
   worker beside it so it can control every route. The icons are produced by
   tools/make-pwa-icons.mjs from the 180 px touch icon — run it if the mark
   changes. */
fs.copyFileSync(path.join(root, 'src/app/manifest.json'), path.join(dist, 'manifest.json'));
fs.copyFileSync(path.join(root, 'src/app/sw.js'), path.join(dist, 'sw.js'));
for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
  fs.copyFileSync(path.join(root, 'src/logo', icon), path.join(dist, icon));
}
fs.copyFileSync(path.join(root, 'src/logo/og.png'), path.join(dist, 'og.png'));
/* The hero mock. Trimmed and re-encoded from Images/Mobile POS Receipt Mockup.png
   by tools/make-pos-mock.mjs, so the 1 MB original never reaches a phone. */
fs.copyFileSync(path.join(root, 'src/pos-mock.webp'), path.join(dist, 'pos-mock.webp'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');




/* 404 → the shop's front door, so a mistyped address still lands somewhere. */
write(
  '404.html',
  document({
    title: `Page not found — ${content.brand.name}`,
    description: 'That page does not exist. Head back to the home page or sign in to the shop.',
    page: '404',
    body: `<main id="main" class="missing">
  <div class="wrap">
    <p class="kicker">404</p>
    <h1 class="missing__title">That shelf is empty.</h1>
    <p class="missing__lede">The page you asked for is not here. The home page and the door to the shop both are.</p>
    <div class="hero__cta">
      <a class="btn btn--primary" href="${siteUrl('')}">Back home${icon('arrow')}</a>
      <a class="btn btn--ghost" href="${siteUrl('login/')}">Sign up / Log in</a>
    </div>
  </div>
</main>`,
  })
);

/* The webfonts. Copied rather than linked so the site is self-contained: a
   shop on a slow connection should not be waiting on fonts.googleapis.com. */
fs.mkdirSync(path.join(dist, 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'src/fonts'))) {
  if (f.endsWith('.woff2') || f === 'OFL.txt') {
    fs.copyFileSync(path.join(root, 'src/fonts', f), path.join(dist, 'fonts', f));
  }
}

/* ------------------------------------------------------------------ */
/* checks — a broken internal link must fail the build, not the page   */
/* ------------------------------------------------------------------ */

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

/* Every asset the pages may refer to. The link check below trusts this list,
   so *this* list is verified against the disk: a copy step that stopped
   running once left the site 404ing its own fonts while the build said all
   checks passed. */
const assets = new Set([
  ...pages,
  'styles.css',
  'app/app.css',
  'app/app.js',
  'apple-touch-icon.png',
  'manifest.json',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'og.png',
  'favicon.svg',
  'logo.svg',
  'pos-mock.webp',
  'fonts/PublicSans-Regular.woff2',
  'fonts/PublicSans-Medium.woff2',
  'fonts/PublicSans-SemiBold.woff2',
  'fonts/PublicSans-Bold.woff2',
]);

/* The list must match the disk. A copy step that silently stopped running
   would otherwise pass every check and 404 on the deployed site. */
for (const a of assets) {
  if (!fs.existsSync(path.join(dist, a))) check(false, `missing from dist: ${a}`);
}

/* Only real markup counts: skip ids/hrefs that live inside script strings. */
function anchorsOf(html) {
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return new Set([
    ...[...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
    ...[...markup.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]),
  ]);
}

/* A link is resolved the way a browser resolves it, from the page's own
   folder: './' → index.html, '../login/' → login/index.html, 'chart.png' →
   the file next to the page. Nothing here knows about a server root, because
   Pages serves this site from a sub-folder and the links must not care. */
function targetOf(href, from) {
  if (!href) return from; /* a bare #anchor stays on this page */
  if (href.startsWith('#')) return from;
  /* 404.html is written from the site root, so strip the mount point and
     resolve the rest as a path below it. `link` rather than `path`: path is
     the Node module used two lines down. */
  let link = href;
  if (from === '404.html' && SITE_PATH && link.startsWith(SITE_PATH)) {
    link = link.slice(SITE_PATH.length) || '/';
  }
  if (link.startsWith('/')) {
    const clean = link.replace(/^\//, '');
    if (!clean) return 'index.html';
    return clean.endsWith('/') ? clean + 'index.html' : clean;
  }
  const dir = path.posix.dirname(from);
  const joined = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, link));
  if (link.endsWith('/') || joined === '.' || joined === '') {
    return path.posix.join(joined === '.' ? '' : joined, 'index.html');
  }
  return joined;
}

for (const page of pages) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const anchors = anchorsOf(html);
  for (const m of markup.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:|tel:)/.test(href)) continue;
    const [rawPath, hash = ''] = href.split('#');
    const target = targetOf(rawPath, page);
    if (!assets.has(target)) {
      check(false, `${page}: broken link → ${href}`);
      continue;
    }
    if (hash) {
      const same = target === page;
      const other = same ? html : fs.readFileSync(path.join(dist, target), 'utf8');
      const has = anchorsOf(other).has(hash);
      const homeHas = hash && anchorsOf(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')).has(hash);
      if (!has && !homeHas) check(false, `${page}: missing anchor → ${href}`);
    }
  }
  check(/<h1[ >]/.test(html), `${page}: no <h1>`);
  if (page !== '404.html') {
    check(/<meta name="description" content="[^"]{20,}/.test(html), `${page}: thin description`);
  }

  /* No address may end in .html — that is the file, not the site. */
  for (const m of markup.matchAll(/\s(?:href|src)="([^"]+\.html[^"]*)"/g)) {
    check(false, `${page}: .html in a link → ${m[1]}`);
  }
}

/* Every class a page uses must have a rule in a stylesheet it loads. This is
   the check that catches the bug this site actually had: the login page kept
   its markup while its CSS quietly disappeared, so the form rendered as a
   bullet list. A class with no rule is a bug, not a warning. */
const CSS_BY_PAGE = (page) =>
  page.startsWith('index.html') || page === '404.html' || !page.includes('/')
    ? read('src/styles.css')
    : page.startsWith('spec/')
      ? read('src/styles.css')
      : page.startsWith('login/')
        ? read('src/styles.css')
        : read('src/styles.css') + '\n' + read('src/app/app.css');

/* These are hooks with no styling of their own by design — they exist for
   JavaScript to find an element, or for print. */
/* Classes that carry no rule of their own: behaviour hooks, state toggles, and
   the offline page's inline-styled mark (that page ships its own CSS because
   it must render with no stylesheet cached). */
const UNSTYLED_BY_DESIGN = new Set(['paygrid', 'is-hidden', 'active', 'offlinemark', 'authtabpanel']);

for (const page of pages) {
  if (page === '404.html') continue;
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const css = CSS_BY_PAGE(page);
  const used = new Set();
  for (const m of markup.matchAll(/\sclass="([^"]+)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
  }
  /* classes the script builds at run time are checked against the same file,
     so a rendered row is covered too */
  for (const m of html.matchAll(/class=\\?"([a-zA-Z][\w -]*)/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
  }
  const missing = [...used].filter(
    (c) => !UNSTYLED_BY_DESIGN.has(c) && !new RegExp('\\.' + c + '(?![\\w-])').test(css)
  );
  if (missing.length) check(false, `${page}: ${missing.length} class(es) with no CSS — ${missing.slice(0, 6).join(', ')}`);
}

/* Every inline script must at least be JavaScript.

   This check exists because a regex inside a template literal lost its
   backslashes once and turned /Edg\// into /Edg//, which is a syntax error the
   browser reports as "something went wrong" and nothing else. `new Function`
   compiles without running, so it is a syntax check with no side effects. */
for (const page of pages) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const [i, src] of scripts.entries()) {
    if (!src.trim()) continue;
    try {
      /* eslint-disable-next-line no-new-func */
      new Function(src);
    } catch (err) {
      const line = src.slice(0, err.message.length ? undefined : undefined);
      check(false, `${page}: inline script ${i + 1} is not valid JavaScript — ${err.message}`);
    }
  }
}

/* The published pages must not reach for anything we do not ship. */
for (const page of pages) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    if (!/^https:\/\/saintm254\.github\.io/.test(m[1])) {
      check(false, `${page}: external asset → ${m[1]} (files must be self-hosted)`);
    }
  }
}

/* ============================================================== the palette

   Images/color-sytem.html is the brief for colour, and it publishes its own
   contrast table. The stylesheet must carry the same values, and every pair
   the brief calls a check must still clear the ratio it needs. Without this,
   a colour drifts, the page still builds, and nobody notices until a customer
   reads a receipt in the sun. */
const PALETTE = {
  bg: '#F5EFE6', surface: '#FFFFFF', ink: '#1F1B16', muted: '#6A6054', line: '#E2D8C8',
  primary: '#287094', primaryDark: '#1B5270', link: '#1B5270',
  sidebar: '#1B4A63', sidebarInk: '#FFFFFF',
  accent: '#D9622B', accentInk: '#1F1B16',
  success: '#167A45', warning: '#B45309', danger: '#C62F3A',
  disabledBg: '#D9CFBF', disabledInk: '#5A5046',
};
const THEME = read('src/styles.css');
const cssVar = (name) => {
  const m = new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{6})', 'i').exec(THEME);
  return m ? m[1].toUpperCase() : null;
};
/* the brief names them camelCase (its CSS export); the stylesheet uses the
   kebab-case form */
const kebab = (n) => n.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
for (const [name, want] of Object.entries(PALETTE)) {
  const key = kebab(name);
  const got = cssVar(key);
  if (got !== want.toUpperCase()) {
    check(false, `palette: --${key} is ${got || 'missing'}, the colour system says ${want}`);
  }
}
const hexRgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').substr(i, 2), 16));
const lum = (h) => {
  const k = hexRgb(h).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const PAIRS = [
  ['body text on the page', PALETTE.ink, PALETTE.bg, 4.5],
  ['body text on a card', PALETTE.ink, PALETTE.surface, 4.5],
  ['muted text on the page', PALETTE.muted, PALETTE.bg, 4.5],
  ['muted text on a card', PALETTE.muted, PALETTE.surface, 4.5],
  ['links on the page', PALETTE.link, PALETTE.bg, 4.5],
  ['primary button text', '#FFFFFF', PALETTE.primary, 4.5],
  ['paid message', '#FFFFFF', PALETTE.success, 4.5],
  ['warning tag', '#FFFFFF', PALETTE.warning, 4.5],
  ['danger tag', '#FFFFFF', PALETTE.danger, 4.5],
  ['accent tag text', PALETTE.accentInk, PALETTE.accent, 4.5],
  ['disabled button text', PALETTE.disabledInk, PALETTE.disabledBg, 4.5],
  ['sidebar menu text', PALETTE.sidebarInk, PALETTE.sidebar, 4.5],
  ['selected sidebar item', PALETTE.sidebar, '#FFFFFF', 4.5],
  ['primary button against the page', PALETTE.primary, PALETTE.bg, 3],
  ['primary against a card', PALETTE.primary, PALETTE.surface, 3],
];
for (const [what, fg, bg, need] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < need) {
    check(false, `contrast: ${what} is ${r.toFixed(2)}:1, needs ${need}:1 (${fg} on ${bg})`);
  }
}

const bytes = fs
  .readdirSync(dist, { recursive: true })
  .map((f) => path.join(dist, f))
  .filter((f) => fs.statSync(f).isFile())
  .reduce((n, f) => n + fs.statSync(f).size, 0);

console.log(`  built ${pages.size} pages · ${(bytes / 1024).toFixed(0)} kB in dist/`);
if (failures) {
  console.error(`  ${failures} check(s) failed`);
  process.exit(1);
}
console.log('  all checks passed');
