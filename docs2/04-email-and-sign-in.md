# Step 4 — Email, and how signing in works

*20 minutes. Free on most providers.*

This is the guide that explains the shop's front door. Read the first half even
if you never touch a setting: it explains what people will see, and why the
first sign-in is not like the tenth.

At the end of this page you can create a shop and sign back into it.

---

## How signing in works now

Two things, used at different times.

### The first time — a code by email

When somebody opens a shop for the first time they type:

- the **shop's name**
- their **own name**
- an **email address**
- a **password** they choose, twice

Then a **six-digit code** arrives by email. They type it in. The shop is created
and they are signed in.

Why the code on the first day? Because it is the only proof that the email
address is really theirs. A password proves what somebody knows; a code in the
inbox proves what somebody can open. On day one you want both.

### Every time after — email and password

From then on it is just **email and password**. No email, no waiting, no code
to read in a hurry at the counter with a customer watching.

### If the password is forgotten — the code again

There is no "reset password" link that expires and lands in spam. Under the
sign-in button there is **"sign in with a code by email"**, which sends the same
six-digit code. It gets the person in, and on the Settings screen they can set a
new password there and then.

That is the whole design: **the code is the spare key, kept permanently under
the mat.** Nobody can be locked out of their own shop, and no password reset
email can be the one thing standing between a shopkeeper and their till.

> **Word to know — OTP.** One-Time Password: a code that works once and then
> dies. Six digits, ten minutes, one use. When you see "OTP" in these docs, it
> means that.

---

## Who sends the emails

There are two ways, and you only need to set up **one** for the first sign-in.

### Way A — let Neon Auth hold the account and send the first code

Neon, the database from Step 2, also runs a sign-in service called **Managed
Better Auth**. This shop uses it for two things: your email-and-password
account, and the six-digit code that confirms your address the first time.

Why bother: it means you can open your shop today **without connecting an email
provider at all**. Neon holds the mail connection for you.

> **There is no "Auth URL" box in the console, and looking for one is where most
> people lose an afternoon.** The URL is *generated* when Auth is turned on, and
> the supported way to turn it on is the Neon CLI reading a file that is already
> in this repository (`neon.ts`, with `auth: true`). That is what the steps below
> do.

**What you need for this:** Node 22.20 or newer (`node -v`), a Neon project on
AWS, and — importantly — **no IP Allow or Private Networking** on that project.
Managed Auth cannot be enabled with either.

**Step 1 — install the Neon CLI**

```bash
npm install -g neon@latest
neon --version
```

**Step 2 — sign in**

```bash
neon login
```

A browser opens. Sign in to the Neon account that owns `shop-yangu`.

> No browser on that machine? Make an API key in Neon → **Account settings →
> API keys**, then `echo "KEY" | neon profile create DEFAULT --api-key -`.
> Never commit a key or paste one into a chat.

**Step 3 — link the project**

```bash
neon link
```

Choose your organisation and `shop-yangu`. It writes a `.neon` file, which is
git-ignored.

**Step 4 — turn Auth on**

`neon.ts` in this repository already says `auth: true`. Apply it:

```bash
neon deploy
neon neon-auth status
```

`neon deploy` provisions Managed Better Auth and writes `NEON_AUTH_BASE_URL` for
you. That is the URL that does not exist until you run this. It ends in
`/neondb/auth`.

**Step 5 — give the settings to Vercel**

```bash
neon env pull
```

That puts `DATABASE_URL` and `NEON_AUTH_BASE_URL` in `.env.local`. Copy both into
**Vercel → your project → Settings → Environment Variables**, alongside the
`TOKEN_PEPPER` you made in Step 3.

**Step 6 — the setting that silently breaks sign-in**

Better Auth refuses any request whose `Origin` is not on the branch's **trusted
domains**, answering `403 Invalid origin`. This shop sends `SITE_URL` as its
origin, so:

1. In Neon, open your project → **Auth** → **Trusted domains**.
2. Add your site address exactly, with `https://` and no trailing slash:
   `https://your-address.vercel.app`
3. Save.

And make sure Vercel has `SITE_URL` set to that same address. If those two
disagree, every sign-in fails and the message does not obviously say why.

**Step 7 — prove it**

Do not take this on trust:

```bash
cd api
NEON_AUTH_BASE_URL="https://ep-....neon.tech/neondb/auth" \
SITE_URL="https://your-address.vercel.app" \
node scripts/prove-neon-auth.mjs your@email.co.ke
```

It creates a real user, asks for a real code, checks that a **wrong** code is
refused, asks you to type the code from your inbox, then reads the user back and
signs in with the password. No secrets are printed.

**Where the emails go — the other thing that looks like a bug**

Neon's shared sender, `auth@mail.myneon.app`, **only delivers to the address on
your Neon account.** Any other address goes nowhere, silently, while the API
still reports success. So while testing, use the address your Neon account is
registered to. For a real shop, connect your own sender in Neon under **Auth →
Email provider** — and do Way B anyway, because this shop's own mailer sends the
welcome email and every later sign-in code.

> **What if any of it fails?** Nothing breaks. If Neon Auth is not configured,
> unreachable, slow, or refuses, this shop sends the code itself with Way B. The
> worst case is that the email arrives from a different address than expected.

**How to check it took:** open `/api/health` on your site and look at `auth`:

```json
"auth":{"driver":"neon-auth","ok":true,"host":"ep-something.neon.tech","trustedOrigin":"https://your-address.vercel.app"}
```

`"driver":"none"` means the setting is not visible to the deployment, and your own
mailer is sending instead — which still works.

### Way B — connect your own mailer

You need this for a real shop in either case: **welcome emails, and every
"sign in with a code" email go through your own mailer.** Neon Auth only ever
sends the first one.

Pick a provider. All of these speak the same standard (SMTP), so the shape is
identical and only the values differ.

| Provider | Free allowance | Best for |
|---|---|---|
| **Resend** — <https://resend.com> | 3,000/month, 100/day | simplest. Start here. |
| **Brevo** — <https://brevo.com> | 300/day | more per day, a few more clicks |
| **Gmail** | ~500/day, needs an "app password" | testing only |
| **Zoho / cPanel / your web host** | depends | if you already pay for email at your domain |

> **Why not Gmail for real use:** Gmail treats automated mail as suspicious and
> often files it under spam. Codes in spam means people cannot sign in. Fine for
> a test, then move to Resend.

**Getting the values from Resend**

1. <https://resend.com> → **Sign up**. Free, no card.
2. Left menu → **API Keys** → **Create API Key**.
   - **Name:** `shop-yangu`
   - **Permission:** **Sending access**
   - Press **Add**, then copy the key. It starts `re_`. **Copy it now** — Resend
     will not show it again.
3. Left menu → **SMTP**. The values are fixed:

   | Setting | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `587` |
   | Secure | `false` |
   | Username | `resend` |
   | Password | the `re_…` key you just copied |

4. **About the sender address.** Out of the box you must send from
   `onboarding@resend.dev`, and Resend will only deliver to *your own signup
   email*. That is enough to test and not enough to run a shop.

   To send to anyone: Resend → **Domains** → **Add Domain**, type your domain,
   and add the DNS records it shows you at your domain registrar. Then press
   **Verify**. Usually ten minutes.

   No domain yet? Stay on `onboarding@resend.dev` and test with your own
   address. Nothing else depends on it.

**Put the values into Vercel**

Vercel → your project → **Settings** → **Environment Variables**. Add seven:

| Key | Value |
|---|---|
| `EMAIL_DRIVER` | `smtp` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | your `re_…` key |
| `MAIL_FROM` | `Shop Yangu Kenya <no-reply@yourdomain.co.ke>` |

Keep the angle brackets and the name in front of the address. While testing,
use `Shop Yangu Kenya <onboarding@resend.dev>`.

Tick **Production** on each. Then press **Redeploy** — settings are only read
when the site is built.

---

## Step 3 — Create your own shop, for real

1. Open `https://your-address.vercel.app/login/`.
2. Press the **Open a shop** tab.
3. Fill in the shop name, your name, your email, and a password twice.
4. Press **Open my shop**.
5. Check the inbox. In the same minute you should get:
   - an email with a six-digit code, and
   - an email with a one-click link.
   Either works; the link also confirms the address.
6. Type the code — or click the link — and you are in the shop.

If you ran the demo file in Step 2 and want your own shop as well, that is fine:
the demo shop is a separate login. To remove the demo shop later, the top of
`db/apply-demo.sql` has the one line that deletes it.

---

## Choosing a password people will actually keep

The form refuses a few things, and each refusal explains itself:

| Refused | Why |
|---|---|
| under 8 characters | too easy to guess off a glance at the counter |
| only numbers | the same |
| one repeated character | the same |
| a well-known password (`password123`, `shopyangu`) | it is the first thing anybody tries |
| your email name inside it | everybody can see your email |
| the shop name inside it | it is printed on every receipt |

Everything else is allowed. **A phrase beats a scramble**: `chapati-na-ndengu`
is a good password. `Xk9#mQ2!` is a worse one, because it ends up on a sticky
note under the counter.

To change it later: **Settings → Password** in the shop app. An account made by
hand — the demo shop, or the platform admin — starts with no password, and that
same card is how it gets one.

---

## Check it worked

Three questions, in order.

**1. Can a code be sent?**

Go to `/login/`, type the email you used, press **sign in with a code by email**.
Watch for the "check your email" panel.

**2. Did it arrive?**

If not, open `/api/health`. The two sections that matter:

```json
"mail":{"driver":"smtp","ok":true,"host":"smtp.resend.com"},
"auth":{"driver":"neon-auth","ok":true,"host":"ep-…neon.tech"}
```

- `"driver":"console"` in `mail` — `EMAIL_DRIVER` is not set to `smtp`, or the
  site was not redeployed.
- `"ok":false` in `mail` — the SMTP values are wrong. The `error` field says
  which one.
- `"driver":"none"` in `auth` — `NEON_AUTH_BASE_URL` is not set. The mailer
  should still be delivering; check `mail` above.

**3. Can you sign in with the password?**

Sign out (**Settings → Sign out**, or the menu at the top), then sign in again
with just the email and password. No email should arrive — that is the point.

---

## If it does not work

**"Invalid login" or "535 Authentication failed".**
`SMTP_PASS` is wrong, or it is the Resend *account* password rather than the
`re_…` API key. Make a new key.

**Nothing arrives, and `mail` says ok.**
Check the spam folder. If you are on `onboarding@resend.dev`, Resend will only
deliver to the address you signed up to Resend with — sending to anybody else
silently goes nowhere.

**The code arrives but is refused.**
It expired (ten minutes), or an older code was used. Codes die in the order they
are sent: **only the newest works**.

**"Too many emails in fifteen minutes".**
An address may ask for five codes in a quarter of an hour. This exists so the
form cannot be used to flood somebody's inbox. Wait, or use the link.

**The first sign-in works, but the password does not.**
Almost always because the sign-up was submitted twice from an older version of
the page. Sign in with a code, then set the password again under
**Settings → Password**.

**Neon Auth is on, and no code arrives at all.**
Neon's own sender is still on its test mode. In the Neon console open
**Auth → Email provider** and connect your SMTP values there, or turn Neon Auth
off and let this shop's mailer handle it. Removing `NEON_AUTH_BASE_URL` is always
a safe move: sign-up falls back to this shop's own email, and nothing else
changes.

---

## The one security idea worth understanding

The password is stored as a **hash** — a one-way scramble with a random salt per
password. The server can check a password without ever being able to read it
back. If somebody stole a copy of the database tomorrow, they would get a list
of scrambled strings, not a list of passwords.

The code that does this is in `api/_lib/password.js`. It is deliberately short
and readable.

---

Next: **[Step 5 — M-Pesa](05-mpesa.md)**
