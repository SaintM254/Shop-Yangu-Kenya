# 4 · Signing in, with no passwords

There is no password field anywhere in this app. People sign in with a
six-digit code, or by tapping a link, and either arrives by email.

Why: a shopkeeper who uses the till twice a day will reuse a password they
already know, or write it on the counter. Neither is a password. An emailed
code costs them one glance at their phone and there is nothing stored to leak.

## What happens, step by step

### A shop that already exists

```
POST /api/auth/signin        { email }
        │
        ├─ the address is known     →  { existing: true, role: 'owner' }
        └─ the address is not known →  { existing: false }      (no hint that it is new)
        │
        ├─ a 6-digit code is generated, HMAC'd with TOKEN_PEPPER, and stored
        │  against a hash — never in plain text
        └─ an email is sent with the code in the subject line
```

```js
POST /api/auth/signin/verify { email, code }
        │
        ├─ wrong            → 400 "That code is not right."
        ├─ expired/missing  → 400 "That code has expired. Ask for a new one."
        ├─ 5 wrong guesses  → the code is dead; sign in again
        └─ right            → 200 { ok: true, next: 'dashboard' }
                               + Set-Cookie: syk_session=...
```

The code is marked consumed the moment it is used (`consumed_at`, not a
delete — the row is the record of what happened). A second attempt with the
same code fails, even within its ten-minute life.

### A new shop

```
POST /api/auth/signup { shop, name, email }
        │
        └─ a row in `pending_signups`, valid for 60 minutes.
           No shop exists yet, and no login either.
POST /api/auth/signup/verify { email, code }
        │
        └─ now, and only now: the shop, its settings, its five starter
           categories and its owner login are created, in one transaction.
```

The order matters. Signing up does not create anything a stranger could
squat on; an unverified sign-up expires and leaves no trace.

### The magic link

The same email carries a link:

```
https://your-site/auth/link/?token=<43 characters>
```

The page does **not** sign you in when it loads. It shows a button, and the
token is posted when it is pressed:

```js
POST /api/auth/link { token }
```

That is deliberate. Mail providers and corporate scanners fetch every link in
an email before the person sees it. A GET that consumed the token would mean
the link was already used by the time it was clicked.

Links are single-use and last 30 minutes.

## The session

A session is a 32-byte random token in an `HttpOnly` cookie. The database
stores only `HMAC(TOKEN_PEPPER, 'session:' + token)`, so a dump of the
`sessions` table cannot be used to sign in.

```
syk_session=<token>
  HttpOnly              — JavaScript cannot read it, so an XSS bug cannot steal it
  SameSite=Lax          — a POST from another site does not carry it
  Secure                — set when NODE_ENV=production (HTTPS only); omitted in
                          development so a plain-http laptop still works
  30 days               — a shop should not sign in every morning
```

Nothing on the server trusts the cookie's contents, because the cookie has no
contents. Every request looks the token up.

## Three kinds of account

| Role | `shop_id` | Can |
|---|---|---|
| `owner` | set | Everything in one shop, and nothing in any other. |
| `super_admin` | `null` | Read every shop, pause one, end a session. Cannot read a shop's products, sales or customers. |

A super admin is created by script, not by a request:

```bash
node scripts/make-super-admin.js you@example.com "Your Name"
```

There is no route that can do it. An account that can read every shop on the
platform should be a decision made at the database by whoever holds the
connection string.

## The email itself

`EMAIL_DRIVER=console` prints the message to the terminal — the right setting
while developing, and the reason `npm test` never sends anything.

`EMAIL_DRIVER=smtp` sends it. Any provider works:

```ini
EMAIL_DRIVER=smtp
MAIL_FROM=Shop Yangu Kenya <no-reply@shopyangu.co.ke>
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASS=re_...
```

The subject line carries the code — `123456 is your Shop Yangu Kenya sign-in
code` — so it can be read from a notification without opening the message.
That matters on a slow phone at a busy counter.

## The limits

| Limit | Value | Where |
|---|---|---|
| Codes per address per window | 5 in 15 minutes (`OTP_MAX_PER_WINDOW`) | `api/lib/auth.js` |
| Wrong guesses before the code dies | 5 | `OTP_ATTEMPTS` |
| Life of a code | 10 minutes | `OTP_MINUTES` |
| Life of a link | 30 minutes | `LINK_MINUTES` |
| Life of an unverified sign-up | 60 minutes | `SIGNUP_MINUTES` |
| Life of a session | 30 days | `SESSION_DAYS` |

A wrong email gets the same answer as a right one, so the sign-in form cannot
be used to find out which addresses have accounts. Sign-up does return
`existing: true` for an address that is already registered — that is
unavoidable, since it has to send a code — but it reveals nothing about the
shop behind it.

## Over plain HTTP

In production the cookie carries `Secure`, so it is only ever sent over HTTPS —
a downgrade attack cannot follow you. That flag is left off while
`NODE_ENV !== 'production'`, so a laptop on `http://localhost:8787` still keeps
a session.

A phone on your wifi pointing at `http://192.168.x.x:8787` will also work in
development, because the flag is off. Point a phone at a *production* build
over plain http and it will not; use a tunnel (`cloudflared`, `ngrok`) or a
real certificate.
