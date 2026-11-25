# Neon Auth — the one job this shop gives it

**Short answer: it is optional, it is safe, and it does exactly one thing —
it sends and checks the six-digit code that creates a shop.** If you would
rather not use it, do nothing: the shop sends that code itself.

This page exists because the Neon console offers an **Auth** button right next
to the database, and it is worth knowing what it is for before you decide.

---

## What Neon Auth is

Neon Auth is a real product. Neon runs a copy of a sign-in service (Better Auth)
inside your Neon project and gives you:

- sign-up and sign-in screens
- emailed one-time codes and verified email addresses
- session handling
- the users themselves, in a `neon_auth` schema **inside your database**

If you were building an app from nothing, it would save you a week.

---

## What this shop does with it, and nothing more

**It sends the first code, and it checks that the code came back.**

That is the whole of it. Concretely, when somebody fills in the sign-up form:

1. This server creates the shop's pending sign-up, with the password already
   hashed, and its own code and link in reserve.
2. If `NEON_AUTH_BASE_URL` is set, the server asks **Neon Auth** to email a
   verification code to that address, and waits for the answer.
3. If Neon says yes, the person's email comes from Neon. When they type it, the
   server asks **Neon Auth** whether it is right.
4. If Neon says no — not configured, unreachable, slow, or refusing — the server
   does what it did before: emails **its own** six-digit code, and checks that.

Either way the result is the same: a real shop, a real login row, and a person
signed in. **The safety rules are unchanged**, because Neon Auth only ever
answers the question "is this code right?". It cannot create a session, and it
never touches a shop's data.

### Why bother at all

Because it removes the one thing that used to block a brand-new shop: **you had
to connect an email provider before you could create an account.** Neon Auth
holds a sender for you, so day one works with two settings instead of nine.

### Why the rest of the shop does not use it

Every screen in the till asks one question before it shows anything: *which shop
is this?* The database answers from a session cookie **this** server issued, and
then eleven rules let that shop see only its own products, sales, customers and
credit. Those rules read the `logins` table — a login row *is* the link between a
person and a shop.

Neon Auth's users live in a different table, in a different schema, and know
nothing about shops. A person signed in by Neon Auth alone would be signed in to
*nothing*, because no rule would match them. So Neon Auth is not the front door;
it is a helper who confirms a code at the door.

> **The arrangement to avoid** is the tempting one: wiring `neon_auth.users` to
> this app's tables so a Neon session counts as a shop session. That is how a
> person could reach shop data without the shop id the rules check for — which
> is exactly the leak the rules exist to prevent. This shop does not do it, and
> does not need to.

---

## Turning it on

Only if you want day-one sign-up without a mailer of your own.

1. Neon console → your `shop-yangu` project → **Auth** in the left sidebar.
2. Press **Enable** / **Set up Auth** and accept the defaults.
3. When it is ready, the page shows a **Base URL** like
   `https://ep-something-….neon.tech/neondb/auth`.
4. Vercel → your project → **Settings** → **Environment Variables** → add:

   | Key | Value |
   |---|---|
   | `NEON_AUTH_BASE_URL` | that Base URL |

5. **Redeploy.**

To check it took, open `/api/health` and look for `auth`:

```json
"auth":{"driver":"neon-auth","ok":true,"host":"ep-…neon.tech"}
```

`"driver":"none"` means the setting is not there, and codes come from your own
mailer instead — which is a perfectly good setup.

---

## Turning it off

Remove `NEON_AUTH_BASE_URL` from Vercel and redeploy. That is the whole
procedure.

Nothing is lost: the shop falls back to sending its own codes, and every account
created while Neon Auth was on keeps working, because every account that exists
is a row in `logins`, not a row in `neon_auth`.

---

## The things people worry about

**"Won't there be two sets of users?"**
There is one set — `logins`. Neon Auth holds a copy of an email address and
whether it received a code. It has no idea which shop anything belongs to.

**"Does this weaken the shop's security?"**
No. The rules that separate shops are in the database, not in the sign-in
service. Neon Auth can only say yes or no about a six-digit code.

**"What if Neon Auth is down when somebody signs up?"**
The server notices within eight seconds and sends its own code instead. A shop
can never be blocked from being created by a third party's outage.

**"Two emails arrived for one sign-up."**
Expected. Neon sends the code; this shop sends the one-click link. Tap either.

**"Can I use Neon Auth passwords instead?"**
No need. The shop has its own passwords: chosen at sign-up, stored as scrypt
hashes in `logins`, and checked by this server. They work with no third party
involved.

---

## Summary

| | Neon Auth | This shop |
|---|---|---|
| Emails and checks the first sign-up code | **yes — when configured** | yes, as the fallback |
| Day-to-day sign-in | no | email + password |
| Sign-in by emailed code, any time | no | yes — the way back in |
| Knows which shop a person belongs to | **no** | yes — this is the point |
| Enforces the eleven "only your own shop" rules | **no** | yes, in the database |
| Required for the shop to work | **no** | — |

Optional, useful, and easy to undo. That is the whole verdict.

---

**Next:** [4 · Email and sign-in →](04-email.md) · **The short course:**
[`docs2/04-email-and-sign-in.md`](../docs2/04-email-and-sign-in.md) ·
**Something broken?** [9 · Troubleshooting →](09-troubleshooting.md)
