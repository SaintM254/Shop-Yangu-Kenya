/**
 * Shop Yangu Kenya — static site build.
 *
 * Zero dependencies on purpose: GitHub Actions runs `node build.js` with nothing
 * to install, so the Pages deploy cannot break on a registry outage or a lockfile
 * drift. Everything the site needs is in this repository.
 *
 * Inputs:  src/content.json, src/styles.css, shop-yangu-kenya.html,
 *          shop-yangu-kenya.md, src/fonts/*
 * Outputs: dist/index.html, dist/prototype.html, dist/spec.html,
 *          dist/fonts/*, dist/favicon.svg, dist/.nojekyll, dist/404.html
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
  <rect width="64" height="64" rx="14" fill="#023246"/>
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

function head({ title, description, page }) {
  return `<!doctype html>
<html lang="en-KE">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#023246" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="canonical" href="https://saintm254.github.io/Shop-Yangu-Kenya/${page === 'index' ? '' : page + '.html'}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<link rel="stylesheet" href="styles.css" />
</head>`;
}

function siteHeader(current) {
  /* Section anchors live on the home page; from any other page they need the file. */
  const here = (href) => (href.startsWith('#') && current !== 'index' ? 'index.html' + href : href);
  const nav = [
    ['#what', 'What it does'],
    ['#start', 'Price'],
  ];
  const isNav = (href) => href === current;
  return `<header class="hdr">
  <div class="wrap hdr__in">
    <a class="brand" href="index.html" aria-label="${escapeHtml(content.brand.name)} — home">
      <span class="brand__mark" aria-hidden="true">${icon('box', 'ic ic--sm')}</span>
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
    <a class="btn btn--primary btn--sm hdr__cta" href="login.html">
      <span class="cta-full">Sign up / Log in</span><span class="cta-short">Log in</span>${icon('arrow', 'ic ic--sm')}
    </a>
  </div>
</header>`;
}

function siteFooter(current) {
  const here = (href) => (href.startsWith('#') && current !== 'index' ? 'index.html' + href : href);
  return `<footer class="ftr">
  <div class="wrap ftr__in">
    <div class="ftr__brand">
      <span class="brand__mark brand__mark--light" aria-hidden="true">${icon('box', 'ic ic--sm')}</span>
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
        <a href="login.html">Sign up / Log in</a>
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

function document({ title, description, page, body, bodyClass = '' }) {
  return `${head({ title, description, page })}
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

/* The hero picture sells the headline: a real sale, with the M-Pesa prompt
   already answered on the customer's phone. */
const mock = `
<div class="mock" role="img" aria-label="A till mid-sale: Sugar 2kg and Cooking oil at Ksh 1,480, paid Ksh 1,480 by M-Pesa, with the STK push confirmed on the customer's phone.">
  <div class="mock__bar">
    <span class="mock__mark" aria-hidden="true">${icon('box', 'ic ic--sm')}</span>
    <span class="mock__title">New sale</span>
    <span class="mock__pill">Till 1</span>
  </div>

  <ul class="ticket num">
    <li><span>Sugar 2kg <em>× 2</em></span><span>480</span></li>
    <li><span>Cooking oil 2L <em>× 1</em></span><span>1,000</span></li>
  </ul>

  <div class="ticket__total num"><span>Total</span><span>${kes(1480)}</span></div>

  <div class="paynow">
    <span class="paynow__label">${icon('smartphone', 'ic ic--sm')}M-Pesa</span>
    <span class="paynow__amt num">${kes(1480)}</span>
    <span class="paynow__ok">${icon('check', 'ic ic--sm')}Paid</span>
  </div>

  <div class="phone">
    <p class="phone__top num">M-PESA</p>
    <p class="phone__msg">Enter your M-PESA PIN to pay <b class="num">Ksh 1,480.00</b> to <b>SHOP YANGU KENYA</b>.</p>
    <p class="phone__pin num" aria-hidden="true"><i></i><i></i><i></i><i></i></p>
    <p class="phone__ok">${icon('check', 'ic ic--sm')}Confirmed · receipt printed</p>
  </div>

  <div class="mock__row">
    <span class="tag tag--ok">Stock</span>
    <span class="mock__rowtext">Sugar 2kg 18 → 16 on the shelf</span>
  </div>
</div>`;

const receiptMock = `
<div class="receipt" aria-label="Example of a rendered receipt">
  <p class="receipt__shop">${escapeHtml(content.brand.name)}</p>
  <p class="receipt__meta">${escapeHtml(content.brand.branch)} · ${escapeHtml(content.brand.phone)}<br />KRA PIN ${escapeHtml(content.brand.kra)}</p>
  <p class="receipt__no num">Receipt 00124 · ${dmy(new Date())} 14:08</p>
  <ul class="receipt__lines num">
    <li><span>Sugar 2kg × 2</span><span>480</span></li>
    <li><span>Rice Pishori 5kg × 1</span><span>760</span></li>
    <li><span>Cooking oil 2L × 2</span><span>1,240</span></li>
  </ul>
  <p class="receipt__tot num"><span>Total</span><span>${kes(2480)}</span></p>
  <p class="receipt__pay num"><span>Cash</span><span>1,000</span></p>
  <p class="receipt__pay num"><span>M-Pesa</span><span>1,300</span></p>
  <p class="receipt__pay receipt__pay--credit num"><span>Goes to credit</span><span>180</span></p>
  <p class="receipt__sign num">eTIMS · 1.2.156.1145.…· 8f3c · signed locally</p>
</div>`;

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
      <ul class="hero__notes">
        ${content.hero.notes.map((n) => `<li>${icon('check', 'ic ic--sm')}${escapeHtml(n)}</li>`).join('\n        ')}
      </ul>
    </div>
    <div class="hero__art">
      ${mock}
      ${receiptMock}
    </div>
  </div>
</section>`;

const statsStrip = `
<section class="strip" aria-label="At a glance">
  <div class="wrap strip__in">
    ${content.stats
      .map(
        (s) => `<div class="strip__cell">
      <p class="strip__value num">${escapeHtml(s.value)}</p>
      <p class="strip__label">${escapeHtml(s.label)}</p>
      <p class="strip__note">${escapeHtml(s.note)}</p>
    </div>`
      )
      .join('')}
  </div>
</section>`;

const features = `
<section class="sec" id="what">
  <div class="wrap">
    <header class="sec__head">
      <p class="kicker">What you get</p>
      <h2 class="sec__title">The whole shop, in one simple app.</h2>
      <p class="sec__lede">Everything you need to sell, get paid, keep stock straight and know how the day went — without a book, a spreadsheet, or a second person to check the M-Pesa messages.</p>
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

/* The close of the advert: what it costs, and one way in. */
const signup = `
<section class="sec sec--close" id="start">
  <div class="wrap">
    <div class="close">
      <div class="close__plan">
        <p class="kicker">The plan</p>
        <p class="close__price num">${kes(content.plan.price_kes)}<span> / ${escapeHtml(content.plan.period)}</span></p>
        <p class="close__trial">Free for ${content.plan.trial_days} days. No card needed to start.</p>
        <ul class="close__list">
          ${content.plan.includes.map((i) => `<li>${icon('check', 'ic ic--sm')}${escapeHtml(i)}</li>`).join('\n          ')}
        </ul>
      </div>
      <div class="close__cta">
        <h2 class="close__title">Start with today's sales.</h2>
        <p class="close__lede">Sign in and ring up your first sale in a couple of minutes. If you already have a shop with us, your stock and customers are waiting.</p>
        <a class="btn btn--primary btn--lg" href="login.html">Sign up / Log in ${icon('arrow')}</a>
        <p class="close__fine">Owner and cashier accounts. Each cashier sees only their own till.</p>
      </div>
    </div>
  </div>
</section>`;

const indexBody = `
<main id="main">
  ${hero}
  ${statsStrip}
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
      <a href="index.html">Home</a><span aria-hidden="true">/</span><span>Build spec</span>
    </nav>
    <div class="doc">
      <aside class="doc__toc" aria-label="On this page">
        <p class="doc__toc-h">Contents</p>
        ${toc}
        <a class="doc__back" href="prototype.html">${icon('arrow', 'ic ic--sm')} Open the prototype</a>
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
      'The full build prompt for Shop Yangu Kenya: roles, screens, data model, money rules, import rules and the definition of done.',
    page: 'spec',
    body,
    bodyClass: 'page-doc',
  });
}

/* ------------------------------------------------------------------ */
/* prototype.html — the reference file, served as its own page         */
/* ------------------------------------------------------------------ */

function prototypePage() {
  const raw = read('shop-yangu-kenya.html');
  const meta = [
    '<meta name="description" content="Shop Yangu Kenya — the working interactive prototype. Sell, split a payment across cash, M-Pesa and card, hold credit, check stock and print an eTIMS receipt. Sample data in memory." />',
    '<link rel="canonical" href="https://saintm254.github.io/Shop-Yangu-Kenya/prototype.html" />',
    '<meta property="og:title" content="Prototype — Shop Yangu Kenya" />',
    '<meta property="og:description" content="Every screen of the shop system, working, in one self-contained file." />',
    '<link rel="icon" href="favicon.svg" type="image/svg+xml" />',
  ].join('\n');

  return raw
    .replace(/<title>([\s\S]*?)<\/title>/, (_, t) => `<title>${t.trim()} — prototype</title>`)
    .replace(/(<meta name="viewport"[^>]*>)/, `$1\n${meta}`)
    .replace(
      /<body([^>]*)>/,
      `<body$1>
<div id="protoBar" style="position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;gap:6px;font:600 12px/1 'Public Sans',system-ui,sans-serif">
  <a href="index.html" style="display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;background:#023246;color:#FFF8E1;text-decoration:none;border:1px solid #023246">&#8592; Back to the site</a>
  <a href="spec.html" style="display:inline-flex;align-items:center;padding:9px 14px;border-radius:999px;background:#FFF8E1;color:#023246;text-decoration:none;border:1px solid #E7DDB5">Spec</a>
</div>
<script>
  /* The prototype's own bottom tab bar sits at the bottom on a phone; lift the
     bar above it so the two never fight for the same thumb space. */
  addEventListener('load', function () {
    var bar = document.getElementById('protoBar');
    var tabs = document.querySelector('.tabbar');
    if (bar && tabs) bar.style.bottom = (tabs.offsetHeight + 12) + 'px';
  });
</script>`
    );
}

/* ------------------------------------------------------------------ */
/* login.html — the advert's door                                      */
/* ------------------------------------------------------------------ */

function loginPage() {
  const demo = content.demo_account;
  const body = `<main id="main" class="auth">
  <div class="wrap auth__in">
    <div class="auth__aside">
      <h1 class="auth__title">Welcome back.</h1>
      <p class="auth__lede">Sign in to ring up a sale, check the drawer and see what sold today.</p>
      <ul class="auth__list">
        <li>${icon('smartphone', 'ic ic--sm')}<span>Sell with cash or M-Pesa, and split a payment across both.</span></li>
        <li>${icon('receipt', 'ic ic--sm')}<span>Print the receipt as soon as the sale is paid.</span></li>
        <li>${icon('box', 'ic ic--sm')}<span>Stock comes off the shelf by itself, every sale.</span></li>
      </ul>
      <div class="auth__demo">
        <p class="auth__demo-h">${icon('lock', 'ic ic--sm')} Demo account</p>
        <dl class="auth__demo-list">
          <div><dt>Email</dt><dd class="mono">${escapeHtml(demo.email)}</dd></div>
          <div><dt>Password</dt><dd class="mono">${escapeHtml(demo.password)}</dd></div>
        </dl>
        <button type="button" class="btn btn--ghost btn--sm" id="fillDemo">Fill these in for me</button>
      </div>
    </div>

    <div class="auth__card">
      <form class="auth__form" id="loginForm" novalidate>
        <div class="field-group">
          <label class="label" for="email">Email address</label>
          <div class="inputwrap">
            ${icon('mail', 'ic ic--sm')}
            <input class="field" id="email" name="email" type="email" inputmode="email"
                   autocomplete="username" autocapitalize="none" spellcheck="false"
                   placeholder="you@yourshop.co.ke" required />
          </div>
        </div>

        <div class="field-group">
          <label class="label" for="password">Password</label>
          <div class="inputwrap">
            ${icon('lock', 'ic ic--sm')}
            <input class="field" id="password" name="password" type="password"
                   autocomplete="current-password" placeholder="Your password" required />
            <button type="button" class="reveal" id="reveal" aria-label="Show password" aria-pressed="false">
              ${icon('eye', 'ic ic--sm')}
            </button>
          </div>
        </div>

        <div class="auth__row">
          <label class="check">
            <input type="checkbox" id="remember" checked />
            <span>Keep me signed in</span>
          </label>
          <span class="auth__help">Forgot your password? Call the shop owner.</span>
        </div>

        <p class="auth__error" id="loginError" role="alert" hidden></p>

        <button class="btn btn--primary btn--lg btn--block" id="loginBtn" type="submit">
          Log in${icon('arrow')}
        </button>
        <p class="auth__fine">Trouble signing in? The demo details are on the left.</p>
      </form>

      <div class="auth__done" id="loginDone" hidden>
        <span class="auth__tick" aria-hidden="true">${icon('check')}</span>
        <h2 class="auth__done-h">You're in, ${escapeHtml(demo.name.split(' ')[0])}.</h2>
        <p class="auth__done-p" id="loginDoneP">Signed in to ${escapeHtml(demo.shop)} as ${escapeHtml(demo.role)}.</p>
        <a class="btn btn--primary btn--lg btn--block" href="prototype.html">
          Open the till${icon('arrow')}
        </a>
        <button class="btn btn--ghost btn--block" type="button" id="signOut">Sign out</button>
      </div>
    </div>
  </div>
</main>
<script>
(function () {
  var DEMO = ${JSON.stringify({ email: demo.email, password: demo.password, name: demo.name, role: demo.role, shop: demo.shop })};
  var form = document.getElementById('loginForm');
  var email = document.getElementById('email');
  var password = document.getElementById('password');
  var error = document.getElementById('loginError');
  var done = document.getElementById('loginDone');
  var btn = document.getElementById('loginBtn');

  /* Plain checks, no regex: three layers of escaping (Python, the template
     literal, the browser) made a backslash class unreadable and wrong. */
  function looksLikeEmail(v) {
    if (!v || v.indexOf(' ') !== -1) return false;
    var parts = v.split('@');
    if (parts.length !== 2) return false;
    var domain = parts[1];
    return parts[0].length > 0 && domain.indexOf('.') > 0 &&
           domain.indexOf('.') < domain.length - 1;
  }

  function showError(msg, which) {
    error.textContent = msg;
    error.hidden = false;
    [email, password].forEach(function (f) { f.setAttribute('aria-invalid', 'false'); });
    if (which) which.setAttribute('aria-invalid', 'true');
    (which || email).focus();
  }

  document.getElementById('fillDemo').onclick = function () {
    email.value = DEMO.email;
    password.value = DEMO.password;
    error.hidden = true;
    btn.focus();
  };

  document.getElementById('reveal').onclick = function () {
    var showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    this.setAttribute('aria-pressed', String(!showing));
    this.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    this.innerHTML = showing
      ? '<svg class="ic ic--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS.eye}</svg>'
      : '<svg class="ic ic--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS.eyeOff}</svg>';
    password.focus();
  };

  form.onsubmit = function (ev) {
    ev.preventDefault();
    error.hidden = true;

    var e = email.value.trim().toLowerCase();
    var p = password.value;
    if (!e) return showError('Enter the email address you use for the shop.', email);
    if (!looksLikeEmail(e)) return showError('That does not look like an email address.', email);
    if (!p) return showError('Enter your password.', password);

    if (e !== DEMO.email.toLowerCase() || p !== DEMO.password) {
      return showError('That email and password do not match. Use the demo details shown on this page.', password);
    }

    try {
      sessionStorage.setItem('syk-signed-in', JSON.stringify({ email: DEMO.email, name: DEMO.name, at: Date.now() }));
    } catch (_) {}

    form.hidden = true;
    done.hidden = false;
    document.getElementById('loginDoneP').textContent =
      'Signed in to ' + DEMO.shop + ' as ' + DEMO.role + '.';
    done.querySelector('a').focus();
  };

  document.getElementById('signOut').onclick = function () {
    try { sessionStorage.removeItem('syk-signed-in'); } catch (_) {}
    done.hidden = true;
    form.hidden = false;
    email.focus();
  };

  email.focus();
})();
</script>`;

  return document({
    title: `Log in — ${content.brand.name}`,
    description:
      'Sign in to Shop Yangu Kenya to take sales, send M-Pesa prompts, print receipts and see your stock and daily reports.',
    page: 'login',
    body,
    bodyClass: 'page-auth',
  });
}

/* ------------------------------------------------------------------ */
/* write                                                               */
/* ------------------------------------------------------------------ */

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const pages = new Set();

function write(name, html) {
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

write('prototype.html', prototypePage());


write('spec.html', specPage());
write('login.html', loginPage());

fs.copyFileSync(path.join(root, 'src/styles.css'), path.join(dist, 'styles.css'));
fs.writeFileSync(path.join(dist, 'favicon.svg'), FAVICON);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

fs.mkdirSync(path.join(dist, 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'src/fonts'))) {
  if (f.endsWith('.woff2') || f === 'OFL.txt') {
    fs.copyFileSync(path.join(root, 'src/fonts', f), path.join(dist, 'fonts', f));
  }
}

/* 404 → home, so a mistyped URL still lands somewhere useful. */
write(
  '404.html',
  document({
    title: `Page not found — ${content.brand.name}`,
    description: 'That page does not exist. Head back to the home page or open the prototype.',
    page: '404',
    body: `<main id="main" class="missing">
  <div class="wrap">
    <p class="kicker">404</p>
    <h1 class="missing__title">That shelf is empty.</h1>
    <p class="missing__lede">The page you asked for is not here. The prototype and the spec both are.</p>
    <div class="hero__cta">
      <a class="btn btn--primary" href="index.html">Back home${icon('arrow')}</a>
      <a class="btn btn--ghost" href="prototype.html">Open the prototype</a>
    </div>
  </div>
</main>`,
  })
);

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

const assets = new Set([
  ...pages,
  'styles.css',
  'favicon.svg',
  'fonts/PublicSans-Regular.woff2',
  'fonts/PublicSans-Medium.woff2',
  'fonts/PublicSans-SemiBold.woff2',
  'fonts/PublicSans-Bold.woff2',
]);

/* Only real markup counts: skip ids/hrefs that live inside script strings. */
function anchorsOf(html) {
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return new Set([
    ...[...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
    ...[...markup.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]),
  ]);
}

for (const page of pages) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const anchors = anchorsOf(html);
  for (const m of markup.matchAll(/\shref="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:|tel:)/.test(href)) continue;
    const [rawPath, hash = ''] = href.split('#');
    const target = rawPath || page;
    if (!assets.has(target)) {
      check(false, `${page}: broken link → ${href}`);
      continue;
    }
    if (hash && target === page && !anchors.has(hash)) {
      check(false, `${page}: missing anchor → #${hash}`);
    }
    if (hash && target !== page) {
      const other = fs.readFileSync(path.join(dist, target), 'utf8');
      if (!anchorsOf(other).has(hash)) {
        // Section anchors that only exist on the home page are fine from elsewhere.
        const homeHas = anchorsOf(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')).has(hash);
        if (!homeHas || target !== 'index.html') {
          check(false, `${page}: missing anchor → ${target}#${hash}`);
        }
      }
    }
  }
  check(/<h1[ >]/.test(html), `${page}: no <h1>`);
  check(/<meta name="description" content="[^"]{20,}/.test(html), `${page}: thin description`);
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
