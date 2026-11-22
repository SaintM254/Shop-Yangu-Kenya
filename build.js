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
    ['#features', 'Features'],
    ['#screens', 'Screens'],
    ['#money', 'Money rules'],
    ['#deploy', 'Deploy'],
    ['spec.html', 'Spec'],
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
    <a class="btn btn--primary btn--sm hdr__cta" href="prototype.html">
      <span class="cta-full">Open prototype</span><span class="cta-short">Prototype</span>${icon('arrow', 'ic ic--sm')}
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
        <p class="ftr__h">The product</p>
        <a href="prototype.html">Working prototype</a>
        <a href="spec.html">Build spec</a>
        <a href="${here('#screens')}">All eleven screens</a>
      </div>
      <div>
        <p class="ftr__h">The price</p>
        <p class="ftr__price num">${kes(content.plan.price_kes)} <span>/ ${escapeHtml(content.plan.period)}</span></p>
        <a href="${here('#deploy')}">How this site deploys</a>
      </div>
      <div>
        <p class="ftr__h">Shop details</p>
        <p class="ftr__meta">${escapeHtml(content.brand.phone)}</p>
        <p class="ftr__meta">KRA PIN ${escapeHtml(content.brand.kra)}</p>
      </div>
    </div>
  </div>
  <div class="wrap ftr__base">
    <p>Static site on GitHub Pages · built and deployed by GitHub Actions · ${new Date().toISOString().slice(0, 10)}</p>
    <p>Prototype data is sample data. Reloading resets it.</p>
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

const mock = `
<div class="mock" role="img" aria-label="A mock of the Shop Yangu Kenya dashboard: a payment goal card reading Ksh 63,130 today, a takings sparkline, and four stat cards.">
  <div class="mock__bar">
    <span class="mock__mark" aria-hidden="true">${icon('box', 'ic ic--sm')}</span>
    <span class="mock__title">Shop Yangu</span>
    <span class="mock__pill">Owner</span>
  </div>
  <div class="card goal">
    <div class="goal__top">
      <span class="goal__label">Payment Goal</span>
      <span class="goal__btn" aria-hidden="true">${icon('arrow', 'ic ic--sm')}</span>
    </div>
    <p class="goal__caption">Total Balance</p>
    <p class="goal__amount num">${kes(63130)}<span>.00</span></p>
    <p class="goal__delta num"><span class="delta delta--up">▲ 12.4%</span> vs yesterday</p>
    ${sparkline}
    <div class="goal__actions">
      <span class="pillbtn pillbtn--fill">Sell now ${icon('arrow', 'ic ic--sm')}</span>
      <span class="pillbtn">Take payment</span>
    </div>
  </div>
  <div class="mock__stats num">
    <div class="mini"><span>Sales today</span><strong>63,130</strong><em class="delta delta--up">▲ 12.4%</em></div>
    <div class="mini"><span>Gross profit</span><strong>14,902</strong><em class="delta delta--down">▼ 3.1%</em></div>
    <div class="mini"><span>Receipts</span><strong>38</strong><em class="delta delta--up">▲ 6</em></div>
    <div class="mini"><span>Owed to you</span><strong>21,480</strong><em class="delta delta--down">▼ 1.8%</em></div>
  </div>
  <div class="mock__row">
    <span class="tag tag--warn">Low stock</span>
    <span class="mock__rowtext">Unga Jogoo 2kg · 4 left</span>
  </div>
  <div class="mock__row">
    <span class="tag tag--ok">eTIMS</span>
    <span class="mock__rowtext">37 sent · 1 waiting</span>
  </div>
</div>`;

const receiptMock = `
<div class="receipt" aria-label="Example of a rendered receipt">
  <p class="receipt__shop">${escapeHtml(content.brand.name)}</p>
  <p class="receipt__meta">${escapeHtml(content.brand.branch)} · ${escapeHtml(content.brand.phone)}<br />KRA PIN ${escapeHtml(content.brand.kra)}</p>
  <p class="receipt__no num">Receipt 00124 · 22/11/2026 14:08</p>
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
      <p class="eyebrow"><span class="eyebrow__dot" aria-hidden="true"></span>${escapeHtml(content.hero.eyebrow)}</p>
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
<section class="sec" id="features">
  <div class="wrap">
    <header class="sec__head">
      <p class="kicker">What it does</p>
      <h2 class="sec__title">Six things the till gets right, and most systems don't.</h2>
      <p class="sec__lede">Every one of these is a working screen in the prototype, not a roadmap promise. The constraints that shaped them: most users are on a phone, and money must be honest.</p>
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

const screens = `
<section class="sec sec--tint" id="screens">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      <div>
        <p class="kicker">The product</p>
        <h2 class="sec__title">Eleven screens, each checked at 360 px.</h2>
        <p class="sec__lede">One column under 900 px with a five-item bottom tab bar and a drawer for the rest; from 900 px a 248 px navy rail replaces both. Nothing scrolls sideways except the category chips.</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="prototype.html">Open the prototype ${icon('arrow', 'ic ic--sm')}</a>
    </header>
    <ol class="screens">
      ${content.screens
        .map(
          (s) => `<li class="screen">
        <div class="screen__top">
          <span class="screen__n num">${s.n}</span>
          <h3 class="screen__name">${escapeHtml(s.name)}</h3>
          <span class="tag ${s.audience === 'Owner' ? 'tag--owner' : 'tag--both'}">${escapeHtml(s.audience)}</span>
        </div>
        <p class="screen__body">${escapeHtml(s.body)}</p>
        ${s.sales ? `<p class="screen__sales"><strong>Sales role</strong>${escapeHtml(s.sales)}</p>` : ''}
      </li>`
        )
        .join('\n      ')}
    </ol>
  </div>
</section>`;

const money = `
<section class="sec" id="money">
  <div class="wrap">
    <header class="sec__head">
      <p class="kicker">Money rules</p>
      <h2 class="sec__title">${escapeHtml(content.money.title)}</h2>
      <p class="sec__lede">${escapeHtml(content.money.body)}</p>
    </header>
    <div class="money">
      <div class="card formula">
        <p class="card__h">Formulas</p>
        <dl class="formula__list num">
          ${content.money.formulas
            .map(
              ([name, expr]) =>
                `<div class="formula__row"><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(expr)}</dd></div>`
            )
            .join('\n          ')}
        </dl>
        <p class="formula__foot">VAT is inclusive at 16%. Kenyan prices are quoted inclusive, so tax is never added on top at the till.</p>
      </div>
      <div class="cases">
        ${content.money.cases
          .map(
            (c) => `<article class="case case--${c.tone}">
          <h3 class="case__title">${escapeHtml(c.title)}</h3>
          <p class="case__body">${escapeHtml(c.detail)}</p>
          <p class="case__result num">${escapeHtml(c.result)}</p>
        </article>`
          )
          .join('\n        ')}
      </div>
    </div>
  </div>
</section>`;

const importing = `
<section class="sec sec--tint" id="import">
  <div class="wrap">
    <header class="sec__head sec__head--split">
      <div>
        <p class="kicker">Migration</p>
        <h2 class="sec__title">Years of old records, in three sheets.</h2>
        <p class="sec__lede">Each template is a real <code>.xlsx</code> with a coloured header row — not a CSV renamed. Preview and a full validation report come before any write, and the whole batch can be undone in one action.</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="spec.html#7-excel-import-and-branded-export">Read the import spec ${icon('arrow', 'ic ic--sm')}</a>
    </header>
    <div class="templates">
      ${content.import_section.templates
        .map(
          (t) => `<article class="template">
        <div class="template__head">
          <span class="template__icon" aria-hidden="true">${icon('upload')}</span>
          <h3>${escapeHtml(t.sheet)}</h3>
          <span class="mono-chip">.xlsx</span>
        </div>
        <p class="template__cols mono">${escapeHtml(t.columns)}</p>
      </article>`
        )
        .join('\n      ')}
    </div>
    <div class="rules">
      <p class="rules__h">Date handling is where migrations go wrong, so it has explicit rules</p>
      <ul class="checks">
        ${content.import_section.rules
          .map((r) => `<li>${icon('check', 'ic ic--sm')}<span>${escapeHtml(r)}</span></li>`)
          .join('\n        ')}
      </ul>
    </div>
  </div>
</section>`;

const dataModel = `
<section class="sec" id="data">
  <div class="wrap">
    <header class="sec__head">
      <p class="kicker">Data model</p>
      <h2 class="sec__title">Sixteen tables, and four rules that matter more than the rest.</h2>
      <p class="sec__lede">${escapeHtml(content.data_model.note)}</p>
    </header>
    <div class="data">
      <div class="codeblock codeblock--sql">
        <span class="codeblock__lang">sql</span>
        <pre><code>${escapeHtml(content.data_model.sql)}</code></pre>
      </div>
      <ul class="checks checks--stack">
        ${content.data_model.rules
          .map((r) => `<li>${icon('check', 'ic ic--sm')}<span>${escapeHtml(r)}</span></li>`)
          .join('\n        ')}
      </ul>
    </div>
  </div>
</section>`;

const deploy = `
<section class="sec sec--dark" id="deploy">
  <div class="wrap">
    <header class="sec__head sec__head--light">
      <p class="kicker kicker--light">Deployment</p>
      <h2 class="sec__title">Built and published by GitHub Actions.</h2>
      <p class="sec__lede">${escapeHtml(content.deploy.summary)}</p>
    </header>

    <div class="deploy">
      <div class="manual">
        <p class="manual__label">${icon('gear', 'ic ic--sm')} One manual step, once</p>
        ${content.deploy.manual_steps
          .map(
            (s, n) => `<div class="manual__step">
          <span class="manual__n num">${n + 1}</span>
          <div>
            <p class="manual__where">${escapeHtml(s.where)}</p>
            <p class="manual__action">${escapeHtml(s.action)}</p>
            <p class="manual__note">${escapeHtml(s.note)}</p>
          </div>
        </div>`
          )
          .join('')}
        <div class="pagespanel" role="img" aria-label="The GitHub Pages settings panel with Source set to GitHub Actions, as in the reference screenshot.">
          <p class="pagespanel__h">GitHub Pages</p>
          <p class="pagespanel__sub">Build and deployment</p>
          <p class="pagespanel__field">Source</p>
          <span class="pagespanel__select">GitHub Actions</span>
          <p class="pagespanel__note">Exactly what you are looking for in <span class="mono">Settings → Pages</span>. The workflow does the rest; no branch folder, no <span class="mono">/docs</span> setting.</p>
        </div>
      </div>

      <div class="automatic">
        <p class="automatic__label">${icon('rocket', 'ic ic--sm')} Everything after that is automatic</p>
        <ol class="automatic__list">
          ${content.deploy.automatic.map((a) => `<li>${escapeHtml(a)}</li>`).join('\n          ')}
        </ol>
        <div class="codeblock codeblock--dark">
          <span class="codeblock__lang">.github/workflows/pages.yml</span>
          <pre><code>${escapeHtml(
            [
              'on:',
              '  push:',
              '    branches: [main]',
              '  workflow_dispatch:',
              '',
              'permissions:',
              '  contents: read',
              '  pages: write',
              '  id-token: write',
              '',
              'concurrency:',
              '  group: pages',
              '  cancel-in-progress: false',
              '',
              'jobs:',
              '  build:',
              '    runs-on: ubuntu-latest',
              '    steps:',
              '      - uses: actions/checkout@v4',
              '      - uses: actions/setup-node@v4',
              '        with: { node-version: 24 }',
              '      - run: node build.js',
              '      - uses: actions/upload-pages-artifact@v3',
              '        with: { path: dist }',
              '',
              '  deploy:',
              '    needs: build',
              '    runs-on: ubuntu-latest',
              '    environment: github-pages',
              '    steps:',
              '      - uses: actions/deploy-pages@v4',
            ].join('\n')
          )}</code></pre>
        </div>
      </div>
    </div>

    <div class="urls">
      <div class="url">
        <p class="url__label">Where it lands</p>
        <p class="url__value mono">https://saintm254.github.io/Shop-Yangu-Kenya/</p>
      </div>
      <div class="url">
        <p class="url__label">Every run prints this</p>
        <p class="url__value mono">"The deployment is available at …"</p>
      </div>
      <div class="url">
        <p class="url__label">Rolling back</p>
        <p class="url__value">Re-run any earlier successful workflow run, or revert the commit — every deploy is an artifact of a commit.</p>
      </div>
    </div>

    <details class="trouble">
      <summary>If the deploy step fails, read this first</summary>
      <dl>
        <div><dt>“Get Pages site failed” or “Not Found” at deploy</dt><dd>Source is still set to “Deploy from a branch”. Set it to <strong>GitHub Actions</strong>, then re-run the workflow.</dd></div>
        <div><dt>Website shows 404</dt><dd>The artifact must contain <code>index.html</code> at its root. <code>build.js</code> writes exactly that into <code>dist/</code>.</dd></div>
        <div><dt>Nothing runs on push</dt><dd>Actions may be disabled on a fork or a fresh repo. Repository → Settings → Actions → General → allow actions.</dd></div>
        <div><dt>Fonts look wrong</dt><dd>Public Sans is self-hosted from <code>dist/fonts/</code>; no Google Fonts request is made, as the design language requires.</dd></div>
      </dl>
    </details>

    <p class="deploy__foot">${escapeHtml(content.footer.note)}</p>
  </div>
</section>`;

const indexBody = `
<main id="main">
  ${hero}
  ${statsStrip}
  ${features}
  ${screens}
  ${money}
  ${importing}
  ${dataModel}
  ${deploy}
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
