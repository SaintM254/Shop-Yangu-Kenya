# 9 · Troubleshooting

Find the message you are looking at. Each one has what it actually means and
what to do about it.

If your problem is not here, the fastest next step is always the same: **open
`https://your-address.vercel.app/api/health`**. It is the system telling you
what it can and cannot reach, in one screen.

---

## The site

### Every page says "404: NOT_FOUND" — including the homepage

That 404 is from Vercel, not from the shop, so Vercel looked for a file and did
not find one.

1. **Settings** → **General** → **Build & Development Settings**.
2. **Output Directory** must be exactly `dist`.
3. **Build Command** must be exactly `node build.js`.
4. **Deployments** → newest → **⋯** → **Redeploy**.

If it still happens, open the build log. `node build.js` finishes with a line
reading `built 19 pages · all checks passed`. If it instead says
`check(s) failed`, the site has a real problem and the log names the page.

### The homepage works, but CSS is missing and the page looks plain

The build wrote the pages but not the stylesheets, which means the build
partially failed.

1. **Deployments** → click the newest one → read the log.
2. Look for a line with `✗`. A typo in a stylesheet, or a link to a page that
   does not exist, stops the build on purpose — that check is why a broken page
   never goes live.
3. Fix the named problem, or redeploy a known-good version:
   **Deployments** → the last green one → **⋯** → **Promote to Production**.

### Pages work but links go to the wrong place / a domain I do not recognise

The site's own address was baked in at build time and is wrong.

1. **Settings** → **Environment Variables**.
2. Add or fix `SITE_URL` — your real address, with `https://` and no trailing
   slash.
3. **Redeploy**.

### "404" on `/login` but `/login/` works

The trailing slash matters: every page here is a folder with an `index.html`
in it. `vercel.json` already redirects the common ones. If you find another,
add a line to its `redirects` list — or just always use the version with the
slash.

---

## The server

### `/api/health` returns `500` or `FUNCTION_INVOCATION_FAILED`

The server started and crashed before answering. In this system that has one
overwhelmingly likely cause:

**`TOKEN_PEPPER` is missing or empty.**

1. **Settings** → **Environment Variables**.
2. Is `TOKEN_PEPPER` there, with a real value, ticked for **Production**?
3. If not, add it: 64 random characters.
4. **Redeploy** — a changed variable does nothing until the next build.

### `/api/health` returns `{"ok":false` with a database error

The server is fine; it cannot reach the database. Three causes, in order of
likelihood:

1. **`DATABASE_URL` has a stray character.** A trailing space, or it wrapped
   onto two lines. It must start `postgresql://`, contain `-pooler`, and end
   with `sslmode=require`. Re-paste it.
2. **It is ticked for the wrong environment.** It must be ticked for
   **Production**.
3. **The tables were never built.** Go back to
   [step 2](02-database-setup.md) and paste `apply-all.sql` into Neon.

The error text names the cause. `password authentication failed` means the
string is wrong; `relation "shops" does not exist` means the tables were not
built; `timeout` usually means the wrong (non-pooled) string.

### `"database":"up"` but sign-in codes never arrive

Email is not configured, or is configured wrongly.
Go to [step 4](04-email.md). Check `/api/health`'s `mail` section:
`"driver":"console"` means no provider is connected yet.

### The API works from a terminal but not from the site

They are on different addresses. On this deployment they must not be — the site
and the API share one address, and the site calls `/api/...` with nothing in
front of it. If you split them deliberately, see
[For developers](10-for-developers.md#splitting-the-site-from-the-api).

---

## The database

### "too many connections" or "connection pool exhausted"

The site is using the wrong connection string. It must be the **pooled** one,
with `-pooler` in the address. See [step 1](01-neon.md).

### `syntax error at or near ...` in the SQL editor

The paste was truncated, or text was pasted into leftover text.

1. In the SQL editor, select all and delete.
2. In GitHub, open the file and use the **copy** button at the top right — not
   a mouse drag.
3. Paste and Run.

### `relation "shops" already exists` / `policy ... already exists`

The file was pasted in two pieces, so its own "already applied?" check never saw
the first piece finish. The database is half-built. Clean fix, on a **new**
database:

```sql
drop schema public cascade;
create schema public;
```

then paste `apply-all.sql` once, whole. **This deletes everything** — only do it
on a database you are still setting up.

### "Already applied — nothing to do" but I wanted to change something

That is the file protecting you from running migrations twice. For the one
thing people change — the admin email — run the single line instead:

```sql
select create_super_admin('you@example.com', 'Your Name');
```

### I lost my connection strings

Neon console → your project → **Connection Details**. Copy them again. If one is
already in Vercel, updating it there is the pencil icon on the variable.

---

## Signing in

### "That code is not right" / the code is rejected

Codes last **10 minutes** and each one works **once**. Ask for a new one. If you
asked for several, the newest is the one that works — an older one is dead as
soon as a new one is sent.

### "That is 5 codes in 15 minutes" or "Too many wrong codes"

Both are deliberate limits: five codes per address per fifteen minutes, and
five wrong guesses per code. They are what stops someone using your login page
to send hundreds of emails on your account, or to guess their way in.

Wait fifteen minutes. If it is the *wrong guesses* limit, ask for a new code
first — a new code resets the count.

### "Check your email" shows, but the email never arrives

The screen says the same thing whether or not that address has a shop — that is
deliberate, so nobody can use the login page to discover who banks here. So the
message proves nothing on its own.

1. Check the spam folder first — a first-time sender usually lands there.
2. Open `/api/health` and look at the `mail` section. If it says
   `"driver":"console"`, no email provider is connected yet — that is
   [step 4](04-email.md).
3. If you expected the **demo** shop, you skipped
   [step 2](02-database-setup.md)'s demo file, so there is no shop behind that
   address to sign in to.
4. If you expected **your own** shop, use the **sign up** tab — signing up is
   what creates it. A sign-in only works for a shop that already exists.

### I never get past the login page

1. Is `/api/health` `"ok":true`? If not, fix the database first.
2. Is `mail` showing `smtp`? If not, [step 4](04-email.md).
3. Check the spam folder — first-time senders often land there.
4. Check your provider's own dashboard → **Logs**. If the send did not happen,
   the credentials are wrong. If it did, the receiving side is filtering it.

---

## M-Pesa

Full detail in [step 5](05-mpesa.md). The three that bite:

**The phone never rings.** In sandbox it never will. In production, check
`MPESA_ENV` says `production` and the shop holds production credentials.

**The customer paid but the sale says unpaid.** The callback did not arrive.
`MPESA_CALLBACK_BASE` must be your public address, `https://`, no trailing
slash, and you must have redeployed after setting it.

**"Callback URL rejected."** It contains `mpesa`, `m-pesa` or `safaricom`.
Safaricom refuses those. Use the `/pay/...` address the settings page shows.

---

## Deploying

### "Build failed" with `Cannot find module`

A package did not install. **Settings** → **General** → **Install Command**
should be `npm install` or empty. If you changed it to something else, put it
back and redeploy.

### The site is a Vercel login page, not the shop

Vercel protects new deployments by default, so a site nobody has seen yet cannot
be found by a search engine. Two versions of this:

- **A preview address** (`...-git-branch-....vercel.app`) always asks you to log
  in. That is not your shop's address — share the production one,
  `https://your-project.vercel.app`.
- **The production address asks too:** somebody switched protection on for
  everything. **Settings** → **Deployment Protection** → set **Vercel
  Authentication** to **Standard Protection** (previews protected, production
  public) or **Disabled**. Then reload.

### The deploy succeeds but nothing changed

Browsers cache pages aggressively. Open your address in a private window, or add
`?v=2` to the end of the URL. If that shows the change, it is only the cache.

Changing an **environment variable** also does nothing until you **Redeploy**.
This is the single most common cause of "I fixed it and it is still broken".

### "Deployment blocked" / a prompt to pay

You are on Pro, or you created a team. **Settings** → **Billing** shows what you
are on. Hobby is free.

### I want to undo a bad deploy

**Deployments** → find the last one that worked → **⋯** → **Promote to
Production**. Live in seconds, nothing lost.

---

## When all else fails

Three things that get you unstuck, in order:

1. **`/api/health`** — what the system thinks is wrong, in one screen.
2. **The build log** — **Deployments** → the newest → scroll to the end.
3. **Redeploy the last version that worked** — **Deployments** → green one →
   **⋯** → **Promote to Production**. A working old site beats a broken new one
   while you think.

The technical version of everything in these guides is in
[For developers](10-for-developers.md), which is what you hand to someone who
does code when you need help.

---

Next: **[10 · For developers →](10-for-developers.md)**
