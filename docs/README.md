# Shop Yangu Kenya — running the real thing

The app is a static site on GitHub Pages. It has no database of its own, so
there are two pieces:

```
  browser ──▶ GitHub Pages (the pages, the CSS, app.js)
     │
     └──────▶ Node API (api/)  ──▶  Neon Postgres
```

This folder is the order to build that in, and the reasons behind the choices
you are about to make.

| | Question | File |
|---|---|---|
| 1 | Where does the data live? | [01-neon-setup.md](01-neon-setup.md) |
| 2 | What do I run, and in what order? | [02-run-order.md](02-run-order.md) |
| 3 | How does the published page find the API? | [03-link-the-page.md](03-link-the-page.md) |
| 4 | How do people sign in, with no passwords? | [04-email-sign-in.md](04-email-sign-in.md) |
| 5 | How does each shop take M-Pesa? | [05-mpesa-tills.md](05-mpesa-tills.md) |
| 6 | What can a platform admin see? | [06-super-admin.md](06-super-admin.md) |
| 7 | When does a receipt go to KRA? | [07-etims-later.md](07-etims-later.md) |

## What exists already

- **`db/`** — four SQL files, applied in order and once each:
  `001_schema.sql` (tables), `002_functions.sql` (the functions that move
  money and stock), `003_rls.sql` (row-level security: a shop can only ever
  see its own rows), `004_seed_demo.sql` (a demo shop with fourteen days of
  trading).
- **`api/`** — a small Node server, no framework, that connects to Neon as
  `syk_app` and answers `/api/*`.
- **`scripts/`** — `db-migrate.js`, `db-seed.js`, `make-super-admin.js`.
- **the site** — `build.js` writes `dist/`, which is what Pages publishes.

## Three decisions worth knowing before you start

**No passwords.** People sign in with a six-digit code or a link, emailed. A
shopkeeper in Mombasa does not need another password, and there is no password
database to leak. See [04](04-email-sign-in.md).

**The server numbers receipts, not the till.** Two tills numbering their own
receipts will eventually print the same number twice, and that number is the
one a customer brings back. So the till prints a provisional number, posts the
sale, and the receipt card on screen is corrected the moment the API answers.
The sale, its lines, its payments and the stock decrement happen in one
transaction — see `record_sale()` in `db/002_functions.sql`.

**A failed connection does not lose a sale.** The till sells anyway and queues
the sale in the browser; it replays when the connection returns. Nothing is
renumbered on replay, because the API never used the till's number.

## The shortest path to a working shop

```bash
# 1. a Neon project, then its two connection strings
#    (see 01-neon-setup.md)

# 2. the schema
node scripts/db-migrate.js --check     # what would run
node scripts/db-migrate.js             # run it

# 3. a shop to look at
node scripts/db-seed.js                # demo shop + demo@shopyangu.co.ke

# 4. the API, serving the built site
cd api && npm install && npm start     # http://localhost:8787
```

Then open <http://localhost:8787/login/>, enter `demo@shopyangu.co.ke`, and
read the code off the terminal. With `EMAIL_DRIVER=console` that is the whole
"email" — nothing is sent anywhere.

Full detail, including every environment variable, is in
[02-run-order.md](02-run-order.md).
