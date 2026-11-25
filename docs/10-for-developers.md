# 10 · For developers

Everything the other guides deliberately left out. Hand this page to whoever
picks up the code.

If you are not writing code, you do not need this page — and you have not missed
a step by skipping it.

---

## The shape

One Vercel project, one domain, one serverless function.

```
                    https://your-address
                            │
        ┌───────────────────┴────────────────────┐
        │                                        │
   /  /login/  /app/*                     /api/*   /pay/*
   static files from dist/                 api/index.js
   (Vercel CDN, cached)                    (one Node function)
                                                │
                                          @neondatabase/serverless
                                                │
                                          Neon Postgres
                                        (pooled connection)
```

Same origin for both halves. That is deliberate: the session cookie is
first-party, so there is no CORS and no `SameSite=None` juggling, and the client
calls `fetch('/api/…')` with no base URL.

---

## Why `api/index.js` and not `api/[...path].js`

In a non-framework Vercel project, **every top-level entry in `api/` becomes its
own function**, and a catch-all `api/[...path].js` only receives a
**single-segment** filesystem route — `/api/auth/signin` does not reach it.

So: one function, `api/index.js`, plus a rewrite in `vercel.json`:

```json
{ "source": "/api/:path*", "destination": "/api/index.js?__path=/:path*" },
{ "source": "/pay/:path*", "destination": "/api/index.js?__path=/pay/:path*" }
```

**The `__path` parameter is not decoration.** Depending on the runtime, a rewrite
can hand the function either the original URL or the *destination* — and with
the destination, every route 404s while the deploy looks healthy. So the
rewrite carries the real path in a query parameter, and `realUrl()` in
`api/index.js` puts it back before the router runs, keeping the caller's own
query string (`?all=1`, `?productId=…`) alongside it. If the runtime passes the
original URL through, `__path` is absent, the URL is already right, and nothing
happens.

`api/_test/vercel.js` asserts all four shapes route identically, because none of
them can be reproduced locally.

A value of `__path` that does not begin `/api` or `/pay`, or that contains
`..`, is discarded — the request then 404s normally rather than being steered
somewhere else.

**Folders starting with `_` are not deployed as functions.** That is why the
shared code lives in `api/_lib/`, the routes in `api/_routes/`, and the tests in
`api/_test/`. Without the underscore, Vercel would try to deploy every one of
those files as a broken function and blow through the twelve-function free-plan
cap.

## The adapter

`api/server.js` exports `handleRequest(req, res)` — the whole router, written
against Node's `http` objects. `api/index.js` translates:

- **Request:** Vercel may hand you a body that it has already parsed and a
  stream that is already drained. The adapter rebuilds a `Readable` from
  `req.body` when one exists, so `readJson()` in `_lib/http.js` works unchanged.
- **Response:** newer runtimes give `.status()/.send()`; older ones give a real
  `http.ServerResponse`. The adapter detects which and either passes it through
  or wraps it in a shim supporting `writeHead`, `setHeader`, `write`, `end`.

`api/_test/vercel.js` drives the real handler with Vercel-shaped objects — seven
assertions covering GET, a POST with a pre-parsed body, a nested route, the
router's own 404, and the Node-style response path.

```bash
npm run test:vercel
```

## Configuration

`api/_lib/config.js` detects `VERCEL=1` and adjusts three defaults:

| Setting | On Vercel | Elsewhere |
|---|---|---|
| `NODE_ENV` | `production` | `development` |
| `SERVE_SITE` | `false` | `true` |
| `SITE_URL`, `API_URL`, `MPESA_CALLBACK_BASE` | derived from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` | `http://localhost:8787` |

So a deploy needs only two mandatory variables, `DATABASE_URL` and
`TOKEN_PEPPER`. **`TOKEN_PEPPER` is required at import time** — a missing one
crashes the function on cold start, which surfaces as
`500 FUNCTION_INVOCATION_FAILED` on every request rather than a friendly error.

## Install

`api` is an npm workspace of the root package:

```json
{ "workspaces": ["api"] }
```

Dependency installation for a non-framework project happens at the repo root,
so a workspace is the way to get `api`'s dependencies installed without a custom
install command. `package-lock.json` at the root covers both.

## The build

`build.js` has no dependencies and writes all nineteen pages to `dist/`.

```bash
node build.js                      # SITE_URL defaults to the old Pages address
SITE_URL=https://shop.example.com node build.js
```

It fails the build on an `<h1>`-less page, a link to a file that was not built,
a missing anchor, an unstyled class, a syntax error in any inline script, or an
external asset. That is why a broken page never reaches production.

The canonical tag follows `SITE_URL`, so the same build works at a domain root
or under a sub-folder. The link pages sit two levels deep and carry their own
entry in `DEPTHS`.

## The database

```bash
# Local scripts need Node 22+.
npm install
node scripts/build-sql.js            # regenerates db/apply-*.sql
node scripts/sql-check.mjs           # runs them against PGlite, twice
npm run test:sql                     # both of the above
```

| Script | What it does |
|---|---|
| `scripts/build-sql.js` | Combines `db/001…003` into `db/apply-all.sql`, plus the demo and admin files. Each is a single transaction wrapped in a `DO` block that checks `app_schema` first, so running it twice is a no-op. |
| `scripts/sql-check.mjs` | Runs the generated files in order, asserts the resulting shop (20 products, hundreds of sales, an admin with no shop), then runs all three again and asserts nothing changed. |
| `scripts/db-migrate.js` | The tracked alternative, for terminals. Same `app_schema` table, so the two methods know about each other. `--check`, `--seed`, `--fresh`. |

Both paths write `app_schema`, so pasting in the Neon SQL editor and running
`db-migrate.js` later coexist.

Two things to know about `db/002_functions.sql`:

- `select (fn(args)).*` calls the function once per output column. Use
  `select x.* from fn(...) x`.
- PGlite has one connection, so `tx()` must serialize. The test harness does.

## Tests

```bash
npm run test:api       # 109 assertions, PGlite, no network
npm run test:vercel    #   7 assertions, the Vercel adapter
npm run test:sql       #   8 assertions, the paste-into-Neon files
node build.js          # 19 pages + all static checks
```

The API suite sets `OTP_MAX_PER_WINDOW` high enough not to 429 itself. Any
`db/*.sql` change needs a fresh `PGLITE_DIR` — the harness rewrites the
`pgcrypto` and `citext` extension lines because PGlite lacks them.

## Splitting the site from the API

The old shape — static site on GitHub Pages, API elsewhere — still works, and is
what you need if you want a commercially-free static host instead of Vercel Pro.

1. Build with the API's address: `API_URL=https://api.example.com node build.js`.
2. Set on the API: `CORS_ORIGINS=https://site.example.com`,
   `COOKIE_DOMAIN=.example.com`, `NODE_ENV=production`, `SERVE_SITE=0`.
3. The session cookie becomes cross-site: `SameSite=None; Secure`, which
   requires HTTPS on both ends and does not work on `http://localhost`.
4. M-Pesa callbacks still come to the API host, so `MPESA_CALLBACK_BASE` must be
   that host — and still must not contain `mpesa`, `m-pesa` or `safaricom`.

More moving parts, one more thing to break. Prefer the single-origin setup.

## GitHub Actions

`.github/workflows/pages.yml` still publishes to GitHub Pages on every push to
`main`, as a fallback. It needs nothing installed — `build.js` has no
dependencies.

`.github/workflows/site-check.yml` loads the live site in headless Chromium (67
browser assertions: no horizontal scroll at 360/768/1280 px, no JS errors,
fonts present, links resolve). It cannot be triggered by Vercel finishing, so it
is manual, or you can set a repository variable `SITE_URL` and it follows the
site.

**To stop publishing to Pages**, once Vercel is confirmed live: delete
`.github/workflows/pages.yml`, or in **Settings** → **Pages** set the source to
**None**. The Vercel deploy does not depend on it either way.

## Layout

```
build.js                 the whole site generator, zero dependencies
src/                     content.json, styles.css, app/*.js — the sources
dist/                    built output, gitignored, Vercel's output directory
api/index.js             the single Vercel function + Node/Vercel adapter
api/server.js            the router; exports handleRequest(server, res)
api/_lib/                config, db, http, auth, mail, emails, shape, sql-split
api/_routes/             auth, shop, bootstrap, mpesa, admin
api/_test/               run.js (109), vercel.js (7)
db/001…004               schema, functions, RLS, demo seed
db/apply-*.sql           generated; the files people paste into Neon
scripts/                 build-sql, sql-check, db-migrate, db-seed, make-super-admin
vercel.json              rewrites, redirects, headers, function settings
```

## Things that are easy to get wrong

- **Template literals in `build.js` eat `\` and `\n`** — escape as `\\\\` and
  `\\\\n`.
- **`all checks passed` does not prove an asset was written.** Diff the output
  file list against a known-good build after touching `build.js`.
- **`settings` and `shop` endpoints are PATCH-only.** A POST 404s silently.
- **Do not invent JSON in docs.** Check `api/_lib/shape.js` first.
- **A static host answers every POST with 405.** Any code touching `/api/` must
  tolerate that.
- **Assertions naming an exact product set break** when a later test group adds
  products — assert the negative instead.

## eTIMS

Scaffolded, not integrated: `etims_transmissions` records attempts, VAT is
correct and tested, nothing is transmitted. See [07-etims.md](07-etims.md) for
what a real integration needs — a registered VSCU first, then signing, then the
`saveTrnsSalesOsdc` call.
