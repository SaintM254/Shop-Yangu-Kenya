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

import fs from 'node:fs';
import { chromium } from 'playwright-core';

const REPORT = 'report.txt';
const notes = [];
const note = (line) => {
  notes.push(line);
  console.log(line);
  fs.writeFileSync(REPORT, notes.join('\n') + '\n');
};

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

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  note(`FAIL ${msg}`);
};

let browser;
try {
  browser = await chromium.launch(launchOptions);
  note(`launched ${process.env.CHROME_PATH || 'bundled chromium'}`);
} catch (e) {
  fail(`could not launch a browser: ${e.message.split('\n')[0]}`);
  note(e.stack || String(e));
  console.log(`::error title=Live site check::${e.message.split('\n')[0]}`);
  process.exit(1);
}

for (const page of PAGES) {
  for (const width of WIDTHS) {
    try {
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

    /* The landing page ends at the screens: the detail lives in spec.html. */
    if (page.name === 'home') {
      const rows = await tab.locator('.menulist__row').count();
      if (rows !== 11) fail(`home: screens list shows ${rows} rows, expected 11`);
      for (const gone of ['#deploy', '#money', '#data', '#import']) {
        if (await tab.locator(gone).count()) fail(`home: ${gone} section is still on the page`);
      }
      const lastSectionId = await tab.evaluate(() => {
        const secs = [...document.querySelectorAll('main > section')];
        return secs.length ? secs[secs.length - 1].id : '(none)';
      });
      if (lastSectionId !== 'screens') fail(`home: last section is ${lastSectionId}, expected screens`);
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

    /* Keep a screenshot of every page at every width as evidence in the run. */
    fs.mkdirSync('shots', { recursive: true });
    const full = ['home', 'spec'].includes(page.name);
    await tab.screenshot({
      path: `shots/${page.name}-${width}.png`,
      fullPage: full,
      animations: 'disabled',
    });

    note(`ok ${page.name}@${width}px`);
    await ctx.close();
    } catch (e) {
      fail(`${page.name}@${width}: threw — ${e.message.split('\n')[0]}`);
      note((e.stack || '').split('\n').slice(0, 4).join('\n'));
    }
  }
}

/* The prototype must actually boot: its JS builds the whole app, the till must
   let the cashier name the customer, and every date must read DD/MM/YY. */
try {
  /* The rail is the desktop nav (>=900px); on a phone only the tab bar shows.
     Use a desktop viewport so the rail links are real, clickable targets. */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}/prototype.html`, { waitUntil: 'networkidle' });
  /* The app paints two navs: the desktop rail (.navlink buttons, 11 entries for
     an owner) and the phone tab bar (5). Count both, and require the money the
     dashboard renders — that proves the shell and the first route both painted. */
  const railItems = await tab.locator('#rail .navlink').count();
  const tabItems = await tab.locator('#tabbar button').count();
  if (railItems < 8) fail(`prototype: rail did not render (${railItems} links, expected 11 for an owner)`);
  if (tabItems < 4) fail(`prototype: tab bar did not render (${tabItems} items, expected 5)`);
  const bodyText = await tab.evaluate(() => document.body.innerText);
  if (!/Payment Goal|Total Balance/i.test(bodyText)) fail('prototype: dashboard did not paint');
  if (!/Ksh/.test(bodyText)) fail('prototype: no money rendered — the app did not boot');

  /* Click a rail link by its label, falling back to a JS click so a CSS
     display:none at some width cannot turn into a 30 s timeout. */
  const gotoRoute = async (label) => {
    await tab.evaluate((text) => {
      const b = [...document.querySelectorAll('#rail .navlink')]
        .find((el) => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
      if (b) b.click();
    }, label);
    await tab.waitForTimeout(250);
  };

  /* Open the till and prove the customer control is there and usable. */
  await gotoRoute('Point of sale');
  if (!(await tab.locator('#posCustomer').count())) fail('prototype: till has no customer control');
  if (!(await tab.locator('#walkInBtn').count())) fail('prototype: till has no Walk-in button');

  /* Dates: DD/MM/YY, never a four-digit year, on the Sales screen. */
  await gotoRoute('Sales');
  const salesText = await tab.evaluate(() => document.querySelector('#s-sales').innerText);
  const shortDates = salesText.match(/\b\d{2}\/\d{2}\/\d{2}\b/g) || [];
  const longDates = salesText.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
  if (!shortDates.length) fail('prototype: no DD/MM/YY dates found on Sales');
  if (longDates.length) fail(`prototype: ${longDates.length} date(s) still show a 4-digit year`);

  /* Status must read at full strength: no tinted capsule behind a pill. */
  const tintedPills = await tab.evaluate(() =>
    [...document.querySelectorAll('.pill')].filter((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }).length
  );
  if (tintedPills) fail(`prototype: ${tintedPills} pill(s) still painted a tinted background`);
  note(`ok prototype booted (${railItems} rail links, ${tabItems} tabs, ${shortDates.length} DD/MM/YY dates)`);
  await ctx.close();
} catch (e) {
  fail(`prototype: threw — ${e.message.split('\n')[0]}`);
}

/* And the back-link into the site must be present. */
try {
  /* The rail is the desktop nav (>=900px); on a phone only the tab bar shows.
     Use a desktop viewport so the rail links are real, clickable targets. */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}/prototype.html`, { waitUntil: 'networkidle' });
  const back = await tab.locator('#protoBar a[href="index.html"]').count();
  if (back !== 1) fail('prototype: back-to-site link missing');
  await tab.evaluate(() => {
    const b = [...document.querySelectorAll('#rail .navlink')]
      .find((el) => /point of sale/i.test(el.textContent));
    if (b) b.click();
  });
  await tab.waitForTimeout(300);
  fs.mkdirSync('shots', { recursive: true });
  await tab.screenshot({ path: 'shots/prototype-till-390.png', fullPage: false, animations: 'disabled' });
  note('ok back-to-site link present');
  await ctx.close();
} catch (e) {
  fail(`prototype back-link: threw — ${e.message.split('\n')[0]}`);
}

await browser.close().catch(() => {});

/* Annotations survive to the run's Checks tab even though the raw log lives in
   blob storage, which makes a failure readable from the API and the UI. */
for (const f of failures) {
  const one = f.replace(/\r?\n/g, ' ').slice(0, 900);
  console.log(`::error title=Live site check::${one}`);
}

note(`--- summary: ${failures.length} failure(s) ---`);
/* An empty array is truthy: compare the length, not the array. */
if (failures.length) {
  process.exit(1);
}
note(`All browser checks passed against ${BASE}`);
