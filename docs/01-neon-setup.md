# 1 · Where the data lives: Neon

Neon is Postgres, hosted. The free tier is enough to run a shop: it sleeps
after a few minutes idle and wakes on the next query, which for a shop means a
slow first sale in the morning and normal speed after.

## What you need from Neon

Two connection strings, and they are **not** the same string:

| Use | Where it comes from | Why |
|---|---|---|
| **Pooled** — the API | Connection Details → **Pooled connection** | Every serverless request may be a new process. The pooler keeps the real connection count low. |
| **Direct** — migrations | Connection Details → **Direct connection** | DDL through a pooler can land on a different backend halfway through a script. |

Both look like:

```
postgresql://USER:PASSWORD@ep-something-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

The pooled one has `-pooler` in the host. Keep `sslmode=require`; Neon refuses
plain connections.

## Fill in `api/.env`

```bash
cp api/.env.example api/.env
```

Only these are required to get a shop selling:

```ini
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_DRIVER=postgres
TOKEN_PEPPER=<64 random hex characters>
SITE_URL=http://localhost:8787
API_URL=http://localhost:8787
EMAIL_DRIVER=console
```

Generate the pepper with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**This value is what makes a session token hard to guess.** Changing it signs
everyone out, which is exactly what you want if it ever leaks.

## Run the migrations

```bash
node scripts/db-migrate.js --check    # lists what would be applied
node scripts/db-migrate.js            # applies it, each file in one transaction
```

`db-migrate.js` uses the **direct** string. It keeps a table called
`app_schema` recording which file was applied and a checksum of it, so running
it twice does nothing the second time, and an edited file is reported rather
than silently ignored.

What the four files do, and why the order matters:

| File | What it creates |
|---|---|
| `001_schema.sql` | 24 tables. `pending_signups` comes before `login_codes` and `login_tokens` because those reference it. |
| `002_functions.sql` | `next_receipt_no`, `apply_stock`, `record_sale`, `mpesa_start`, `mpesa_complete`, `recalc_customer_balance`, and the reporting views. |
| `003_rls.sql` | Row-level security on every table, the `syk_app` role, and the `security definer` functions the app is allowed to call. |
| `004_seed_demo.sql` | `seed_demo()` and `create_super_admin()` — the functions, not the data. |

`003` recreates some functions that `002` defined, adding the grants. If you
ever apply them out of order you get a database that looks fine until the
first sale fails. Use the script.

## A shop to look at

```bash
node scripts/db-seed.js
```

That creates one shop with 20 products, 6 customers and fourteen days of
trading (about 260 receipts), owned by `demo@shopyangu.co.ke`. It returns early
if the shop already exists, so it is safe to run twice.

```bash
node scripts/db-seed.js --email owner@mydemo.co.ke   # a different owner
node scripts/db-seed.js --no-admin                   # no platform admin
```

## The database user the app runs as

The API connects as **`syk_app`**, not as the owner. `syk_app`:

- has no `bypassrls`, so row-level security always applies;
- cannot `drop`, `alter` or truncate anything;
- reaches the money-moving functions only through `security definer` grants.

Migrations run as the owner. The app never does. That split is the reason a
bug in a route cannot delete a shop's history.

## Rotating the connection string

Change `DATABASE_URL` in `api/.env` and restart the API. There is nothing in
the database to change; sessions live in the database and survive.

## Checking it is healthy

```bash
curl -s localhost:8787/api/health | python3 -m json.tool
```

```json
{
  "ok": true,
  "database": { "driver": "postgres", "ok": true },
  "mail": { "driver": "console", "ok": true, "note": "codes are printed to the server log" },
  "mpesa": { "environment": "sandbox", "callbackConfigured": false }
}
```

`ok: false` with a `database.error` means the connection string is wrong or the
project is asleep and refusing — the error text says which.
