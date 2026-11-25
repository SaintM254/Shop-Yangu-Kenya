# Step 3 — Put it online

*15 minutes. Free to set up and to try.*

At the end of this page your shop is on the internet at an address you can text
to somebody. Their phone will show the site, the sign-in page, and — if you ran
the demo file — some products.

Everything after this page is optional. If you only want to look at it, stop
here and come back tomorrow.

---

## What is about to be published

Two things, at one address:

| | What it is | Where it lives |
|---|---|---|
| **The pages** | what people see — the shop, the sign-in page, the till | `https://your-address/` |
| **The server** | the part that saves a sale and checks a sign-in code | `https://your-address/api/…` |

They share one address on purpose. That is what makes sign-in work without
fighting the browser's security rules, and it is why there is no "API address"
to type anywhere.

> **Word to know — deploy.** Publish. You press a button called **Deploy** and a
> minute later there is a live site. Every time the code changes, there is
> another deploy; the old version keeps working until the new one is ready.

---

## Step 1 — Make a Vercel account with GitHub

1. Go to **<https://vercel.com>**
2. Press **Sign Up**, top right.
3. Choose **Continue with GitHub**.
4. GitHub asks whether to let Vercel see your repositories. Press
   **Authorize Vercel**.

Signing in with GitHub is not laziness — Vercel has to read your repository to
deploy it, and this is the only way it can.

---

## Step 2 — Start a new project

1. On the Vercel dashboard press **Add New…** then **Project**.
2. A list of your GitHub repositories appears.
3. Find **Shop-Yangu-Kenya** — the one you forked in Step 1 — and press
   **Import**.

If the repository is not in the list, press **Adjust GitHub App Permissions**
and give Vercel access to it.

---

## Step 3 — Check the build settings

Vercel guesses these from the repository. They should already be exactly:

| Field | Value |
|---|---|
| **Framework Preset** | **Other** |
| **Build Command** | `node build.js` |
| **Output Directory** | `dist` |
| **Install Command** | leave empty |
| **Root Directory** | leave empty |

If any of these is different, change it. `node build.js` is what turns the
project's source into the published pages; `dist` is where it puts them.

> **Do not press Deploy yet.** Two settings have to be added first, and a
> deploy without them publishes a site that cannot save anything.

---

## Step 4 — Add the two settings

Still on the import page, open **Environment Variables**.

Add these two, exactly as written on the left:

### 1. `DATABASE_URL`

The **pooled** string from Step 2 — the one with `-pooler` in it.

### 2. `TOKEN_PEPPER`

32 or more random characters. It is the secret the server uses to scramble
sign-in tokens, so that a stolen copy of the database cannot be used to sign in
as anybody.

**You make this up yourself.** It is not something you look up. Generate a long
random string — for example, open <https://random.org/strings> and ask for one
64-character string with all characters allowed.

> **Write `TOKEN_PEPPER` down.** If you ever lose it, everybody is signed out
> and every existing sign-in code stops working. Not fatal, but annoying, and
> entirely avoidable by keeping a copy.

Both variables must be ticked for **Production** (Vercel ticks all three
environments by default; that is fine).

### 3. `SITE_URL`

Your site's own address, with `https://` and **no trailing slash** — copy it from
the top of this page. Vercel can usually work it out, but Step 4 needs it to be
exactly right, because Neon Auth checks it against its trusted domains and
refuses anything that does not match.

Add it now and you will not have to come back.

---

## Step 5 — Deploy

Press **Deploy**.

You will see a list of build steps scrolling. It takes one to three minutes.
When it finishes you get confetti and a **Congratulations** page with a link
like `shop-yangu-kenya-abc123.vercel.app`.

Press that link. The site opens.

---

## Step 6 — Check it before you tell anybody

Open these three addresses, replacing the host with yours:

**1. The site**

```
https://your-address.vercel.app/
```

The shop's front page. If you see the shop, the pages are published.

**2. The server**

```
https://your-address.vercel.app/api/health
```

You want a small block of text with `"ok": true` in it, and a `database` section
that also says ok. This one address tells you the whole story:

| What it says | What it means |
|---|---|
| `"ok": true`, `"database": { "ok": true …` | Everything is connected. |
| `"database": { "ok": false …` | The database is not reachable — usually `DATABASE_URL` is wrong or was added without a redeploy. |
| An error page, or `"ok": false` at the top | `TOKEN_PEPPER` is missing. The server refuses to run without it, on purpose. |

**3. The sign-in page**

```
https://your-address.vercel.app/login/
```

If the page renders and the form appears, the front end is fine. You cannot
finish signing in yet — that is Step 4.

---

## If something is wrong

**The build fails** with a message about `node build.js`.
Open the failed deployment, press **View Function Logs** or scroll the build
log. The last red line names the problem. In practice it is almost always one
of: the repository is not a fork of this project; or **Output Directory** was
left as something other than `dist`.

**The site loads but every action says "not connected to the shop server".**
The `/api/health` check above will tell you which setting is missing. Fix the
setting, then press **Redeploy** — a setting added after a deploy does nothing
until the next one.

**The page says "This deployment is protected".**
Vercel has put Deployment Protection on. Go to your project → **Settings** →
**Deployment Protection** and turn off **Vercel Authentication** for production.

**It takes 5–10 seconds to load the first time each day.**
That is the Neon free plan waking up (Step 2). Normal.

---

## Changing something later

Every time you (or anyone) change the code in your GitHub repository, Vercel
builds and publishes automatically. You do not press Deploy again. You can
watch it happen on the project's **Deployments** tab.

To change a **setting**, edit it and then press **Redeploy** on the latest
deployment. Settings do not apply retroactively.

---

Next: **[Step 4 — Email and signing in](04-email-and-sign-in.md)**
