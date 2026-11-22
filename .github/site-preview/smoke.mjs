/**
 * Checks the *deployed* site in a real browser — the one thing a static build
 * cannot check for itself.
 *
 * Runs from .github/workflows/site-check.yml after Pages has published.
 * The GitHub-hosted Ubuntu runner already ships Chromium and Node, so this
 * installs exactly one package (playwright-core) and drives the system browser
 * instead of downloading one.
 *
 * Fails the run on: a sideways-scrolling page at 360 px or 1280 px, a JS error,
 * a missing font, a broken internal link, or a 404.
 */

import { chromium } from 'playwright-core';

const BASE = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!BASE) {
  console.error('SITE_URL is not set');
  process.exit(1);
}

const WIDTHS = [360, 768, 1280];
const PAGES = [
  // '/' is fetched and re-served with a <base> so a cached edge copy can never
  // leave us checking yesterday's markup. The rest are plain navigations.
  { path: '/', name: 'home', viaBase: true },
  { path: '/spec.html', name: 'spec' },
  { path: '/prototype.html', name: 'prototype' },
  { path: '/404.html', name: '404' },
];

const launchOptions = {
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
};

const browser = await chromium.launch(launchOptions);
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};

for (const page of PAGES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 500 ? 780 : 900 },
      deviceScaleFactor: 1,
    });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    tab.on('console', (m) => {
      if (m.type() === 'error') errors.push('console: ' + m.text());
    });
    tab.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

    let status = 200;
    if (page.viaBase) {
      const fetched = await tab.request.get(`${BASE}${page.path}`, { timeout: 45_000 });
      status = fetched.status();
      const html = await fetched.text();
      const withBase = html.replace(
        /<head([^>]*)>/i,
        `<head$1><base href="${BASE}${page.path}">`
      );
      await tab.setContent(withBase, { waitUntil: 'networkidle', timeout: 45_000 });
      await tab.evaluate(() => document.fonts.ready);
    } else {
      const res = await tab.goto(`${BASE}${page.path}`, {
        waitUntil: 'networkidle',
        timeout: 45_000,
      });
      status = res ? res.status() : 0;
    }

    if (status < 200 || status >= 400) fail(`${page.name}@${width}: HTTP ${status}`);

    const overflow = await tab.evaluate(() => {
      const doc = document.documentElement;
      const over = doc.scrollWidth - doc.clientWidth;
      if (over <= 0) return { over: 0, culprits: [] };
      const limit = doc.clientWidth;
      const culprits = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > limit + 1) {
          const id = el.id ? '#' + el.id : '';
          const cls = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : '';
          culprits.push({
            sel: el.tagName.toLowerCase() + id + cls,
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      }
      // shallowest offenders first — they are usually the cause
      return { over, culprits: culprits.slice(0, 6) };
    });
    if (overflow.over > 0) {
      const detail = overflow.culprits
        .map((c) => `${c.sel} (w ${c.width}, right ${c.right})`)
        .join('; ');
      fail(`${page.name}@${width}: scrolls sideways by ${overflow.over}px — ${detail}`);
    }

    if (page.name !== 'prototype') {
      const fontOk = await tab.evaluate(() => document.fonts.check('700 16px "Public Sans"'));
      if (!fontOk) fail(`${page.name}@${width}: Public Sans did not load`);

      const h1 = await tab.locator('h1').count();
      if (h1 !== 1) fail(`${page.name}@${width}: expected 1 <h1>, found ${h1}`);
    }

    /* Every internal link on the page must resolve. */
    const links = await tab.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !/^(https?:|mailto:|tel:|data:)/.test(h))
    );
    for (const href of [...new Set(links)]) {
      const url = new URL(href, `${BASE}${page.path}`).toString();
      const r = await tab.request.get(url);
      if (!r.ok()) fail(`${page.name}@${width}: ${href} → ${r.status()}`);
    }

    /* Inline CSS/JS is what the prototype uses; only the real pages must be
       asset-clean, so the request-failure filter is relaxed for it. */
    /* Fonts and stylesheet must never be blocked or 404. */
    const realErrors = errors.filter(
      (e) => !/favicon\.ico/.test(e) && !/404\.html/.test(e)
    );
    if (realErrors.length) fail(`${page.name}@${width}: ${realErrors.slice(0, 3).join(' | ')}`);

    console.log(`  ok ${page.name}@${width}px`);
    await ctx.close();
  }
}

/* The prototype must actually boot: its JS builds the whole app. */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}/prototype.html`, { waitUntil: 'networkidle' });
  const navItems = await tab.locator('nav a, [data-go]').count();
  const bodyText = await tab.evaluate(() => document.body.innerText);
  if (navItems < 3) fail(`prototype: navigation did not render (${navItems} items)`);
  if (!/Ksh/.test(bodyText)) fail('prototype: no money rendered — the app did not boot');
  console.log(`  ok prototype booted (${navItems} nav items)`);
  await ctx.close();
}

/* And the back-link into the site must be present. */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}/prototype.html`, { waitUntil: 'networkidle' });
  const back = await tab.locator('#protoBar a[href="index.html"]').count();
  if (back !== 1) fail('prototype: back-to-site link missing');
  await ctx.close();
}

await browser.close();

/* Annotations survive to the run's Checks tab even though the raw log lives in
   blob storage, which makes a failure readable from the API and the UI. */
for (const f of failures) {
  const one = f.replace(/\r?\n/g, ' ').slice(0, 900);
  console.log(`::error title=Live site check::${one}`);
}

if (failures) {
  console.error(`\n${failures.length} check(s) failed against ${BASE}`);
  process.exit(1);
}
console.log(`\nAll browser checks passed against ${BASE}`);
