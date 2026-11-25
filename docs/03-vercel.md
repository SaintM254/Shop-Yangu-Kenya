# 3 · Put the site online

**Time:** 20 minutes · **Cost:** free to set up and to try. A shop taking real
money needs Vercel's $20/month plan — see
[8 · How much this costs](08-cost-and-limits.md), which explains why before you
rely on this. · **You need:** a GitHub account, and the two strings from
[step 1](01-neon.md)

At the end of this page your shop is on the internet at an address you can
text to someone. Their phone will show the shop, the sign-in page, and — if you
did step 2 — the demo shop's products.

Everything after this page is optional. If you only want to look at it, stop
here.

---

## What is about to happen

Two things are being published, at one address:

| | What it is | Where it lives on your site |
|---|---|---|
| **The pages** | What people see: the shop, the sign-in page, the till | `https://your-address/` |
| **The server** | The part that saves a sale and checks a sign-in code | `https://your-address/api/...` |

They share one address on purpose. It is what makes sign-in work without
fighting the browser's security rules, and it is why there is no "API address"
to type anywhere.

> **Word to know — deploy:** publish. You will click a button called **Deploy**
> and a minute later the site is live. Every time you change something, you
> deploy again — the old version keeps working until the new one is ready.

---

## Before you start

You need a **GitHub account**. If you do not have one, make it now at
<https://github.com> — free, one minute, just an email and a password.

The site's files already live in a GitHub repository called
**`SaintM254/Shop-Yangu-Kenya`**. You will point Vercel at it, and Vercel will
copy the files and publish them.

> **If the repository is yours:** you may be making a copy (a **fork**) of it
> first, so you control it. In GitHub, open the repository, click **Fork** (top
> right), and choose your own account. Use *your* copy everywhere below.

---

## Step 1 · Make a Vercel account with GitHub

1. Go to **<https://vercel.com>**.
2. Click **Sign Up** (top right).
3. Choose **Continue with GitHub**.
4. GitHub asks whether to let Vercel see your repositories. Click
   **Authorize Vercel**.

> **Why GitHub and not email?** Because Vercel needs to read your repository,
> and connecting the two accounts is how it does that. One less password, too.

You land on a dashboard with a **Hobby** plan, the free one. That is the right
plan to set up and test on. **If this is a real shop taking real money**, read
[8 · How much this costs](08-cost-and-limits.md) — Vercel's free plan is for
personal, non-commercial projects — and plan to move to Pro on the day the
first customer pays. Nothing stops working in the meantime.

---

## Step 2 · Import the repository

1. On the Vercel dashboard, click **Add New…** (top right), then **Project**.
2. You see **Import Git Repository** with a list of your repositories.
3. Find **`Shop-Yangu-Kenya`** and click **Import**.

   *Not there?* Click **Adjust GitHub App Permissions**, choose
   **Only select repositories**, tick `Shop-Yangu-Kenya`, and click **Install**.
   Come back to Vercel and refresh.

4. You now see a settings page headed **Configure Project**. **Do not click
   Deploy yet** — two of these settings must be changed first, in steps 3 and 4.

---

## Step 3 · Set the build settings

On that Configure Project page, in the **Build and Output Settings** section,
click to expand it if it is closed. Set exactly this:

| Setting | What to put |
|---|---|
| **Framework Preset** | `Other` |
| **Build Command** | `node build.js` |
| **Output Directory** | `dist` |
| **Install Command** | leave it as it is, or `npm install` |

> **What do those mean?** *Build Command* is the recipe that turns the source
> files into the finished website. *Output Directory* is the folder the
> finished website lands in. Both are already correct in the repository — you
> are just telling Vercel where to look.

> **If a "Root Directory" field exists:** leave it empty. The site is at the top
> of the repository, not inside a subfolder.

---

## Step 4 · Add the settings that hold secrets

This is the part people get wrong. There is a section called **Environment
Variables**, usually just below the build settings. It has a **Key** box, a
**Value** box, and an **Add** button.

**You need to add two.** Add each one and click **Add** before typing the next —
the boxes clear themselves, and it is easy to overwrite what you just typed.

| Key (copy exactly) | Value |
|---|---|
| `DATABASE_URL` | the string **with** `-pooler` in it, from [step 1](01-neon.md) |
| `TOKEN_PEPPER` | 64 random characters — see below |

Then, for each one, make sure the **Environments** boxes are ticked for
**Production** (or all three if they are offered).

### `DATABASE_URL`

Paste the string you saved. It must:

- start with `postgresql://`
- contain `-pooler` somewhere in the middle
- end with `sslmode=require`
- have nothing before or after it — no quotes, no spaces, no second line

### `TOKEN_PEPPER`

A long random string that the server uses to scramble sign-in tokens, so that a
stolen copy of the database cannot be used to sign in as anybody. It is the one
secret that would matter if it leaked.

Generate it in a terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use any password generator and ask for **32 characters or more** — a password
manager's "generate password" button is fine. What matters is that it is long,
random, and not a word or a date.

Paste the whole thing, then keep a copy somewhere safe.

> **Do not change it once the shop is in use.** Changing it signs everybody out,
> because every existing session was scrambled with the old one. That is exactly
> what you *should* do if it ever leaks — but not otherwise.

### The others set themselves

Four settings you might expect to have to type are worked out automatically on
Vercel, and getting them wrong is a common way to break a deploy — so they are
deliberately not on the list:

| Setting | What it would do | Why you can skip it |
|---|---|---|
| `NODE_ENV` | turn on production safety | Vercel sets it |
| `SERVE_SITE` | stop the server serving the pages | Vercel serves them, so the server already knows not to |
| `SITE_URL` | the address in emails | read from Vercel's own environment |
| `MPESA_CALLBACK_BASE` | where Safaricom calls back | the same address; only needed once you reach [step 5](05-mpesa.md) |

The only one you may later need to set by hand is `SITE_URL`, and only if you
attach a domain of your own — step 7 covers it.

---

## Step 5 · Deploy, and tell it the database address

1. Click the **Deploy** button.
2. You get a progress screen with a log. It takes one to three minutes. The
   lines scrolling past are not errors — they are Vercel narrating.
3. When it says **Congratulations!** you are given a web address like:

   ```
   https://shop-yangu-kenya.vercel.app
   ```

   That is your shop. Copy it somewhere.

> **Wait — "tell it the database address" was step 4.** Right: if you added
> `DATABASE_URL` in step 4, you are already done. This heading exists because
> this is the step where you can *check* it worked — see below.

### Check the address it gives you

Open these two addresses, replacing the first part with yours:

| Open | You should see |
|---|---|
| `https://your-address.vercel.app/` | The shop page, with the design intact |
| `https://your-address.vercel.app/api/health` | A small block of text starting `{"ok":true` |

The second one is the important one. It is the server answering, and it is
reporting whether it can reach the database. When all is well it looks like
this (the date will be today's):

```json
{"ok":true,"version":1,"env":"production",
 "database":{"driver":"postgres","at":"2026-11-24T09:12:44.101Z","database":"neondb","ok":true},
 "mail":{"driver":"console","ok":true,"note":"codes are printed to the server log"}}
```

`"ok":true` at the start means the site reached the database. If it says
`"ok":false` followed by `"error":"..."`, the database details are wrong — go
to step 6.

- **Both work** → carry on to step 6.
- **The page works but `/api/health` shows an error** → the site is fine and the
  database settings are not. Go to step 6, which is exactly this fix.
- **The page itself fails** → the build failed. Go to **Deployments**, click the
  failed one, and read the last few lines of the log. [Troubleshooting](09-troubleshooting.md)
  maps the common ones.

---

## Step 6 · If the server cannot reach the database

This is the single most common problem, and it has three causes. Check them in
order.

### Cause 1 · `DATABASE_URL` has an extra character, or is missing one

The usual culprit: a trailing space, or the string got wrapped over two lines
when it was copied.

1. In Vercel, open your project → **Settings** → **Environment Variables**.
2. Click the pencil next to `DATABASE_URL`.
3. Delete everything, and paste again from Neon's Connection Details — the
   **pooled** string, with `-pooler`.
4. Check the last character is `e` (from `sslmode=require`).
5. Click **Save**.

### Cause 2 · The variable is set for the wrong environments

An environment variable has a scope: *Production*, *Preview*, *Development*.
If you ticked only *Preview*, your live site will not see it.

1. **Settings** → **Environment Variables** → pencil next to `DATABASE_URL`.
2. Make sure **all three** boxes are ticked, or at least **Production**.
3. **Save**.

### Cause 3 · The database was set up with the wrong string

If you built the tables with the *pooled* string, the database may be
half-built. Go back to [step 2](02-database-setup.md) and run
`apply-all.sql` with the direct string. If it says "already applied", the
tables are probably fine and the problem is cause 1 or 2.

### After fixing any of these, redeploy

Changing a setting does **not** take effect until the site is rebuilt.
See step 8.

---

## Step 7 · Use your own domain (optional)

`shop-yangu-kenya.vercel.app` works, and you can text it to someone today. A
domain you own, like `shopyangu.co.ke`, reads better on a receipt.

You need to have bought the domain already — from Truehost, HostPinnacle, GoDaddy,
Namecheap, Cloudflare, anywhere. This part is not free.

1. Vercel → your project → **Settings** → **Domains**.
2. Type your domain, `shopyangu.co.ke`, and click **Add**.
3. Vercel offers you two choices. **Choose the one that matches what your
   registrar gives you:**
   - **Nameservers** (recommended, easiest): Vercel gives you two addresses
     like `ns1.vercel-dns.com`. In your registrar's DNS settings, replace the
     existing nameservers with those two.
   - **A record + CNAME:** if your registrar will not let you change
     nameservers. Vercel shows you exactly what to enter: an `A` record for
     `@` pointing at `76.76.21.21`, and a `CNAME` for `www` pointing at
     `cname.vercel-dns.com`.
4. Wait. This is the slow part: five minutes if you are lucky, up to 24 hours
   if the old records were cached. Vercel's Domains page shows a green tick and
   "Valid Configuration" when it is live.
5. Add `www.yourdomain.com` too, if you want both to work. Vercel offers to
   redirect one to the other; accept.

### After adding a domain, set the site address

Emails need to know your address, and Vercel's guess can be the `.vercel.app`
one rather than your nice domain.

1. **Settings** → **Environment Variables**.
2. Add `SITE_URL` with the value `https://shopyangu.co.ke` — your domain, with
   `https://` and **no** trailing slash.
3. **Save**, then redeploy (step 8).

> **M-Pesa users:** the callback address is built from this, and Safaricom will
> not accept a URL containing the words `mpesa`, `m-pesa` or `safaricom`.
> Vercel's default address contains none of them, so it is safe.

---

## Step 8 · How to publish a change

Once the site is live, "publishing" is one push to GitHub, or one click.

**Automatic (normal):** every time a change lands in the `main` branch of the
repository, Vercel builds and publishes it. Nothing to click.

**After changing a setting:** settings only take effect on a fresh build.

1. Vercel → your project → **Deployments** tab.
2. On the top (newest) deployment, click the **⋯** menu on the right.
3. Click **Redeploy**.
4. Confirm. Two minutes later the new settings are live.

**Rolling back:** if a new version breaks something, open **Deployments**, find
the last one that worked, and use its **⋯** menu → **Promote to Production**.
The broken one is replaced in seconds. Nothing is lost.

---

## ✅ Success looks like this

- [ ] Vercel shows a green **Ready** on the newest deployment.
- [ ] Your address opens the shop, with the design intact, on a phone.
- [ ] `/api/health` returns text starting `{"ok":true`.
- [ ] Opening `/login/` shows the sign-in page.
- [ ] You can find your way back to **Settings → Environment Variables** and
      see `DATABASE_URL` and `TOKEN_PEPPER` both present, ticked for Production.

If all five are true, **you have a deployed shop with a real database**.

---

## If it does not work

**"Build failed" with `Cannot find module`**
The build ran but could not find a package. In Vercel, check **Install Command**
is `npm install` (or empty, which means the same). Then Redeploy.

**The build succeeds but every page is blank**
The build command is probably not `node build.js`, or the output directory is
not `dist`. Check both in **Settings → General → Build & Development Settings**.

**`/api/health` returns `500 FUNCTION_INVOCATION_FAILED`**
The server started and then crashed — almost always a missing `TOKEN_PEPPER`.
Check **Settings → Environment Variables** that it exists, is not empty, and is
ticked for **Production**. Then Redeploy.

**`/api/health` returns `{"ok":false` with a database message**
`DATABASE_URL` is wrong, or the database is asleep and slow. Neon's free plan
sleeps after five idle minutes; the first request after that takes a second or
two and still succeeds. If it consistently fails, go back to step 6.

**Every page is a 404, including the homepage**
The output directory is wrong. It must be exactly `dist`.

**The address works but shows "404: NOT_FOUND" from Vercel itself**
The build wrote nothing to `dist`. Look at the build log: `node build.js`
prints `built 19 pages · all checks passed` when it works. If it printed
`check(s) failed`, a change broke the site and the log says which page.

**The site shows a Vercel login page instead of the shop**

You are looking at a *preview* address, or deployment protection is switched on
for everything. Vercel protects new deployments by default so a half-finished
site cannot be found by search engines.

- On a **preview** address (`...-git-something-....vercel.app`) this is normal.
  The production address — `https://your-project.vercel.app` — is the one to
  share.
- If the **production** address shows it too, open **Settings** → **Deployment
  Protection** (older accounts: **Settings** → **Security**) and set
  **Vercel Authentication** to **Standard Protection** or **Disabled**. Standard
  protects previews and leaves production public, which is what a shop wants.

**"Deployment blocked" or a payment prompt**
You created a team, or picked a paid plan at signup. Hobby is free; check
**Settings → Billing**. (A prompt on a *commercial* project is a different
thing — that is the licence in
[8 · How much this costs](08-cost-and-limits.md), not a mistake.)

**The demo login does not send an email**
Correct for now — no email provider is connected yet. That is [step 5](04-email.md).

---

Next: **[4 · Turn on sign-in emails →](04-email.md)**
