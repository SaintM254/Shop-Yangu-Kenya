# Should I turn on Neon Auth?

**Short answer: no — and if you already clicked it, nothing is broken. Leave it
alone or switch it off.**

This page exists because the Neon console offers an **Auth** button right next
to the database, and it looks like the obvious thing to click. Here is what it
does, what this app already does, and why using both would make the shop *less*
safe rather than more.

---

## What Neon Auth is

Neon Auth is a real, good product. Neon runs a copy of a sign-in service (Better
Auth) inside your Neon project and gives you:

- sign-up and sign-in screens, with passwords or emailed codes
- email verification
- session handling
- the users' details, in a `neon_auth` schema **in your database**

If you were building a new app from nothing, it would save you a week.

---

## Why this shop does not use it

**The shop already has its own sign-in, and it is the one the app is built
around.**

Every screen in the till asks one question before it shows anything: *which shop
is this?* The database answers it from a session cookie this server issued, and
then a set of rules — eleven of them — let that shop see **only its own**
products, sales, customers and credit. Those rules live in the database itself
(`db/003_rls.sql`), not in a page's JavaScript. A bug in a screen cannot leak
another shop's takings, because the database refuses.

Those rules are tied to the `logins` table: a login row *is* the link between a
person and a shop. The demo shop's owner, the platform admin who owns no shop,
the per-shop M-Pesa till — all of it hangs off that link.

Neon Auth keeps its users in a **different** table, in a different schema, and
knows nothing about shops. Turning it on gives you a second list of users who
can sign in to *something* — but not to a shop, because they are not in
`logins`, and none of the eleven rules apply to them.

### The part that matters

**Neon Auth does not replace the security rules. It sits beside them.**

So it would not make the shop stricter. Best case, it would be a second front
door nobody uses. Worst case — and this is not hypothetical, it is how these
integrations usually end up — a "helpful" connection is made between
`neon_auth.users` and this app's tables, so someone signed in by Neon Auth can
reach shop data *without* the shop id that the rules check for. That is exactly
the leak the rules exist to prevent.

---

## But I already added my email as a user

That is fine. Nothing broke, and it did nothing.

A user in Neon Auth is a row in `neon_auth`. This app never reads that schema. It
has no effect on your shop, your sign-in, or your data.

Two equally good options:

1. **Leave it.** Harmless. It costs nothing on the free plan.
2. **Switch it off** in Neon → your project → **Auth**. Tidier, and removes the
   chance that somebody later assumes it is in use.

What you should **not** do is try to make the shop sign people in through it.
That is a rewrite of the sign-in system, the session model and the eleven
database rules — not a setting.

---

## So how do people sign in?

The way the app was built, and the way the guides set up:

1. A person types their email at `/login/`.
2. **This server** generates a six-digit code and emails it.
3. They type the code. The server checks it, then issues a session cookie.
4. Every request after that carries the cookie, and the database uses it to
   decide which shop — and only that shop — the request may touch.

Where the code comes from is the only thing you have to set up, and it is
[4 · Turn on sign-in emails](04-email.md). Fifteen minutes at Resend, four
settings in Vercel.

> **Why not just use Neon Auth's emailed code?** Because it sends the code but
> knows nothing about shops. This server has to send it, so that the code is
> tied to a login row, which is tied to a shop. Same user experience, one system
> instead of two.

---

## If you want passwords instead of codes

You do not need Neon Auth for that either. The `logins` table has a
`password_hash` column — it was left there deliberately for a shop that asks for
one. Say so before anybody starts building, because it is a real feature
(sign-in, reset, and the "I forgot" path), not a toggle.

---

## Summary

| | Neon Auth | This shop |
|---|---|---|
| Sign-in screens | yes | yes, at `/login/` |
| Emailed codes | yes | yes, six digits, ten minutes |
| Knows which shop a person belongs to | **no** | yes — this is the point |
| Enforces the eleven "only your own shop" rules | **no** | yes, in the database |
| Something you need to turn on | no | no — it is already here |

Leave the Auth button alone. The fifteen minutes you would spend on it are
better spent on [sign-in emails](04-email.md), which the shop actually needs.

---

**Next:** [4 · Turn on sign-in emails →](04-email.md) · **Something broken?**
[9 · Troubleshooting →](09-troubleshooting.md)
