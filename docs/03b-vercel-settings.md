# 3b · The settings, and what each one is for

**Read this if:** something is not working and you want to know which setting is
to blame, or you are wondering whether to type one by hand.

The short version: **you only have to add two settings yourself.** Everything
else works itself out on Vercel. This page is the reference for when that
surprise you.

---

## The two you must add

In Vercel → your project → **Settings** → **Environment Variables**.

| Setting | What it is | If it is missing |
|---|---|---|
| `DATABASE_URL` | The address and password of your database, in one line. The **pooled** one — the string with `-pooler` in it. | The site loads. Nothing can be saved or signed in to. `/api/health` says so. |
| `TOKEN_PEPPER` | 32+ random characters. The server uses it to scramble sign-in codes so a leaked database cannot be used to sign in as anyone. | **The server refuses to run.** Every address, including `/api/health`, shows an error page. |

Both must be ticked for **Production**. Both need a **Redeploy** to take effect —
a setting saved after a deploy does nothing until the next one.

> **If you used Neon's Vercel integration**, it already created `DATABASE_URL`
> for you, and created it correctly (pooled). Leave it alone; add
> `TOKEN_PEPPER` and you are done.
>
> The integration also adds `DATABASE_URL_UNPOOLED` and some `PG*` variables.
> This app does not read any of them. They are harmless — leave them.

---

## Asking the site which one is wrong

Open:

```
https://your-address.vercel.app/api/health
```

That address exists to answer exactly one question: *is this deployment set up?*
It never fails — not even on a broken deployment — because if it did, there
would be nothing left to ask.

When something is missing it answers like this:

```json
{
  "ok": false,
  "configured": false,
  "missing": [
    {
      "name": "TOKEN_PEPPER",
      "what": "a long random string that scrambles sign-in codes; without it nobody can sign in",
      "fix": "Add it in Vercel → Settings → Environment Variables, then Deployments → ⋯ → Redeploy."
    }
  ]
}
```

Read `name`, add it, redeploy. When everything is in place the same address
answers:

```json
{
  "ok": true,
  "configured": true,
  "database": { "driver": "postgres", "database": "neondb", "ok": true },
  "mail": { "driver": "smtp", "ok": true, "host": "smtp.resend.com" }
}
```

Three things to check in that JSON: **`ok`**, **`database.ok`** and
**`mail.ok`**. Those are the database, the database again, and the sign-in
emails — the three things that can each be wrong on their own.

> **The page shows an error page instead of JSON.** Then the server never ran at
> all, and the cause is one of two things: `TOKEN_PEPPER` is missing, or the
> deployment is not public yet. Both are in
> [9 · Troubleshooting](09-troubleshooting.md).

---

## The settings you do not have to add

All of these are worked out on Vercel. Adding them by hand is the most common
way to break a working deployment, so leave them alone unless a guide tells you
otherwise.

| Setting | What it would do | What happens instead |
|---|---|---|
| `NODE_ENV` | turn on production behaviour | set to `production` automatically |
| `SERVE_SITE` | make the server serve the pages | Vercel serves them, and the server knows not to |
| `SITE_URL` | the address used in emails | read from Vercel's own environment |
| `API_URL` | where the API is | same address as the site, so not needed |
| `MPESA_CALLBACK_BASE` | where Safaricom calls back | same address again |
| `DATABASE_DRIVER` | which database driver | `postgres` whenever `DATABASE_URL` is set |
| `PORT`, `HOST` | a port for the server to listen on | there are no ports on Vercel |

**One exception:** once you attach a domain of your own, set `SITE_URL` to it
(`https://yourdomain.co.ke`, no trailing slash) so the links inside sign-in
emails point at the right place. [3 · Put the site online](03-vercel.md) step 7
covers that.

---

## Adding a setting, carefully

1. **Settings** → **Environment Variables**.
2. Type the **Key** exactly. It is case-sensitive: `TOKEN_PEPPER`, not
   `token_pepper`.
3. Paste the **Value**. No quotes, no spaces at either end, one line.
4. Tick **Production** (and Preview and Development if offered).
5. Click **Add** or **Save**.
6. **Deployments** → newest → **⋯** → **Redeploy** → confirm.
7. Open `/api/health` and check.

> **Step 6 is not optional.** This is the single most common reason a fix
> "didn't work": the setting was saved, but the running site is still the old
> build, which was made before the setting existed.

---

## Where to go next

- Setting it all up from scratch: [3 · Put the site online](03-vercel.md)
- Something is broken: [9 · Troubleshooting](09-troubleshooting.md)
- What it costs: [8 · How much this costs](08-cost-and-limits.md)
