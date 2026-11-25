# Step 4 — Email and how signing in works

*20 minutes. Free on most providers.*

This page is written for someone working **in the GitHub website**, with no
terminal. Every step has a "do this if you have no terminal" line. If you do have
one, the terminal is faster, but nothing here requires it.

At the end you can create a shop and sign back into it.

---

## How signing in works

Two things, used at different times.

**The first time — a code by email.** Somebody types the shop name, their name,
an email address, and a password twice. A six-digit code arrives. They type it.
The shop is created.

Why the code on day one? Because it is the only proof the email address is really
theirs. A password proves what somebody knows; a code in the inbox proves what
somebody can open. On day one you want both.

**Every time after — email and password.** No email, no waiting.

**If the password is forgotten — the code again.** Under the sign-in button there
is **"sign in with a code by email"**, which sends the same six digits. It gets
the person in, and **Settings → Password** sets a new one there and then. Nobody
can be locked out of their own shop.

> **Word to know — OTP.** One-Time Password: a code that works once, then dies.
> Six digits, ten minutes, one use.

---

## What you actually have to set up

Only two things, and one of them may already be done.

| What | Where | Why |
|---|---|---|
| `NEON_AUTH_BASE_URL` | Vercel → Settings → Environment Variables | Neon holds the account and sends the first code |
| Your own mailer (Way B below) | Vercel, same place | welcome email, and every later sign-in code |

> **A note on trusted domains.** Earlier versions of this page told you to add
> your site address in Neon under **Auth → Trusted domains**. If you connected
> Neon and Vercel with the Neon integration, **your `.vercel.app` domain is
> already trusted and you can skip that entirely.** Only add a domain if you get
> a `403 Invalid origin` error, or if you are using a custom domain and preview
> URLs. See [Step 6 →](06-troubleshooting.md#403-invalid-origin--every-sign-in-fails).

---

## Where `NEON_AUTH_BASE_URL` comes from

**There is no Auth URL box in the Neon console to copy it from.** That is not you
missing it. It is *generated* when Managed Better Auth is turned on, and the
supported way to turn it on is the Neon CLI reading `neon.ts`, which is already in
this repository with `auth: true`.

**If you have no terminal**, use GitHub Codespaces — a full terminal in your
browser, free, nothing to install:

1. On your repository page, click the green **Code** button → **Codespaces** tab
   → **Create codespace on main**.
2. Wait for it to open. You get a VS Code window with a terminal at the bottom.
3. Type these, one at a time:

   ```bash
   npm install -g neon@latest
   neon login          # a browser tab opens; sign in to Neon
   neon link           # choose your organisation, then shop-yangu
   neon deploy         # this is what creates NEON_AUTH_BASE_URL
   neon neon-auth status
   neon env pull
   cat .env.local
   ```

4. The last command prints your settings. Copy the value of
   `NEON_AUTH_BASE_URL` — it ends in `/neondb/auth` — into Vercel.

> **`neon deploy` says Auth cannot be enabled.** The project has IP Allow or
> Private Networking on. Neon → **Settings → Network** → turn it off, then run it
> again. Managed Auth cannot run with either.

> **Codespaces is a borrowed computer.** Close it when you are done; it stops
> billing free minutes when idle. Do not leave secrets in its files.

---

## Way B — connect your own mailer

You need this for a real shop either way. Neon Auth's shared sender only reaches
the address on your Neon account; every later email from this shop — welcome,
sign-in codes, receipts' links — comes from **your** mailer.

Pick a provider. They all speak the same standard (SMTP), so only the values
differ.

| Provider | Free allowance | Best for |
|---|---|---|
| **Resend** — <https://resend.com> | 3,000/month, 100/day | simplest. Start here. |
| **Brevo** — <https://brevo.com> | 300/day | more per day, more clicks |
| **Gmail** | ~500/day, needs an "app password" | testing only |
| **Zoho / cPanel / your host** | depends | if you already pay for email |

> **Why not Gmail for real use:** it treats automated mail as suspicious and often
> files it under spam. Codes in spam means people cannot sign in.

**Getting the values from Resend**

1. <https://resend.com> → **Sign up**. Free, no card.
2. Left menu → **API Keys** → **Create API Key**.
   - **Name:** `shop-yangu`
   - **Permission:** **Sending access**
   - Press **Add**, copy the key. It starts `re_`. **Copy it now** — it is not
     shown again.
3. Left menu → **SMTP**. The values are fixed:

   | Setting | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `587` |
   | Secure | `false` |
   | Username | `resend` |
   | Password | the `re_…` key |

4. **The sender address.** Out of the box you must send from
   `onboarding@resend.dev`, and Resend will only deliver to *your own signup
   email*. Enough to test, not enough to run a shop. To send to anyone: Resend →
   **Domains** → **Add Domain**, and add the DNS records it shows at your
   registrar. Then **Verify**. Usually ten minutes.

**Put the values into Vercel** — Settings → Environment Variables, seven of them:

| Key | Value |
|---|---|
| `EMAIL_DRIVER` | `smtp` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | your `re_…` key |
| `MAIL_FROM` | `Shop Yangu Kenya <no-reply@yourdomain.co.ke>` |

Keep the angle brackets and the name in front. While testing use
`Shop Yangu Kenya <onboarding@resend.dev>`.

Tick **Production** on each, then press **Redeploy**. Settings are only read when
the site is built.

---

## Step 7 — Prove it works, without a terminal

This is the step that was confusing, and it was confusing because it assumed a
terminal. There are now two ways, and the first needs nothing installed.

### Way 1 — from the GitHub website (recommended if you work in GitHub)

The repository has a GitHub Action that runs the same proof for you.

1. Open your repository's **Actions** tab.
2. In the left list, click **Prove Neon Auth**.
3. On the right, press **Run workflow**.
4. Type an email address you can open right now, and press the green
   **Run workflow** button.
5. Wait about a minute, then click the run and open the **prove** job.

You want four ticks and `Neon Auth is working`:

```
The settings
  ✓ Neon Auth is configured
  ✓ the base URL has the /neondb/auth path
1. Create the user with email and password
  ✓ Neon Auth created the account
2. Ask Neon to email a verification code
  ✓ Neon accepted the request
4. Read the current user back
  ✓ sign-in with the password works
  ✓ the current user came back   you@yourdomain.co.ke
```

**Before the first run, two settings in GitHub** — Settings → **Secrets and
variables** → **Actions**:

| Name | Type | Value |
|---|---|---|
| `NEON_AUTH_BASE_URL` | Secret | the value from `neon env pull`, ending `/neondb/auth` |
| `SITE_URL` | Variable | your site address, `https://`, no trailing slash |

Nothing secret is printed. The password is generated fresh and used once.

> **What this does not prove.** It does not type the code from your inbox,
> because that needs a human with the inbox. That is the one step a robot cannot
> fake. If the four ticks above pass, the code is the only thing left — and you
> can prove it in ten seconds by opening your site's sign-in page and signing up
> for real.

### Way 2 — from a terminal, if you have one

```bash
cd api
NEON_AUTH_BASE_URL="https://ep-....neon.tech/neondb/auth" \
SITE_URL="https://your-address.vercel.app" \
node scripts/prove-neon-auth.mjs you@yourdomain.co.ke
```

This one also asks you to type the code from your inbox, so it proves all five
steps instead of four.

---

## About the snippet Neon gave you

Full version in [`neon-codes.md`](neon-codes.md).

Neon's assistant gave you this:

```ts
export async function sendSignInOtp(email: string) {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
  if (error) throw error;
}
```

It is **correct advice for the right job, and not the job this shop does** at
sign-up. Worth knowing the difference, because it explains a whole class of
"the code never arrived":

`type: 'sign-in'` is for **signing in an existing user**. `type:
'email-verification'` is for **confirming an address during sign-up**.

I ran both against a real Better Auth server to be sure:

| Question | Answer | Does an email go out? |
|---|---|---|
| `type: 'sign-in'` for an address with no account | `200 {"success":true}` | **yes** — but the code is a *sign-in* code, not a verification one |
| `type: 'sign-in'` for an existing account | `200 {"success":true}` | yes |
| `type: 'email-verification'` for an address with no account | `200 {"success":true}` | **no** — silently nothing |

Two conclusions:

1. **The `{"success":true}` is not proof.** Better Auth answers success even when
   it sends nothing, so "it returned 200" never means "the email went". That is
   why the proof script checks that a **wrong code is refused** — a real send
   always leaves a real code to be wrong about.
2. **At sign-up this shop uses `type: 'email-verification'`, after creating the
   account.** `api/_lib/neon-auth.js` calls `signUpWithPassword()` first, then
   `sendSignupCode()`. If you reorder those two lines you get the silent-nothing
   case. This is commented at both places.

The snippet uses `authClient`, which is the **browser** client. This shop's
client is on the server (`api/_lib/neon-auth.js`), because the shop's sessions are
its own and Neon must never steer them.

---

## If no email arrives at all

In order:

1. **`/api/health`** — open `https://your-address.vercel.app/api/health` and read
   the `auth` and `mail` sections. The first `"ok": false` is your problem.
2. **Spam folder.** More often than everything else combined.
3. **Are you on Neon's shared sender?** It only reaches the address on your Neon
   account. Every other address is dropped silently. Connect custom SMTP under
   Neon → **Auth → Email provider**, or use Way B.
4. **Redeployed after changing a setting?** A setting added to a deployment that
   already exists does nothing.

Full list: [Step 6 →](06-troubleshooting.md#neon-auth-specifically).

---

## Choosing a password people will keep

The form refuses a few things, each with its own reason:

| Refused | Why |
|---|---|
| under 8 characters | too easy to guess off a glance |
| only numbers | the same |
| one repeated character | the same |
| `password123`, `shopyangu` and 15 like it | the first thing anybody tries |
| the email name inside it | everybody can see your email |
| the shop name inside it | it is printed on every receipt |

Everything else is allowed. **A phrase beats a scramble**: `chapati-na-ndengu` is
a good password. `Xk9#mQ2!` is a worse one, because it ends up on a sticky note
under the counter.

Change it later under **Settings → Password**. An account made by hand — the demo
shop, the platform admin — starts with no password, and that card is how it gets
one.

---

## Check it worked

1. Open `https://your-address.vercel.app/login/`.
2. **Open a shop** tab. Fill it in with a password you will remember.
3. Press **Open my shop**, then check your inbox.
4. Type the code, or click the link.
5. Sign out, then sign in again with just the email and password — **no email
   should arrive.** That is the point of a password.

---

## The one security idea worth understanding

The password is stored as a **hash** — a one-way scramble with a random salt per
password. The server can check a password without ever being able to read it back.
If somebody stole a copy of the database tomorrow they would get scrambled
strings, not passwords.

That code is in `api/_lib/password.js`. It is short and readable on purpose.

---

Next: **[Step 5 — M-Pesa](05-mpesa.md)**
