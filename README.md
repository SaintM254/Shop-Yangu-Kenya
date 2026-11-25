# Shop Yangu Kenya

A phone-first wholesale and retail shop system for Kenya — sell, split a payment across
cash/M-Pesa/card, let a known customer go into credit, keep stock and expiry straight,
import years of old records from Excel, and print KRA eTIMS-valid receipts.
**Ksh 1,500 a month.**

This repository holds these things:

| What | Where | Why it is here |
|---|---|---|
| **The advert** — headline, what it does, the price, and one way in | `src/content.json` + `src/styles.css` + `build.js` → `dist/` | Generated, so no figure is hand-typed twice |
| **The door** — `/login/`, `/auth/link/` | `build.js` (`loginPage`, `linkPage`) | Email code or link. No password anywhere. |
| **The shop** — `/dashboard/`, `/till/`, `/stock/` … | `src/app/` → `dist/<route>/index.html` | A real front end: one shell, real addresses, no `.html` |
| **The server** — `/api/*` | `api/` | Node + Neon Postgres. Receipts, stock, credit, M-Pesa. |
| **The database** | `db/001`–`004` | 24 tables, the money-moving functions, row-level security |
| **The platform console** | `/admin/` (`adminPage()`) | Every shop, who is signed in, pause a shop |
| **How to run it** | `docs/` | Plain-language guides: Neon, Vercel, email, M-Pesa, eTIMS |
| **The build spec** — data model, import rules, traps, definition of done | `shop-yangu-kenya.md` | The prompt to hand a coding agent |

**Two pieces, one address.** The site is static files; the data lives in Neon
Postgres behind a small Node API. Both are published by **Vercel**, from this
repository, so the pages and the API share one origin — the session cookie is
first-party and the app calls `/api/…` with no base URL to configure.

**New here?** [docs/00-start-here.md](docs/00-start-here.md) takes a
non-developer from zero to a live shop with a real database. The technical
version is [docs/10-for-developers.md](docs/10-for-developers.md).

## The addresses are real addresses

| You type | You get |
|---|---|
| `/` | the advert |
| `/login/` | the door (email code) |
| `/auth/link/` | the magic-link landing |
| `/admin/` | the platform console, for super admins only |
| `/dashboard/` `/till/` `/stock/` `/purchases/` `/sales/` `/customers/` `/import/` `/reports/` `/etims/` `/settings/` `/audit/` | the shop, on that screen |
| anything else | `404.html` |

No `.html` in any link, and the address bar changes as you move around the shop — Back and
Forward work, and a screen can be bookmarked. Vercel serves static files, so each
route is a folder with an `index.html`; `build.js` writes them all from one shell. The app
itself routes in the browser (`history.pushState`), and if the folder is opened straight
from disk it falls back to `#/till` style addresses so nothing 404s.

**Previously live at:** https://saintm254.github.io/Shop-Yangu-Kenya/ — the
GitHub Pages deploy still runs and still works; Vercel is the deployment to use,
and [docs/03-vercel.md](docs/03-vercel.md) is how to set it up.

---

## Deploying it

**Vercel publishes both halves from one repository push.** Setup is four
dashboard settings and four environment variables, and
[docs/03-vercel.md](docs/03-vercel.md) walks through it click by click, written
for someone who has never deployed anything.

| Setting | Value |
|---|---|
| Framework preset | `Other` |
| Build command | `node build.js` |
| Output directory | `dist` |
| Install command | `npm install` (the default) |

Two environment variables are required:

| Environment variable | Value |
|---|---|
| `DATABASE_URL` | the **pooled** Neon string |
| `TOKEN_PEPPER` | 64 random characters — the function refuses to mint a token without one |

`NODE_ENV`, `SERVE_SITE`, `SITE_URL`, `API_URL` and `MPESA_CALLBACK_BASE` are
derived from Vercel's own environment (see `onVercel` in
`api/_lib/config.js`); set `SITE_URL` explicitly once a custom domain is
attached, so emails link to it rather than the `.vercel.app` address.

On every push to `main` Vercel builds and publishes. **One function**,
`api/index.js`, answers `/api/*` and `/pay/*` — see
[docs/10-for-developers.md](docs/10-for-developers.md) for why it is one file
and not a file per route.

### The GitHub Pages deploy still runs

`.github/workflows/pages.yml` keeps publishing to
<https://saintm254.github.io/Shop-Yangu-Kenya/> as a fallback. It needs nothing
installed — `build.js` has only the standard library. Once the Vercel site is
confirmed, delete that workflow or set **Settings → Pages → Source** to *None*.

`.github/workflows/site-check.yml` loads the live site in headless Chromium (67
assertions: no horizontal scroll at 360/768/1280 px, no JS errors, fonts
present, links resolve). It cannot be triggered by Vercel finishing, so it is
manual — or set the repository variable `SITE_URL` and it follows the site.

### If something goes wrong

[docs/09-troubleshooting.md](docs/09-troubleshooting.md) is message → fix for
every failure in the setup. The four that account for most of them:

| Symptom | Cause | Fix |
|---|---|---|
| Every page is `404: NOT_FOUND` from Vercel | Wrong output directory | Set it to `dist` and redeploy |
| `/api/health` is `500 FUNCTION_INVOCATION_FAILED` | `TOKEN_PEPPER` missing or empty | Add it, ticked for Production, then **Redeploy** |
| `/api/health` says `"ok":false` | `DATABASE_URL` wrong, or tables not built | Re-paste the pooled string; run `apply-all.sql` in Neon |
| A setting changed but nothing happened | Settings are read at build time | **Deployments → ⋯ → Redeploy** |

---

## Working on it locally

```bash
npm install             # once: the API's dependencies (an npm workspace)
node build.js           # writes dist/ and runs the checks
npm start               # the API, serving dist/ too, at http://localhost:8787
```

`npm start` runs `api/server.js`, which in development serves the built site *and*
answers `/api/*` — same origin, same as production, so sign-in behaves identically.

For the static pages alone, without the API:

```bash
node tools/serve.mjs    # serves dist/ at http://localhost:8080, folders like Pages
```

Use `tools/serve.mjs`, not a plain file server: the clean addresses only work when
`/till` redirects to `/till/` and a folder is answered with its `index.html`.

Tests:

```bash
npm run test:api        # 109 assertions, PGlite, no network
npm run test:vercel     #   7 — the Vercel adapter, driven Vercel-shaped
npm run test:sql        #   8 — the files people paste into Neon
```

### Where to change things

| To change | Edit |
|---|---|
| Any sentence on the advert — headline, body, the six cards under *What it does*, the price bullets, the two CTA labels | `src/content.json` |
| The demo email or password | `demo_account` in `src/content.json` |
| The login page's layout or behaviour | `loginPage()` in `build.js` |
| Colours, type, spacing, layout | `src/styles.css` — the palette itself is `Images/color-sytem.html`, which is the brief; the tokens copy it and must keep matching |
| Page structure, icons, the spec renderer | `build.js` |
| The spec text itself | `shop-yangu-kenya.md` (rendered to `spec.html` at build time) |
| A screen in the shop | `src/app/` — `shell.js` (routing, the collapsible rail), `pos.js`, `stock.js`, `reports.js` … |
| The shop's look | `src/app/app.css` (shares the tokens in `src/styles.css`) |
| PDF exports | `src/app/pdf.js` + the payloads in `src/app/exports.js` |
| Excel exports | `src/app/excel.js` (a real `.xlsx`, zipped in the browser) |
| The logo | `Images/Icon.svg` is the source; `src/logo/mark.svg` is the recoloured mark the site and the PDFs use. `favicon.svg` is white on nothing, for the browser tab; `apple-touch-icon.png` is the one place with a plate, because a home screen has no background of its own. The install icons (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) are rasterised from that 180 px plate by `node tools/make-pwa-icons.mjs` — there is no SVG rasteriser in the project, so the tool decodes the PNG, upscales it 3×, snaps the two flat colours and box-filters back down |
| The install prompt | `src/app/pwa.js` — the offer card and its per-browser wording, plus the service-worker registration. `src/app/sw.js` caches the shell (never shop data) and falls back to the `offline/` page. The manifest is `src/app/manifest.json` |
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
`Services`), the **what it does** band on the primary with six white cards, and the
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

These live in `src/content.json` under `demo_account`, are printed on the login page under
the form, and can be filled with one tap.

The login page is one card with two tabs — **Log in** and **Sign up** — and nothing else:
no marketing column, no bullet list. A correct password goes **straight into the shop**;
there is no "you're in" card and no second button to press. A signed-out deep link such as
`/stock/` sends you to `/login/?next=stock` and brings you back to that screen afterwards.
Sign up takes the shop's name, your name, an email and a password, and enters the shop the
same way. The demo block is one element (`.authdemo` in `loginPage()`), so deleting it later
is a one-line change. The app in this repository runs entirely in the browser, so the
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

## The till fills the screen, and the shop can install it

### Point of sale

The till is the one screen where a scroll costs money, so it is laid out as a
workbench rather than an article. On a laptop it owns the viewport: a product
grid on the left, the basket and payment on the right, and none of the two
scrolls the page — the grid and the basket list each scroll inside their own
box. The total and the Charge button therefore never move.

On a phone the same three regions stack, and the basket folds to one line
("Basket · 3 items · Ksh 340") that opens over the grid when tapped, so the
Charge button is always in reach of a thumb. A payment that is less than the
bill is a deposit on account; the till asks who is taking the credit, as it
always did.

### Installing it

The site is a PWA: `src/app/manifest.json` (standalone display, three
shortcuts — Sell, Stock, Reports), a service worker that caches the shell so
the app opens on a flaky connection, and icons at 192, 512 and a maskable 512.

Every open offers to install — on Android and desktop Chrome the offer uses the
browser's own `beforeinstallprompt`; on iPhone it explains Share → Add to Home
Screen, which is the only route Safari allows; on Firefox it points at the
menu. It is shown once per page load and never inside the rail, the till's
Charge button or an open dialog.

## Where the database plugs in

`src/app/backend.js` is the only place the app knows about a server. `BACKEND.base`
stays **empty** — same origin — because Vercel serves the pages and routes `/api/*`
to the one function. Only a split deployment (static site on one host, API on
another) sets it, from `API_URL` at build time.

It documents the exact shape `S` has to keep, the money and date rules, and the one write
that must be a transaction (a sale, its payments and the stock decrement together).
The setup — Neon, environment variables, Vercel — is
[docs/00-start-here.md](docs/00-start-here.md). Nothing
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
- **Depth is a shadow, not an outline.** Cards, tiles and white buttons rest on the sand
  page under `--shadow-1`; pop-ups and hovered cards lift to `--shadow-2`. Shadows are soft
  and never coloured. A hairline divider is for the inside of a card, not its edge.
- **Buttons are solid or white-with-a-shadow** — never an outline with a see-through fill.
  One main button per screen: primary, big, same place every time.
- **Green is only for paid.** `--success` marks money received and nothing else — not an
  "add" button, not a switch that is on. Red is only for problems.
- **Design language** — §4 of the spec, and the palette is `Images/color-sytem.html`
  ("Savanna sand"), which is the brief: sand `#F5EFE6` page, white cards, primary
  `#287094`, sidebar `#1B4A63`, accent `#D9622B`. Public Sans, 10/16/20/999 radii.

## Licence

Public Sans (SIL Open Font License 1.1) is self-hosted from `src/fonts/`; the licence is
included there as `OFL.txt`.
