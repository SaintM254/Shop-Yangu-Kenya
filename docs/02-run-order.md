# 2 · What to run, and in what order

Three terminals, or three commands. The order matters only once, on a new
machine.

## Once

```bash
# 1. database: schema, then demo data
node scripts/db-migrate.js
node scripts/db-seed.js

# 2. API dependencies
cd api && npm install
```

Optional: a platform admin, if `db-seed.js` was run with `--no-admin`.

```bash
node scripts/make-super-admin.js you@example.com "Your Name"
```

## Every time you work on it

```bash
node build.js                 # writes dist/
cd api && npm run dev         # http://localhost:8787, restarts on save
```

`npm run dev` serves `dist/` itself when `SERVE_SITE=true`, so one port is
enough: the pages and `/api/*` come from the same origin, and cookies need no
special spelling. That is the setup to develop against.

## What each command does

| Command | What it does |
|---|---|
| `node build.js` | Writes `dist/` — 18 pages, the CSS, `app/app.js` (every `src/app/*.js` concatenated in dependency order), the PWA manifest and worker, `404.html`, `offline/`. **Fails** on a broken internal link, a class with no CSS rule, a page with no `<h1>`, and an inline script that is not valid JavaScript. |
| `cd api && npm test` | 109 assertions against an in-process PGlite database. No Neon account needed. |
| `node scripts/db-migrate.js --check` | Lists the SQL files that would run. Changes nothing. |
| `node scripts/db-migrate.js` | Applies them, each in one transaction. |
| `node scripts/db-seed.js` | The demo shop: 20 products, 6 customers, 14 days. Idempotent. |
| `node scripts/make-super-admin.js <email> "<name>"` | Adds or promotes a platform admin. |

## Without Neon

Set `DATABASE_DRIVER=pglite` and run the same migrate and seed commands. PGlite
is Postgres compiled to WebAssembly, running from a folder on disk — the same
SQL, the same functions, no network.

```ini
DATABASE_DRIVER=pglite
PGLITE_DIR=/tmp/shop-yangu
```

Two things it cannot do: `pgcrypto` and `citext` (the migration script rewrites
those two `create extension` lines), and real concurrency — PGlite has one
connection, so transactions are serialized. Good enough to develop and test
against; not what you deploy.

## Environment variables that matter

Everything is listed and explained in `api/.env.example`. The ones people
actually change:

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | — | The **pooled** Neon string. |
| `DATABASE_DRIVER` | `postgres` | `pglite` for a laptop. |
| `TOKEN_PEPPER` | — | Signs session tokens. Changing it signs everyone out. |
| `SITE_URL` | `http://localhost:8787` | Where the app lives; used for the links in emails. |
| `API_URL` | `http://localhost:8787` | Where this API is reachable publicly. M-Pesa callbacks are built from it. |
| `EMAIL_DRIVER` | `console` | `console` prints codes to the terminal; `smtp` sends them. |
| `SERVE_SITE` | `false` | Serve `dist/` from the API, so one port does everything. |
| `CORS_ORIGINS` | — | Only if the site and the API are on different domains. |
| `OTP_MAX_PER_WINDOW` | `5` | How many codes one address may request in `OTP_WINDOW_MINUTES`. |

## The tests, and what they are for

```bash
cd api && npm test
```

`api/test/run.js` starts the real server against PGlite and talks to it the way
the app does: sign up, sign in, sell, oversell, take credit, pay it back, open
the admin console, pause a shop. It asserts on the numbers that matter — the
first receipt is `S-0001`, VAT on a 480 sale is 66.21, the shelf goes 40 → 36,
and a sale refused by the server is refused with a message naming the product.

It is fast (about three seconds) because there is no network in it.

## A sanity check before you deploy

```bash
node build.js && (cd api && npm test)
```

Both must be green. The build catches the mistakes a browser reports as
"something went wrong" and nothing else; the tests catch the ones that would
take a shop's money twice.
