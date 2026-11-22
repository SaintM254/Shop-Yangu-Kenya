# Shop Yangu Kenya

A phone-first wholesale and retail shop system for Kenya — sell, split a payment across
cash/M-Pesa/card, let a known customer go into credit, keep stock and expiry straight,
import years of old records from Excel, and print KRA eTIMS-valid receipts.
**Ksh 1,500 a month.**

This repository holds two things:

| What | Where | Why it is here |
|---|---|---|
| **The product page** — what the system is, the eleven screens, the money rules, the deploy guide | `src/content.json` + `src/styles.css` + `build.js` → `dist/` | Generated, so no figure is hand-typed twice |
| **The reference prototype** — every screen, working, in one self-contained file | `shop-yangu-kenya.html` | The truth when the spec is ambiguous |
| **The build spec** — roles, data model, import rules, traps, definition of done | `shop-yangu-kenya.md` | The prompt to hand a coding agent |

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
node build.js          # writes dist/ and runs the checks
npx serve dist         # or: python3 -m http.server -d dist 8080
```

No install step. Node 20 or newer.

### Where to change things

| To change | Edit |
|---|---|
| Any sentence on the product page, the screens list, the money rules, the deploy copy | `src/content.json` |
| Colours, type, spacing, layout | `src/styles.css` |
| Page structure, icons, the spec renderer | `build.js` |
| The spec text itself | `shop-yangu-kenya.md` (rendered to `spec.html` at build time) |
| The prototype | `shop-yangu-kenya.html` (copied to `prototype.html`) |

The price is read from `plan.price_kes` in `src/content.json` — change it to `1200` and
every mention of Ksh 1,500 updates, exactly the rule the product itself has to obey.

### What the build refuses to publish

`node build.js` exits non-zero — and so the deploy stops — if any page:

- links to a file that is not in `dist/`, or to an anchor that does not exist;
- has no `<h1>`, or a description shorter than 20 characters;
- loads an asset from anywhere other than this site (fonts are self-hosted on purpose);
- contains an unescaped `undefined`, `NaN`, `[object Object]` or a leaked `${`.

Two renderers are checked this way: `index.html` and `spec.html` (including the markdown
converter, which is why a broken table or an unclosed code fence cannot slip through).

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

## What the page says, and where it comes from

- **Eleven screens** — §5 of `shop-yangu-kenya.md`, with the sales-role variant of each.
- **Money rules** — §8: inclusive 16% VAT (`total × 16 / 116`), `change = max(0, paid − total)`,
  `credit = max(0, total − paid)`, round the line then sum.
- **Import rules** — §7.1: `dd/mm/yyyy` is the Kenyan convention and is never read as
  `mm/dd`; a sale dated in the future is rejected, an expiry date in the future is fine.
- **Data model** — §6, including the four rules that matter: snapshotted sale lines,
  never-reused receipt numbers, a derived-but-stored `customer.balance`, and an explicit
  `sale.credit_amount`.
- **Design language** — §4: Public Sans, flat surfaces with no shadows, 10/16/20/999 radii,
  1 px sand borders, cerulean `#287094` on navy `#023246`.

## Licence

Public Sans (SIL Open Font License 1.1) is self-hosted from `src/fonts/`; the licence is
included there as `OFL.txt`.
