# Shop Yangu Kenya

A phone-first wholesale and retail shop system for Kenya — sell, split a payment across
cash/M-Pesa/card, let a known customer go into credit, keep stock and expiry straight,
import years of old records from Excel, and print KRA eTIMS-valid receipts.
**Ksh 1,500 a month.**

This repository holds three things:

| What | Where | Why it is here |
|---|---|---|
| **The advert** — headline, what it does, the price, and one way in | `src/content.json` + `src/styles.css` + `build.js` → `dist/` | Generated, so no figure is hand-typed twice |
| **The door** — `/login/` | `build.js` (`loginPage`) + `content.demo_account` | Demo credentials in one place, shown on the page |
| **The shop** — `/dashboard/`, `/till/`, `/stock/` … | `src/app/` → `dist/<route>/index.html` | A real front end: one shell, real addresses, no `.html` |
| **The build spec** — the single login, data model, import rules, traps, definition of done | `shop-yangu-kenya.md` | The prompt to hand a coding agent |

## The addresses are real addresses

| You type | You get |
|---|---|
| `/` | the advert |
| `/login/` | the door |
| `/dashboard/` `/till/` `/stock/` `/purchases/` `/sales/` `/customers/` `/import/` `/reports/` `/etims/` `/settings/` `/audit/` | the shop, on that screen |
| anything else | `404.html` |

No `.html` in any link, and the address bar changes as you move around the shop — Back and
Forward work, and a screen can be bookmarked. GitHub Pages serves static files, so each
route is a folder with an `index.html`; `build.js` writes them all from one shell. The app
itself routes in the browser (`history.pushState`), and if the folder is opened straight
from disk it falls back to `#/till` style addresses so nothing 404s.

**Live site:** https://saintm254.github.io/Shop-Yangu-Kenya/

---

## Deploying it — one manual setting, then nothing

### 1. The one thing you must turn on by hand

> **Repository → Settings → Pages → Build and deployment → Source = `GitHub Actions`**

That is the only manual step, and it is the setting in your screenshot. Without it the
workflow still builds happily and then fails at the deploy step with
`Get Pages site failed` / `Not Found`.

Check it in one command if you prefer the API:

```bash
gh api repos/SaintM254/Shop-Yangu-Kenya/pages --jq '.build_type'
# "workflow"  → already correct
# "legacy"    → set Source to GitHub Actions in the UI
```

On this repository `build_type` is already `workflow`, so **nothing needs clicking** —
pushing to `main` publishes.

### 2. Everything else is automatic

| On | What happens |
|---|---|
| Push to `main` | `.github/workflows/pages.yml` builds and deploys |
| Pull request to `main` | Builds and runs the checks, **but does not deploy** |
| Actions → *Build and deploy site* → *Run workflow* | Manual rebuild of the current `main` |
| After a successful deploy | `.github/workflows/site-check.yml` loads the live site in Chromium at 360 / 768 / 1280 px |

The deploy job: `actions/checkout@v7` → `actions/setup-node@v7` (Node 24) →
`actions/configure-pages@v6` → `node build.js` → `actions/upload-pages-artifact@v5` →
`actions/deploy-pages@v5` → prints the live URL to the run summary.

There is **no `npm install`** anywhere in the build. `build.js` uses only the Node
standard library, so there is no lockfile to drift and no registry outage that can break
a deploy.

### 3. If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `Get Pages site failed` / `Not Found` on the deploy step | Source is still *Deploy from a branch* | Set Source to **GitHub Actions**, re-run |
| The site 404s but the run is green | The artifact has no `index.html` at its root | `build.js` writes exactly that into `dist/`; check the upload step points at `dist` |
| Nothing runs on push | Actions disabled for the repo/fork | Settings → Actions → General → allow actions |
| The build fails with `✗ … broken link` | A page links to a file that is not built | Fix the link; the build is deliberately strict |
| Fonts look like Times | `dist/fonts/` missing from the artifact | `src/fonts/*.woff2` must be committed |

---

## Working on it locally

```bash
node build.js           # writes dist/ and runs the checks
node tools/serve.mjs    # serves dist/ at http://localhost:8080, folders like Pages
```

No install step. Node 20 or newer. Use `tools/serve.mjs`, not a plain file server: the
clean addresses only work when `/till` redirects to `/till/` and a folder answered with
its `index.html`, and that is what it does.

### Where to change things

| To change | Edit |
|---|---|
| Any sentence on the advert — headline, body, the six cards under *What it does*, the price bullets, the two CTA labels | `src/content.json` |
| The demo email or password | `demo_account` in `src/content.json` |
| The login page's layout or behaviour | `loginPage()` in `build.js` |
| Colours, type, spacing, layout | `src/styles.css` |
| Page structure, icons, the spec renderer | `build.js` |
| The spec text itself | `shop-yangu-kenya.md` (rendered to `spec.html` at build time) |
| A screen in the shop | `src/app/` — `shell.js` (routing, the collapsible rail), `pos.js`, `stock.js`, `reports.js` … |
| The shop's look | `src/app/app.css` (shares the tokens in `src/styles.css`) |
| PDF exports | `src/app/pdf.js` + the payloads in `src/app/exports.js` |
| Excel exports | `src/app/excel.js` (a real `.xlsx`, zipped in the browser) |
| The logo | `Images/Icon.svg` is the source; `src/logo/mark.svg` is the recoloured mark the site and the PDFs use. `favicon.svg` is white on nothing, for the browser tab; `apple-touch-icon.png` is the one place with a plate, because a home screen has no background of its own |
| The hero | `Images/Mobile POS Receipt Mockup.png`, trimmed and re-encoded by `tools/make-pos-mock.mjs` into `src/pos-mock.webp` (1065 wide, ~128 kB, transparency kept) so a phone never downloads the 1 MB original. It tilts and lifts on scroll and settles under the pointer — the motion lives in `src/styles.css` (`.hero__mock`) and the small script in the hero. Its size is proportional, never a fixed pixel width: a `min(42%, 404px)` column inside the hero grid, so its height tracks the copy block's at every width (the smoke check fails if that ratio drifts outside 0.8–1.25) |
| The prototype (kept for reference) | `shop-yangu-kenya.html` — no longer published |

The price is read from `plan.price_kes` in `src/content.json` — change it to `1200` and
every mention of Ksh 1,500 updates, exactly the rule the product itself has to obey.

### What the build refuses to publish

`node build.js` exits non-zero — and so the deploy stops — if any page:

- links to a file that is not in `dist/`, or to an anchor that does not exist;
- has no `<h1>`, or a description shorter than 20 characters;
- loads an asset from anywhere other than this site (fonts are self-hosted on purpose);
- contains an unescaped `undefined`, `NaN`, `[object Object]` or a leaked `${`;
- puts `.html` in a link anywhere. That is the file, not the site.

### The browser check

`build.js` can prove the HTML is well-formed; it cannot prove the page does not scroll
sideways on a 360 px phone. `.github/site-preview/smoke.mjs` does that against the
**published** URL in a real browser, using the Chromium that already ships on the
GitHub-hosted runner — one package installed (`playwright-core`), no browser download.
It fails on sideways scroll at 360/768/1280 px, any JS error, a font that did not load,
an internal link that 404s, or a prototype that did not boot.

Run it yourself against any URL:

```bash
cd .github/site-preview
npm install --no-save playwright-core@1
SITE_URL=https://saintm254.github.io/Shop-Yangu-Kenya CHROME_PATH=/usr/bin/google-chrome node smoke.mjs
```

---

## The home page is an advert

Its reader is a shop owner behind a counter, not the engineer who built the system. So it
carries three sections and nothing else: the **hero** (headline, lede, `Signup/Login` and
`Services`), the **what it does** band on the cerulean with six cream cards, and the
**plan** card that ends the page above the footer. No screen counts, no pixel widths, no
database notes, no prototype link — and no stats strip or dark counter demo, which were
removed so the page reads top to bottom in one pass.

All of that engineering detail still exists, one click away in `/spec/` and in the shop
itself; it is just not what sells a till.

### Demo sign-in

**One login per shop.** This account is the shop's only sign-in — everyone at the counter
uses it. There are no staff accounts, no roles and nothing to switch between, which is the
whole point: one shop, one password to manage.

| | |
|---|---|
| Email | `owner@shopyangu.co.ke` |
| Password | `Owner@2026` |

These live in `src/content.json` under `demo_account`, are printed on the login page, and
can be filled with one tap. The app in this repository runs entirely in the browser, so the
page checks the pair in JavaScript and sets a `sessionStorage` flag — **it is a
demonstration of the flow, not a security boundary.** A real deployment would post to an
API that returns a JWT in an httpOnly cookie, as §9 of the spec describes.

## Exports: a PDF and an Excel file, everywhere

Every export control is a menu with exactly two answers, and both are real files built in
the browser from the shop's own data — no server, no print dialog:

| | How | What you get |
|---|---|---|
| **PDF** | `src/app/pdf.js` writes the PDF byte by byte | A4, cream, one rule colour, the logo top-left, a summary band, a clean table, page numbers. Long lists break across pages properly |
| **Excel** | `src/app/excel.js` zips the workbook itself | A real `.xlsx`: frozen styled header, money as numbers Excel can add, print setup, one sheet per section |

A **receipt** is the exception, on purpose. It is not a report shrunk to fit a roll: the
same writer has a second layout that draws an **80mm thermal slip** — one column, centred,
top-down, as long as the sale needs and no longer. `src/app/pdf.js` picks it from
`sheet: 'receipt'`, and the page box is written as 226.77pt wide (80mm) rather than A4.
Printing a receipt from the till does the same thing in the browser: `pos.js` writes an
`@page{size:80mm auto}` rule for the length of the print, so the dialog comes up on the
roll, not on A4. Reports still print A4.

The mark sits on the paper itself, in the shop's navy — **no tinted plate behind it**, in
the PDF, in the browser tab (`favicon.svg` is the white mark with no background) and in the
app. `node tools/make-logo.mjs` regenerates every logo asset from `Images/Icon.svg`.

### Arrows say which way the file goes

| Icon | Means | Where |
|---|---|---|
| arrow down into a tray | **download** — a file comes to you | templates, and every button that saves a file |
| arrow up out of a tray | **upload** — a file goes in | importing a sheet |
| arrow leaving a box | **export** — the shop's data goes out | every export menu |

They sit on top of `exports.js`, which turns the live data into rows. When Postgres arrives
that is the only file that has to learn where the rows come from — and `src/app/backend.js`
is already the seam for it (see below).

## Where the database plugs in

`src/app/backend.js` is the only place the app knows about a server:

```js
BACKEND.base = 'https://api.shopyangu.co.ke';  // the new API
BACKEND.live = true;                            // and the screens keep working
```

It documents the exact shape `S` has to keep, the money and date rules, and the one write
that must be a transaction (a sale, its payments and the stock decrement together). Nothing
in `shell.js`, the screens or the exports needs changing: `load()` fills `S` before the
first paint, `save()` writes changes back, and `persist()` is already called from the till.

## Conventions the product follows everywhere

- **Dates are DD/MM/YY** — `20/11/26`, never a four-digit year, on receipts, lists,
  ledgers, exports, the import templates and the site footer alike. The importer reads
  that shape, and `YYYY-MM-DD` for sheets Excel has already rewritten.
- **Codes are generated, not demanded.** Leave a product's `sku` or a sale's `receipt_no`
  blank in an import and the app numbers it (`GRC-001`, `R-2101`) instead of rejecting the
  row. A code a shop typed is never overwritten.
- **The import template and the importer come from one schema.** `SCHEMAS` in
  `src/app/import.js` is the only list of columns; the workbook, the guide sheet, the CSV
  and the reader are all generated from it, so they cannot drift apart. The template
  downloads as a real `.xlsx` with a second "How to fill it" sheet, and as a CSV.
- **The customer is on the receipt.** The till has a Customer card: search the list, add
  someone new on the spot, or type a name for a walk-in. A walk-in keeps no balance, so it
  can never take credit — the credit sheet asks for a named customer instead.
- **Status is a small square and a word**, at full colour: no tinted capsules, no faded
  text. **Icons are plain line glyphs** with no disc, tile or ring behind them, and they
  point the way they read — import goes *into* the tray, export comes *out*.
- **Surfaces are flat.** Depth is the cream/paper contrast, not an outline on every card.
- **Design language** — §4 of the spec: Public Sans, 10/16/20/999 radii, cerulean
  `#287094` on navy `#023246`.

## Licence

Public Sans (SIL Open Font License 1.1) is self-hosted from `src/fonts/`; the licence is
included there as `OFL.txt`.
