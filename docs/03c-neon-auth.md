# Neon Auth — set it up properly, with the CLI

This replaces the earlier version of this page, which described a `NEON_AUTH_BASE_URL`
setting you could not find anywhere in the Neon console. That was the whole
problem: **there is no "Auth URL" field to paste into.** With Managed Better Auth
the URL is *produced* when Auth is turned on for a project, and the supported way
to turn it on is the Neon CLI reading a `neon.ts` file. This page does that.

The repository already contains `neon.ts` with `auth: true`, and the API already
uses Neon Auth. What is left is the part only you can do: link the project to
your Neon account.

---

## What Neon Auth does here, and what it does not

**It does:** hold your email-and-password account, and send and check the
six-digit code that confirms your address on the first sign-in.

**It does not:** decide which shop you belong to. That is still the `logins` row
and the eleven row-level-security rules in the database. A Neon code proves you
can read an inbox; this server decides what that gets you into.

Two consequences worth knowing:

- Turning Neon Auth off never loses a shop. Every shop is a row in `logins`.
- Neon Auth cannot be the whole sign-in system, because it knows nothing about
  shops. It is the account and the door code; the shop is behind it.

---

## Before you start

You need:

1. **A Neon project with a database in it** — [Step 2 of the short course](../docs2/02-database.md).
2. **Node 22.20 or newer** on the machine you run this on. Check with
   `node -v`.
3. **The project must be on AWS**, and must **not** use IP Allow or Private
   Networking. Managed Auth cannot be enabled with either. Leave those
   protections off for this project, or use a different project.
4. **A region that Hosted Auth supports.** `aws-eu-central-1` (Frankfurt), which
   the short course recommends, is fine.

---

## Step 1 — Install the Neon CLI

```bash
npm install -g neon@latest
neon --version
```

You want `9.x` or newer. If `neon --version` prints nothing, the global npm
directory is not on your `PATH`; `npx neon@latest --version` works instead,
substituting `npx neon@latest` for `neon` in the commands below.

---

## Step 2 — Sign in

```bash
neon login
```

A browser opens. Sign in to the Neon account that owns your `shop-yangu`
project. Come back to the terminal when it says you are signed in.

> **No browser on this machine?** Make an API key in the Neon console under
> **Account settings → API keys**, then:
>
> ```bash
> echo "YOUR_KEY" | neon profile create DEFAULT --api-key -
> ```
>
> That writes the key to `~/.config/neon/credentials.json`, outside the repo.
> Never commit a Neon API key, and never paste one into a chat.

---

## Step 3 — Link the project

```bash
neon link
```

It asks which organisation and project. Pick `shop-yangu`. It writes a
`.neon` file in the repository — that file is git-ignored, and it is what makes
every later command know which project you mean.

To do it without prompts:

```bash
neon projects list          # find your project id
neon link --project-id <id> -y
```

---

## Step 4 — Turn on Auth

The repository's `neon.ts` already declares it:

```ts
export default defineConfig({
  auth: true,
  // ...
});
```

Now apply it:

```bash
neon deploy
neon neon-auth status
```

`neon deploy` provisions Managed Better Auth on the branch and writes the
environment variables for you, including **`NEON_AUTH_BASE_URL`**. That is the
URL you could not find: it is generated here, not copied from a console page.

`neon neon-auth status` should say the service is enabled and give you that base
URL. It ends in `/neondb/auth`.

> **If `neon deploy` says Auth cannot be enabled**, it is almost always IP Allow
> or Private Networking on the project. Turn that off in Neon → **Settings →
> Network**, then run it again.

---

## Step 5 — Put the settings where Vercel can see them

The API needs three things. `neon env pull` fetches the first:

```bash
neon env pull
```

That writes `DATABASE_URL` and `NEON_AUTH_BASE_URL` into `.env.local`. Open it,
and copy those two values into:

**Vercel → your project → Settings → Environment Variables**

Add a third yourself:

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | from `.env.local` — the **pooled** one | the shop's data |
| `NEON_AUTH_BASE_URL` | from `.env.local`, ends `/neondb/auth` | Neon's auth server |
| `TOKEN_PEPPER` | 32+ random characters, yours | session tokens; you already have one from the deploy step |
| `SITE_URL` | `https://your-address.vercel.app` | **the one people miss — see below** |

> **`NEON_AUTH_COOKIE_SECRET` is optional.** Neon's SDK signs its own cookie with
> it. If you leave it out, this shop derives one from `TOKEN_PEPPER`, which works
> and needs nothing extra. To keep them separate: `openssl rand -base64 32`.

Then **Redeploy** the newest deployment. Settings do not apply to a deployment
that already exists.

---

## Step 6 — The setting that silently breaks sign-in

Better Auth rejects any POST whose `Origin` is not on the branch's **trusted
domains**, with `403 Invalid origin`. This shop sends `SITE_URL` as its origin,
which is why `SITE_URL` in the table above is not optional.

In the Neon console:

1. Open your project → **Auth**.
2. Find **Trusted domains** (sometimes under **Settings** inside Auth).
3. Add your site address exactly, with `https://` and no trailing slash:

   ```
   https://your-address.vercel.app
   ```

4. Save.

If you later add a custom domain, or use Vercel preview deployments, add those
too. A preview URL that is not listed gets `403 Invalid origin` and nothing else
— it looks like the app is broken and it is one setting.

---

## Step 7 — Prove it works

Do not take any of this on trust. There is a script that runs the real flow and
prints no secrets:

```bash
cd api
NEON_AUTH_BASE_URL="https://ep-....neon.tech/neondb/auth" \
SITE_URL="https://your-address.vercel.app" \
node scripts/prove-neon-auth.mjs you@yourdomain.co.ke
```

Use an address you can open right now. It will:

1. create a user with email and password at Neon Auth
2. ask Neon to email a verification code
3. check a wrong code, which **must** be refused
4. ask you to type the code from your inbox
5. read the current user back, and sign in with the password

You want every line ticked and `Neon Auth is working` at the end. The password
it generates is random and used once; it is never printed.

---

## Where emails actually go

This is the other thing that made the first attempt look broken.

Managed Auth sends verification, OTP and password-reset mail itself — you do not
need Resend, SendGrid or any mailer in your own app for this. Getting started
uses Neon's **shared sender**, `auth@mail.myneon.app`.

**The shared sender only delivers to the address on your Neon account.** Any
other address goes nowhere, silently, and the API still answers `{"success":
true}`. That is why a code "sent" to a shopkeeper never arrives.

Two fixes:

- **Testing, one address:** use the address your Neon account is registered to.
- **Real shops:** connect custom SMTP in the console — **Auth → Email
  provider** — with the Resend values from
  [Step 4 of the short course](../docs2/04-email-and-sign-in.md). Verification
  *codes* work on the shared sender; verification *links* need custom SMTP.

---

## The other trap, if you are reading the code

Better Auth's `send-verification-otp` answers `{"success": true}` for an email
that has **no user yet**, and sends nothing. Asking for a code before creating
the account therefore looks like success and delivers zero emails.

`api/_lib/neon-auth.js` calls `signUpWithPassword()` **before**
`sendSignupCode()` for exactly this reason. If you reorder those two calls,
sign-up will silently stop sending codes.

---

## The order sign-in happens in, now

| Moment | Who decides |
|---|---|
| Sign-up form submitted | this server hashes the password (scrypt), then creates the Neon account, then asks Neon for a code |
| First sign-in | the six-digit code, checked by Neon |
| Every day after | email + password, checked by **Neon first**, this server's hash if Neon is unreachable |
| Forgotten password | a code by email — this server's own, tied to the login row, so it always works |
| Changing the password | written here **and** at Neon, or the change is refused rather than half-applied |

The fallback matters: a definite "no" from Neon is respected, but an *outage*
falls through to the local hash. A shop must not lose its till because a third
party is down.

---

## Turning it off

Remove `NEON_AUTH_BASE_URL` from Vercel and redeploy. Nothing is lost: sign-up
falls back to this server's own code and mailer, and every existing account
keeps working, because every account is a row in `logins`.

To remove the service itself, set `auth: false` in `neon.ts` and run
`neon deploy` again.

---

## Checking from the outside

Open `/api/health` on your site:

```json
"auth":{"driver":"neon-auth","ok":true,"host":"ep-…neon.tech","trustedOrigin":"https://your-address.vercel.app"}
```

- `"driver":"none"` — `NEON_AUTH_BASE_URL` is not set anywhere the deployment can
  see it. Codes come from your own mailer instead, which still works.
- `"ok":false` — the `error` names the setting. A base URL missing
  `/neondb/auth`, or a missing cookie secret, are the two it catches.
- `"trustedOrigin"` — what this server will send as its Origin. **It must match
  a trusted domain at Neon**, or every call is `403 Invalid origin`.

---

**Next:** [4 · Email and sign-in →](04-email.md) · **The short course:**
[`docs2/04-email-and-sign-in.md`](../docs2/04-email-and-sign-in.md) ·
**Something broken?** [9 · Troubleshooting →](09-troubleshooting.md)
