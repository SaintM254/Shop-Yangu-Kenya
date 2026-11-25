# Step 6 — When something is wrong

Find your sentence in the list. Each one has what it actually means and the fix.

If you only read one line: **open `https://your-address.vercel.app/api/health`
first.** It is the system telling you what it can and cannot reach, on one
screen. Most problems are answered there before you touch anything.

---

## First, the one habit that saves an hour

`/api/health` returns a small block of text. Learn to read four parts of it:

```json
{
  "ok": true,
  "configured": true,
  "database": { "ok": true, "driver": "postgres" },
  "mail": { "driver": "smtp", "ok": true, "host": "smtp.resend.com" },
  "auth": { "driver": "neon-auth", "ok": true, "host": "ep-…neon.tech" }
}
```

| Part | What it tells you |
|---|---|
| `configured` | whether the required settings exist at all |
| `database` | whether the shop can reach its data |
| `mail` | who sends email, and whether the mailer accepts the settings |
| `auth` | who sends the first sign-up code |

Each has `"ok": true` or `"ok": false` with an `error` beside it. **The first
`false` is your problem.** Everything after it is a symptom.

> What `/api/health` never shows: your password strings, your SMTP password, or
> the pepper. It reports whether a setting is present, never what it is. It is
> safe to open on a phone, and safe to screenshot the `ok` lines of.

---

## The site itself

### Every page says "404: NOT_FOUND", including the homepage

That 404 comes from Vercel, not from the shop: Vercel looked for a file and did
not find one.

1. **Settings → General → Build & Development Settings**
2. **Output Directory** must be exactly `dist`
3. **Build Command** must be exactly `node build.js`
4. **Deployments** → newest → **⋯** → **Redeploy**

If it persists, open the build log. A good build ends with
`built 19 pages · all checks passed`. If it says `check(s) failed`, the log names
the page and the reason.

### The page loads but has no colours, and looks like a 1990s document

The stylesheet is missing, which means the build partly failed.

1. **Deployments** → newest → read the log
2. Look for a line with `✗`. The build stops on purpose when a page links to
   something that does not exist — that check is why a broken page never goes
   live
3. Fix the named problem, or roll back: **Deployments** → the last green one →
   **⋯** → **Promote to Production**

### `/login` 404s but `/login/` works

Normal. Every page in this project is a folder with an `index.html` inside, so
the address ends with a slash. Add the slash.

### "This deployment is protected"

Vercel has Deployment Protection on. Project → **Settings** → **Deployment
Protection** → turn off **Vercel Authentication** for Production.

### The first load each day takes 5–10 seconds

The Neon free plan naps after five idle minutes. The first visitor wakes it. A
paid Neon plan removes the nap; nothing else about the shop changes.

---

## Signing in

### No email arrives, and `mail` says ok

1. **Spam folder.** This is the answer more often than everything else combined.
2. If you are still sending from `onboarding@resend.dev`, Resend will only
   deliver to the address you signed up to Resend with. Any other address goes
   nowhere, silently.
3. Wait a full minute. A cold start plus a cold mailer can take 30 seconds.

### No email arrives, and `mail` says `"driver":"console"`

`EMAIL_DRIVER` is not set to `smtp`, or the site was not redeployed after you set
it. Adding a setting does nothing to a deployment that already exists.

### "Invalid login" or "535 Authentication failed"

`SMTP_PASS` is wrong — most often it is the provider's *account* password rather
than the API key. Make a new key and paste it again.

### The code arrives but is refused

- It expired. Codes live ten minutes.
- A newer code was sent since. **Only the newest works** — older ones are killed
  on purpose, so a code read out of an old email cannot open the shop.

### "That is 5 emails in 15 minutes"

One address may ask for five codes per quarter hour. This stops the form being
used to flood an inbox. Wait, or open the email's link instead of typing.

### The password does not work, but the account exists

Sign in with a code (**"sign in with a code by email"** under the sign-in
button), then set the password again under **Settings → Password**. This is the
intended way back in and it has no time limit.

### "That is 8 wrong passwords in 15 minutes"

Eight wrong passwords from one address pauses password sign-in for a quarter of
an hour. This exists because a password can be guessed in a way a six-digit code
cannot. **Signing in by code still works during the pause** — deliberately, so a
guesser cannot lock an owner out of their own shop.

### A shop made by hand (the demo shop, the platform admin) has no password

Expected. Those accounts were created by SQL, which knows nothing about
passwords, so they sign in by code. Sign in that way once, then set a password
under **Settings → Password**.

---

## Neon Auth, specifically

### Neon Auth is on and no first code arrives

Neon's own mail sender is still in its test mode and will only deliver to the
address on the Neon account. Two fixes:

- In the Neon console: **Auth → Email provider**, connect your SMTP values
  there, or
- Remove `NEON_AUTH_BASE_URL` in Vercel and redeploy. Sign-up falls back to this
  shop's own mailer, and nothing else changes.

Removing that one setting is always safe. It is the only thing Neon Auth is used
for.

### Sign-up sends two emails

Expected, and harmless. Neon Auth sends the code; this shop sends the one-click
link, because the code in that email is not one this shop can check. Click
either — they get to the same place.

### `/api/health` says `"auth":{"driver":"none"}`

`NEON_AUTH_BASE_URL` is not set. That is a valid, working configuration — this
shop sends the codes itself. Only change it if you specifically want Neon to
send them.

---

## M-Pesa

The full list, including going live, is in
**[Step 5 — M-Pesa](05-mpesa.md#if-it-does-not-work)**. The three that account
for most of it:

- **The phone does not ring in sandbox** — correct behaviour, not a fault.
- **"Callback URL rejected"** — the address contains `mpesa`, `m-pesa` or
  `safaricom`. Use the `/pay/…` address from Settings, nothing else.
- **The customer paid, the sale says unpaid** — `MPESA_CALLBACK_BASE` is not your
  real public address, or you did not redeploy after setting it.

---

## The database

### "Can't reach database server" / `database.ok` is false

1. Neon console → is the project there and awake?
2. Vercel → **Settings → Environment Variables** → is `DATABASE_URL` the
   **pooled** string, the one with `-pooler` in it?
3. Was the site redeployed after it was set?

### `DATABASE_URL` is right, but tables are missing

`db/apply-all.sql` has not been run against this database. Step 2, Step 4. It is
safe to run again at any time — it detects that it has already run and stops.

### "permission denied for schema public"

Rare on a fresh Neon project. **Settings → Roles** — check you are signed in as
the owner. If it persists, delete the project and start over; it takes two
minutes and is faster than debugging.

### I want the demo shop gone

The top of `db/apply-demo.sql` has the one line that deletes it. Paste it into
Neon's SQL Editor and run it.

---

## The server will not start at all

Almost always `TOKEN_PEPPER`. The server refuses to run without it, on purpose,
because a server without it would issue sign-in tokens that any other copy of
the server could forge.

Add `TOKEN_PEPPER` in Vercel — 32 or more random characters — and redeploy.

> If you *change* the pepper later, everybody is signed out and every live
> sign-in code stops working. Nothing is lost; people just sign in again.

---

## When you are really stuck

Do these three things, in order, before asking anybody for help:

1. **Open `/api/health`** and note which part says `"ok": false`.
2. **Open the newest deployment's build log** and find the last line with `✗`
   or `error`.
3. **Write down what you clicked** immediately before it went wrong.

Those three answers are 90% of any diagnosis. With them, a programmer can help
you in minutes instead of hours.

Whatever you do, do not paste `DATABASE_URL`, `TOKEN_PEPPER`, `SMTP_PASS` or a
M-Pesa consumer secret into a chat, an email or a screenshot. If somebody needs
to help, they can work from the `ok`/`false` lines.

---

Back to **[the start](README.md)** · Going deeper: **`docs/09-troubleshooting.md`**
has the long list, including ETIMS and the admin console.
