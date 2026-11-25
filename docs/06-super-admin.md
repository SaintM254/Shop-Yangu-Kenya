# 6 · The platform console

The super admin is a different sign-in, at a different page, with a different
job:

- **A shop owner** runs one shop. They see products, sales, customers, money.
- **A super admin** runs the platform. They see which shops exist, who is
  signed in, whether a shop has gone quiet — and **not one shilling** of any
  shop's takings beyond a total.

That line is enforced in the database, not in a template.

## Creating one

```bash
node scripts/make-super-admin.js you@example.com "Your Name"
```

There is no API route for this, on purpose: an account that can read every shop
should be created by whoever holds the connection string, not by a request.

If the address already owns a shop, the script asks before promoting it, and
detaches it from that shop — because a super admin belongs to no shop
(`login_role = 'super_admin'`, `shop_id = null`).

## Signing in

Sign in at **`/admin/`**, not `/login/`. The console has its own doors:

```
POST /api/admin/signin          { email }   → sends a code
POST /api/admin/signin/verify   { email, code }
POST /api/admin/link            { token }
```

And it refuses an ordinary owner's code-granting path: a shop owner signing in
at `/api/auth/signin` is sent to the dashboard, never to the console.

Before the code is entered, `GET /api/admin/overview` answers **401**, even to
someone holding a valid shop session. Tested, in `api/test/run.js`.

## What the console shows

```
GET /api/admin/overview
```

```json
{
  "admin": { "name": "Platform admin", "email": "admin@shopyangu.co.ke" },
  "totals": {
    "shops": 3, "liveLogins": 2, "salesToday": 41,
    "salesAll": 1284000, "creditOut": 22400, "newShops7d": 1
  },
  "sessions": [
    { "id": "…", "email": "…", "shopName": "Bahari Duka",
      "device": "Chrome on Android", "at": "…" }
  ],
  "shops": [
    { "id": "…", "name": "…", "branch": "Mombasa Branch",
      "ownerEmail": "…", "suspended": false, "liveSessions": 1,
      "products": 20, "sales": 263 }
  ],
  "generatedAt": "…"
}
```

- **Totals** — shops, live logins, sales today, all-time gross, credit
  outstanding across the platform, and shops that joined in the last week. A
  number, not a chart.
- **Who is signed in** — every live session, by device. `?all=1` includes the
  ones that have ended.
- **Every shop** — its owner's email and name, when they were last seen,
  whether the shop is paused, how many sessions are live, and two counts
  (products, sales) that answer "is it being used at all?".

### Opening one shop

```
GET /api/admin/shops/:id
```

Returns the shop's name, owner, plan dates and its tills — enough to answer a
support call ("your till is configured, so the problem is the phone"). It does
**not** return products, sales lines or customer records. A super admin cannot read a shop's books; `GET /api/bootstrap` for a
super-admin session answers **403**.

That is not an oversight to be fixed later. It is the promise that makes the
console acceptable to a shop owner.

## Pausing a shop

```
POST /api/admin/shops/:id/pause   { reason }
POST /api/admin/shops/:id/resume
```

Pausing is used for an unpaid subscription, a duplicate account, or a shop
that has asked to be switched off for a while. It does two things at once:

1. `shops.suspended_at` is set, so the shop's pages can say so.
2. **Every live session in that shop is ended immediately.** Not on the next
   request — now.

After that:

- a request with an old cookie gets **401**;
- a fresh sign-in gets **403** with a message that says the shop is paused and
  who to contact, rather than a bare "wrong code" that sends someone round in
  circles.

Resume reverses it; the owner signs in again and is back at the till.

Because pausing ends sessions, it is not a way to "nudge" a shop. It is a way
to stop one.

## Ending a session

```
POST /api/admin/sessions/:id/end
```

For the case where a shopkeeper's phone was stolen — end that session without
pausing the whole shop.

## Where the console lives

`build.js` writes `/admin/` and `/admin/link/`. The page is its own document:
no shop navigation, no till, and a link at the foot back to the shop side. It
polls `overview` every 30 seconds while it is open, so the session list is
roughly live without a websocket.

Its styles are in `src/styles.css` under the `.page-admin` block, and its
script is inline in the page — it never loads the shop's `app.js`, so an admin
is not one bug away from a till's state.
