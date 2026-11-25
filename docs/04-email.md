# 4 · Turn on sign-in emails

**Time:** 15 minutes · **Cost:** free on most providers (limits below) · **You
need:** an email address you can send from, and the Vercel settings page open

Skip this step and you cannot sign in to your own shop — the sign-in page will
say a code was sent and nothing will arrive. Do it before you show the site to
anyone.

---

## Passwords and codes, and which does what

Worth understanding before you set this up, because it explains everything
about the step.

**A shop signs up with a password and a code.** The form collects a shop name,
a person's name, an email address and a password (typed twice). A six-digit code
then confirms the address, because on day one the inbox is the only proof that
the address really is theirs.

**After that it is email and password.** No email, no waiting. That is what
people expect of the tenth sign-in, and it is what a counter with a queue needs.

**The code never goes away.** "Sign in with a code by email", under the sign-in
button, sends the same six-digit code and gets a person in when the password is
forgotten. On the Settings screen they then set a new one. There is no reset
link to expire, and nobody can be locked out of their own shop.

The consequence for you: **email is part of the login system**, not a nicety.
No working email means a new shop cannot be created and a forgotten password
cannot be recovered.

> **Word to know — SMTP:** the standard way one computer hands an email to
> another. Every provider speaks it. You will be given four or five settings
> from your provider and pasted into Vercel.

---

## Step 1 · Pick a provider

All of these work. The settings you get are identical in shape; only the
values differ.

| Provider | Free allowance | Best for |
|---|---|---|
| **Resend** — <https://resend.com> | 3,000 emails/month, 100/day | The simplest. Recommended. |
| **Brevo** — <https://brevo.com> | 300/day | More per day, more clicks to set up |
| **Gmail** | ~500/day, but needs an "app password" | Testing only — see the note |
| **Zoho / cPanel / your web host** | depends on your hosting | If you already pay for email at your domain |

> **Why not Gmail for real use:** Gmail treats bulk automated mail as suspicious,
> and messages from it often land in spam. Codes in spam means people cannot
> sign in. Use it for a test, then move to Resend, which is free for real use.

**The rest of this guide uses Resend**, because it is the shortest. If you pick
another, the values differ but the boxes are the same — your provider's own
"SMTP settings" page has the four values you need.

---

## Step 2 · Get the four values

### If you chose Resend

1. Go to <https://resend.com> and click **Sign up**. Free, no card.
2. Once in, look for **API Keys** in the left menu, then **Create API Key**.
   - **Name:** `shop-yangu`
   - **Permission:** **Sending access**
   - Click **Add**, then **copy** the key. It starts `re_`.
   - **Copy it now** — Resend will not show it again.
3. Find **SMTP** in the left menu (sometimes under *Domains* or *Settings*).
   Resend's SMTP settings are fixed and are:

   | Setting | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `587` |
   | Secure | `false` |
   | Username | `resend` |
   | Password | *the `re_...` key you just copied* |

4. **About the sender address.** Out of the box you must send from
   `onboarding@resend.dev`, and Resend will only deliver to *your own* signup
   email. That is enough to test, and not enough to run a shop.

   To send to anyone, add your domain:
   - Resend → **Domains** → **Add Domain** → type `shopyangu.co.ke`.
   - Resend shows you three or four DNS records (called `TXT`, `MX` or `CNAME`).
   - Add each one in your domain registrar's DNS page, exactly as shown.
   - Come back and click **Verify**. Usually within ten minutes.
   - You can now send from `no-reply@shopyangu.co.ke`.

   > **No domain yet?** Use `onboarding@resend.dev` and test with your own
   > address. You can finish this later; nothing else in the setup depends on it.

---

## Step 3 · Put the values into Vercel

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add these six, one at a time, clicking **Add** after each:

   | Key | Value |
   |---|---|
   | `EMAIL_DRIVER` | `smtp` |
   | `SMTP_HOST` | `smtp.resend.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_SECURE` | `false` |
   | `SMTP_USER` | `resend` |
   | `SMTP_PASS` | your `re_...` key |

3. Add a seventh, the address the emails come from:

   | Key | Value |
   |---|---|
   | `MAIL_FROM` | `Shop Yangu Kenya <no-reply@yourdomain.co.ke>` |

   Keep the angle brackets and the name in front. If you are still testing with
   Resend's own sender, use `Shop Yangu Kenya <onboarding@resend.dev>`.

4. Make sure each one is ticked for **Production** (and Preview, if offered).

> **`EMAIL_DRIVER=smtp`** is the switch. Left as `console`, the code is printed
> to the server's log instead of emailed — useful when developing on a laptop,
> useless on Vercel, where nobody can see that log.

---

## Step 4 · Redeploy

Settings are only read when the site is built.

1. Vercel → **Deployments** tab.
2. On the newest deployment, click **⋯** → **Redeploy** → confirm.
3. Wait for the green **Ready**.

Then check the server can see your settings:

Open `https://your-address.vercel.app/api/health`. In the `mail` section you
should now see:

```json
"mail":{"driver":"smtp","ok":true,"host":"smtp.resend.com"}
```

If it says `"driver":"console"`, the `EMAIL_DRIVER` variable did not take —
check it is spelled exactly, and that it is ticked for Production. If it says
`"ok":false`, the username or the `re_` key is wrong.

---

## Step 5 · Send yourself a code

1. Open `https://your-address.vercel.app/login/`.
2. Type an email address you can check. Use the demo one —
   `demo@shopyangu.co.ke` — to see the demo shop, or your own to start fresh.
3. Click the button to send the code.
4. The page says **"Check your email"**, and shows the address under it.
5. Check the inbox. The code is in the **subject line**, so you do not even have
   to open the email on a slow phone.
6. Type it in. You are in.

> **Why the message is vague:** so nobody can use the login page to find out
> which email addresses have shops here. The screen looks the same whether or
> not the address has a shop — the only difference is whether an email actually
> arrives. That is deliberate.

---

## ✅ Success looks like this

- [ ] `/api/health` shows `"mail":{"driver":"smtp","ok":true}`.
- [ ] The code email arrives within a minute or two.
- [ ] The subject line contains the six digits.
- [ ] Entering the code signs you in.

---

## If it does not work

**The email never arrives.** Check, in this order:
1. **Spam / Promotions folder.** First time, it often lands there.
2. `/api/health` — is `mail.ok` true? If not, the SMTP values are wrong.
3. Resend → **Logs** (or **Emails**). Did the send happen? If Resend shows it
   was delivered, your mail provider is filtering it.
4. If you are still on `onboarding@resend.dev`, Resend only delivers to the
   address you signed up with. That is the limitation, not a bug.

**"Invalid login" or "535 Authentication failed".** The `SMTP_PASS` is wrong or
has a space on the end. Resend keys start `re_`. Re-copy it and paste again.
Then redeploy.

**`mail.driver` still says `console` after redeploying.** The variable name is
misspelled — it must be `EMAIL_DRIVER` exactly, with an underscore. Or it was
added but only ticked for **Preview**, not **Production**.

**"That is 5 codes in 15 minutes".** By design. Wait fifteen minutes. This is
what stops someone using your login page to send hundreds of emails on your
account.

**The code is rejected.** Codes last ten minutes, and each works once. If you
asked for several, only the newest works — ask for one more and use that.

**I want to test without any email provider at all.** You can, but only on your
own computer, not on Vercel. In `api/.env` set `EMAIL_DRIVER=console`, run
`npm start`, and the code is printed in the terminal. On Vercel the same setting
prints to a log you have to dig for — not worth it.

---

Next: **[5 · Take M-Pesa →](05-mpesa.md)**
