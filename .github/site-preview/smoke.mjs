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

/* A crash outside the sections' own try/catch would end the run with nothing
   but an exit code: the summary loop never runs and the report looks clean.
   These two keep the reason, in the report and in the log. */
const crash = (what, err) => {
  const detail = (err && (err.stack || err.message)) || String(err);
  note(`CRASH ${what}: ${detail.split('\n').slice(0, 6).join(' / ')}`);
};
process.on('uncaughtException', (e) => { crash('uncaughtException', e); process.exit(1); });
process.on('unhandledRejection', (e) => { crash('unhandledRejection', e); process.exit(1); });

const BASE = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!BASE) {
  console.error('SITE_URL is not set');
  process.exit(1);
}

const WIDTHS = [360, 768, 1280];
/* Every address is a folder. '/dashboard/' is the app, behind the demo login. */
const PAGES = [
  // '/' is fetched and re-served with a <base> so a cached edge copy can never
  // leave us checking yesterday's markup. The rest are plain navigations.
  { path: '/', name: 'home', viaBase: true },
  { path: '/spec/', name: 'spec' },
  { path: '/login/', name: 'login' },
  { path: '/dashboard/', name: 'app', needsSignIn: true },
  { path: '/import/', name: 'import', needsSignIn: true },
  { path: '/no-such-counter/', name: '404' },
];

const launchOptions = {
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
};

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  note(`FAIL ${msg}`);
  /* Raise it as it happens, not only in the summary at the end: if a later
     section throws hard, the failures found before it must still reach the
     run's Checks tab, where they can actually be read. */
  console.log(`::error title=Live site check::${msg.replace(/\r?\n/g, ' ').slice(0, 900)}`);
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

    /* The app is behind the demo door. Sign in first, in this context, so the
       visit below is an ordinary navigation a real person could make. */
    if (page.needsSignIn) {
      await tab.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await tab.fill('#email', 'owner@shopyangu.co.ke');
      await tab.fill('#password', 'Owner@2026');
      await tab.click('#loginBtn');
      await tab.locator('#loginDone a[href$="dashboard/"]').click();
      await tab.waitForURL(/\/dashboard\/$/, { timeout: 15_000 });
      await tab.waitForTimeout(300);
    }

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

    const want = page.name === '404' ? 404 : 200;
    if (status !== want) fail(`${page.name}@${width}: HTTP ${status}, expected ${want}`);

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

    {
      const fontOk = await tab.evaluate(() => document.fonts.check('700 16px "Public Sans"'));
      if (!fontOk) fail(`${page.name}@${width}: Public Sans did not load`);

      /* One heading per page. The app keeps one per screen and shows one at a
         time, so count what is actually visible. */
      const h1 = await tab.evaluate(() =>
        [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length > 0).length
      );
      if (h1 !== 1) fail(`${page.name}@${width}: expected 1 visible <h1>, found ${h1}`);
    }

    /* The home page is an advert: no build notes, no screen inventory, and
       every call to action leads to the login page. */
    if (page.name === 'home') {
      const h1 = await tab.locator('h1').first().textContent();
      if (!/^Make the sale/.test((h1 || '').trim())) fail(`home: headline is "${(h1 || '').trim()}"`);
      const text = await tab.evaluate(() => document.body.innerText);
      for (const banned of ['Built for Kenyan wholesalers', '360 px', 'Every screen, working', 'data model', 'numeric(12,2)']) {
        if (text.includes(banned)) fail(`home: build language still on the page — "${banned}"`);
      }
      const cta = await tab.evaluate(() =>
        [...document.querySelectorAll('a.btn')]
          .filter((a) => /sign up|log in/i.test(a.textContent))
          .map((a) => a.getAttribute('href'))
      );
      if (cta.length < 2) fail(`home: expected a sign-up CTA, found ${cta.length}`);
      if (cta.some((h) => !/^(?:\.\.\/|\.\/|\/Shop-Yangu-Kenya\/)?login\/$/.test(h))) {
        fail(`home: a sign-up CTA points at ${cta.join(', ')}`);
      }
      const fileLinks = await tab.evaluate(() =>
        [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href'))
          .filter((h) => /\.html(?:[?#]|$)/.test(h))
      );
      if (fileLinks.length) fail(`home: an address still ends in .html — ${fileLinks.slice(0, 3).join(', ')}`);
      if (await tab.locator('a[href$="prototype.html"]').count()) fail('home: still links to the prototype');
      const brandMark = await tab.locator('.brand__mark svg path').count();
      if (!brandMark) fail('home: the logo mark is missing from the header');

      /* The mark is the artwork itself: no plate behind it, on the page or in
         the browser tab. */
      const plate = await tab.evaluate(() => {
        const m = document.querySelector('.brand__mark');
        if (!m) return 'missing';
        const cs = getComputedStyle(m);
        return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'background ' + cs.backgroundColor : '';
      });
      if (plate && plate !== 'missing') fail(`home: the logo still has a ${plate}`);

      /* The hero is a real photograph of a shop counter, with the headline
         beside it, per the landing reference. */
      const hero = await tab.evaluate(() => {
        const box = document.querySelector('.hero__photo');
        const img = box && box.querySelector('img');
        if (!img) return null;
        const r = box.getBoundingClientRect();
        const copy = document.querySelector('.hero__copy').getBoundingClientRect();
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          complete: img.complete && img.naturalWidth > 0,
          /* the photograph is the right-hand column, so it starts at least
             half the viewport across and overlaps the copy's own column */
          startsRight: r.left > window.innerWidth * 0.4,
          overlaps: r.left < copy.right,
          tall: r.height >= copy.height * 0.9,
        };
      });
      if (!hero) fail('home: the hero has no photograph');
      else {
        if (!hero.complete) fail('home: the hero photograph did not load');
        if (hero.w < 200 || hero.h < 120) fail(`home: the hero photograph is ${hero.w}x${hero.h}`);
        if (width >= 1000 && !(hero.startsRight && hero.overlaps && hero.tall)) {
          fail(
            `home: the hero photograph is not the right-hand column of the hero ` +
            `(w ${hero.w}, h ${hero.h}, startsRight ${hero.startsRight}, overlaps ${hero.overlaps}, tall ${hero.tall})`
          );
        }
      }
    }

    /* Import records: a template that downloads, and instructions in the
       same date format the app prints. */
    if (page.name === 'import') {
      const body = await tab.evaluate(() => document.body.innerText);
      if (/YYYY-MM-DD/.test(body)) fail('import: the instructions still ask for YYYY-MM-DD');
      if (!/DD\/MM\/YY/.test(body)) fail('import: the date format is not stated');
      const waitTpl = tab.waitForEvent('download', { timeout: 15_000 });
      await tab.click('[data-template="products"]');
      await tab.waitForTimeout(250);
      await tab.click('#dlTpl');
      const tpl = await waitTpl;
      if (!/\.xlsx$/.test(tpl.suggestedFilename())) fail(`import: the template is ${tpl.suggestedFilename()}`);
      note(`ok import template (${tpl.suggestedFilename()})`);
    }

    /* Login page: the demo account is shown, and the form refuses a wrong
       password before it accepts the right one. */
    if (page.name === 'login') {
      const body = await tab.evaluate(() => document.body.innerText);
      if (!body.includes('owner@shopyangu.co.ke')) fail('login: demo email is not on the page');
      if (!/Owner@2026/.test(body)) fail('login: demo password is not on the page');

      await tab.fill('#email', 'owner@shopyangu.co.ke');
      await tab.fill('#password', 'definitely-wrong');
      await tab.click('#loginBtn');
      await tab.waitForTimeout(150);
      if (await tab.locator('#loginError').isHidden()) fail('login: a wrong password was not refused');

      await tab.fill('#password', 'Owner@2026');
      await tab.click('#loginBtn');
      await tab.waitForTimeout(200);
      if (await tab.locator('#loginDone').isHidden()) fail('login: the demo credentials did not sign in');
      if (!(await tab.locator('#loginDone a[href$="dashboard/"]').count())) fail('login: no way through to the shop');
    }

    /* Every internal link on the page must resolve. */
    const links = await tab.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !/^(https?:|mailto:|tel:|data:)/.test(h))
    );
    for (const href of [...new Set(links)]) {
      /* An anchor is not a file: "#main" asks the document for an id. Checking
         it with a request would ask the server for /#main and get a 404. */
      if (href.startsWith('#')) {
        const id = href.slice(1);
        if (id && !(await tab.evaluate((i) => !!document.getElementById(i), id))) {
          fail(`${page.name}@${width}: ${href} points at no element on the page`);
        }
        continue;
      }
      const url = new URL(href, `${BASE}${page.path}`).toString();
      const r = await tab.request.get(url);
      if (!r.ok()) fail(`${page.name}@${width}: ${href} → ${r.status()}`);
      /* A link to a file is a link to yesterday's site: every address the
         visitor can click must be a folder, never a .html. */
      if (/\.html(?:[?#]|$)/.test(href)) fail(`${page.name}@${width}: a link still ends in .html — ${href}`);
      /* 404.html is the one page written from the site root: Pages serves it
         at whatever address was mistyped, so a relative link would resolve
         against the wrong folder. Every other page must stay relative. */
      if (page.name !== '404' && /^\/(?!\/)/.test(href)) {
        fail(`${page.name}@${width}: a link starts from the domain root — ${href}`);
      }
    }

    /* Fonts and stylesheets must never be blocked or 404. A miss while
       checking the 404 page is the point of that page: the browser logs one
       bare "Failed to load resource" for the address that 404'd, with no URL
       to filter on, so on that page alone the console message is allowed —
       every request failure is still checked, below. */
    const realErrors = errors.filter(
      (e) =>
        !/favicon\.ico/.test(e) &&
        !(page.name === '404' && (/\/no-such-counter\//.test(e) || /^console: Failed to load resource/.test(e)))
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

/* The advert's path: home -> Sign up / Log in -> the shop. Follow it once
   with real clicks, at a laptop width, exactly as a customer would. */
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await tab.locator('a.btn', { hasText: 'Sign up / Log in' }).first().click();
  await tab.waitForURL(/\/login\/$/, { timeout: 15_000 });
  await tab.fill('#email', 'owner@shopyangu.co.ke');
  await tab.fill('#password', 'Owner@2026');
  await tab.click('#loginBtn');
  await tab.waitForTimeout(250);
  await tab.locator('#loginDone a[href$="dashboard/"]').click();
  await tab.waitForURL(/\/dashboard\/$/, { timeout: 15_000 });
  await tab.waitForTimeout(500);
  const booted = await tab.locator('#rail .navlink').count();
  if (booted < 8) fail(`path home -> login -> shop: the shop did not boot (${booted} links)`);
  note(`ok path home -> login -> shop (${booted} rail links after sign-in)`);
  await ctx.close();
} catch (e) {
  fail(`path home -> login -> shop: ${e.message.split('\n')[0]}`);
}

/* The shop itself: it boots, its addresses are real addresses, the rail
   collapses, the till lets a cashier name the customer, and every date reads
   DD/MM/YY. One context, signed in through the real form. */
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const tab = await ctx.newPage();
  await tab.goto(`${BASE}/login/`, { waitUntil: 'networkidle' });
  await tab.fill('#email', 'owner@shopyangu.co.ke');
  await tab.fill('#password', 'Owner@2026');
  await tab.click('#loginBtn');
  await tab.locator('#loginDone a[href$="dashboard/"]').click();
  await tab.waitForURL(/\/dashboard\/$/, { timeout: 15_000 });
  await tab.waitForTimeout(400);

  const railItems = await tab.locator('#rail .navlink').count();
  const tabItems = await tab.locator('#tabbar button').count();
  if (railItems < 8) fail(`app: rail did not render (${railItems} links, expected 11 for an owner)`);
  if (tabItems < 4) fail(`app: tab bar did not render (${tabItems} items, expected 5)`);
  const bodyText = await tab.evaluate(() => document.body.innerText);
  if (!/Payment goal|Total Balance|Sales today/i.test(bodyText)) fail('app: dashboard did not paint');
  if (!/Ksh/.test(bodyText)) fail('app: no money rendered — the app did not boot');

  /* The rail collapses, and the choice survives a reload. */
  await tab.click('#railToggle');
  await tab.waitForTimeout(250);
  const closed = await tab.getAttribute('#app', 'data-rail');
  if (closed !== 'closed') fail(`app: the menu did not collapse (data-rail=${closed})`);
  const widthClosed = await tab.evaluate(() => document.getElementById('rail').getBoundingClientRect().width);
  await tab.reload({ waitUntil: 'networkidle' });
  await tab.waitForTimeout(300);
  const stillClosed = await tab.getAttribute('#app', 'data-rail');
  if (stillClosed !== 'closed') fail('app: the collapsed menu was forgotten after a reload');
  await tab.click('#railToggle');
  await tab.waitForTimeout(200);
  const widthOpen = await tab.evaluate(() => document.getElementById('rail').getBoundingClientRect().width);
  if (!(widthClosed < widthOpen - 80)) fail(`app: collapsed rail is ${Math.round(widthClosed)}px, open is ${Math.round(widthOpen)}px`);

  /* Click a rail link by its label; the address must change with it. */
  const gotoRoute = async (label, url) => {
    await tab.evaluate((text) => {
      const b = [...document.querySelectorAll('#rail .navlink')]
        .find((el) => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
      if (b) b.click();
    }, label);
    await tab.waitForTimeout(300);
    if (url && !new RegExp(url + '/$').test(tab.url())) fail(`app: ${label} did not move to /${url}/ (${tab.url()})`);
  };

  await gotoRoute('Point of sale', 'till');
  if (!(await tab.locator('#posCustomer').count())) fail('app: the till has no customer control');

  await gotoRoute('Sales', 'sales');
  const salesText = await tab.evaluate(() => document.querySelector('#s-sales').innerText);
  const shortDates = salesText.match(/\b\d{2}\/\d{2}\/\d{2}\b/g) || [];
  const longDates = salesText.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
  if (!shortDates.length) fail('app: no DD/MM/YY dates found on Sales');
  if (longDates.length) fail(`app: ${longDates.length} date(s) still show a 4-digit year`);

  /* Status must read at full strength: no tinted capsule behind a pill. */
  const tintedPills = await tab.evaluate(() =>
    [...document.querySelectorAll('.pill')].filter((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }).length
  );
  if (tintedPills) fail(`app: ${tintedPills} pill(s) still painted a tinted background`);

  /* Every export is a menu of exactly two: a PDF and an Excel file. Both must
     really download, from the shop's own data. */
  await gotoRoute('Stock', 'stock');
  const menus = await tab.locator('[data-menu]').count();
  if (menus < 1) fail('app: no export menu on Stock');
  await tab.click('#s-inventory [data-menu-btn]');
  await tab.waitForTimeout(150);
  const choices = await tab.locator('#s-inventory [data-menu-pop] button').count();
  if (choices !== 2) fail(`app: the export menu offers ${choices} choices, expected 2`);
  if (!(await tab.locator('#s-inventory [data-export="products"][data-format="pdf"]').count())) fail('app: no PDF export');
  if (!(await tab.locator('#s-inventory [data-export="products"][data-format="xlsx"]').count())) fail('app: no Excel export');

  const grab = async (selector) => {
    const wait = tab.waitForEvent('download', { timeout: 15_000 });
    await tab.click(selector);
    const dl = await wait;
    const file = await dl.path();
    const size = fs.statSync(file).size;
    return { name: dl.suggestedFilename(), size };
  };
  await tab.click('#s-inventory [data-menu-btn]');
  const pdf = await grab('#s-inventory [data-export="products"][data-format="pdf"]');
  if (!/\.pdf$/.test(pdf.name) || pdf.size < 3000) fail(`app: the PDF export is wrong (${pdf.name}, ${pdf.size} bytes)`);
  if (pdf.size > 40_000) fail(`app: the PDF is ${pdf.size} bytes — the logo may be inlined twice`);
  await tab.click('#s-inventory [data-menu-btn]');
  const xls = await grab('#s-inventory [data-export="products"][data-format="xlsx"]');
  if (!/\.xlsx$/.test(xls.name) || xls.size < 1500) fail(`app: the Excel export is wrong (${xls.name}, ${xls.size} bytes)`);

  /* A receipt is a till slip, not a report: the PDF is 80mm wide (227pt) and
     only as long as the sale, and it carries the mark. */
  await gotoRoute('Point of sale', 'till');
  await tab.evaluate(() => {
    const add = document.querySelector('#s-pos [data-add]');
    if (add) add.click();
  });
  await tab.click('#completeSale');
  await tab.waitForTimeout(400);
  const waitSlip = tab.waitForEvent('download', { timeout: 15_000 });
  await tab.click('#pdfReceipt');
  const slipDl = await waitSlip;
  const slipPath = await slipDl.path();
  const slipBuf = fs.readFileSync(slipPath);
  if (!/\.pdf$/.test(slipDl.suggestedFilename())) fail(`app: the receipt is not a PDF (${slipDl.suggestedFilename()})`);
  /* MediaBox [0 0 226.77 335] — 80mm wide, and shorter than an A4 page. */
  const box = /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(slipBuf.toString('latin1'));
  if (!box) fail('app: the receipt PDF has no page box');
  else {
    const w = Number(box[1]), h = Number(box[2]);
    if (Math.abs(w - 226.77) > 1) fail(`app: the receipt is ${w.toFixed(1)}pt wide, not 80mm (226.8pt)`);
    if (h > 820) fail(`app: the receipt is ${h.toFixed(0)}pt tall — it was laid out for A4`);
  }
  note(`ok receipt slip (${slipDl.suggestedFilename()}, ${Math.round(slipBuf.length / 1024)} kB, ${box ? Math.round(Number(box[1])) + 'x' + Math.round(Number(box[2])) + 'pt' : '?'})`);

  /* Settings: a person's name is editable, and renaming the owner renames
     them in the rail without a reload. */
  await gotoRoute('Settings', 'settings');
  if (!(await tab.locator('[data-user-name]').count())) fail('app: user names are not editable in Settings');
  const field = tab.locator('[data-user-name="u2"]');
  await field.fill('Otieno Were (Till 1)');
  await field.blur();
  await tab.waitForTimeout(250);
  const kept = await tab.inputValue('[data-user-name="u2"]');
  if (kept !== 'Otieno Were (Till 1)') fail(`app: the renamed user came back as "${kept}"`);

  /* The mark in the rail goes to the dashboard. It must never sign anyone out. */
  await gotoRoute('Audit log', 'audit');
  await tab.click('.railbrand');
  await tab.waitForTimeout(350);
  if (!/\/dashboard\/$/.test(tab.url())) fail(`app: the logo went to ${tab.url()}, not the dashboard`);
  if (!(await tab.locator('#rail .navlink').count())) fail('app: clicking the logo signed the shop out');

  note(`ok app booted (${railItems} rail links, ${tabItems} tabs, ${shortDates.length} DD/MM/YY dates)`);
  note(`ok exports (${pdf.name} ${Math.round(pdf.size / 1024)} kB, ${xls.name} ${Math.round(xls.size / 1024)} kB)`);
  await ctx.close();
} catch (e) {
  fail(`app: threw — ${e.message.split('\n')[0]}`);
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
