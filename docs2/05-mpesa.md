# Step 5 — M-Pesa

*20 minutes to set up. Free from this software — Safaricom charges their normal
per-payment tariff, exactly as at the counter. **Approval can take up to a
week**, so start this early even if you finish the rest first.*

Skip this and you have a shop that records sales, cash and credit. Do this and a
customer can pay with M-Pesa, and the sale marks itself paid.

---

## Read this first: the money never touches this software

When a customer pays through your shop, **the money goes straight into your own
paybill or till number.** It does not pass through this software, and this
software never holds anyone's money.

Three consequences, all of them good:

- **Each shop brings its own till.** A shop that wants M-Pesa needs its own
  Daraja (Safaricom developer) account and its own shortcode.
- **There is no float to reconcile.** The money is where it would have been if
  the customer had paid at the counter.
- **The platform is not a payment provider**, so it is not regulated like one.

> **Word to know — Daraja.** Safaricom's developer portal,
> <https://developer.safaricom.co.ke>. It is where a till's credentials come
> from. *Daraja* means "bridge" in Swahili.

> **Word to know — shortcode.** The number a customer pays to. A **paybill** asks
> for an account number; a **till** (Buy Goods) does not.

---

## Step 1 — Make sure you have a business shortcode

You need a paybill or till number **registered to your business**, with M-Pesa
already working at the counter. If a customer can already pay you by M-Pesa on
their phone today, you have this — skip to Step 2.

If you do not:

1. Go to any Safaricom shop, or your bank, and ask for an **M-Pesa paybill for
   business** (sometimes called *Lipa na M-Pesa*). Take your business permit or
   registration and your ID.
2. It takes days to weeks. Start it now.

> **Do not use a personal M-Pesa number.** It has to be a business shortcode, or
> Daraja will not issue credentials for it — and the money would land in a
> personal wallet.

---

## Step 2 — Get Daraja credentials

1. Go to <https://developer.safaricom.co.ke> and sign up. Free.
2. Press **My Apps** → **Add a new app**.
   - **App name:** `Shop Yangu`
   - **Products:** tick **Lipa na M-Pesa Online** (this is STK push)
   - Press **Create app**
3. The app now shows three things. Copy each:

   | What it is called | Where it ends up |
   |---|---|
   | **Consumer Key** | your shop → **Settings** → M-Pesa |
   | **Consumer Secret** | the same place |
   | **Passkey** | the same place |

4. Note which **environment** the app is in:

   - **Sandbox** — testing. Takes fake money, no phone rings.
   - **Production** — real money. You apply for this separately ("Go Live") and
     Safaricom approves it.

> **Word to know — STK push.** The prompt that appears *on the customer's own
> phone*, asking for their M-Pesa PIN. Nothing is charged until they enter it.
> Nobody behind the counter ever touches a customer's money.

---

## Step 3 — Tell your shop about its till

This happens **inside your shop**, not in Vercel. Each shop has its own till.

1. Sign in at `https://your-address/login/`.
2. Open **Settings**.
3. Find the **M-Pesa** section.
4. Fill in:

   | Field | What to type |
   |---|---|
   | **Shortcode** | your paybill or till number, digits only |
   | **Type** | Paybill or Till, whichever you were issued |
   | **Consumer Key** | from Daraja, Step 2 |
   | **Consumer Secret** | from Daraja, Step 2 |
   | **Passkey** | from Daraja, Step 2 |
   | **Callback URL** | leave exactly as shown |

5. Save.

> **The callback address** is built from your site address and looks like
> `https://your-address/pay/4f3a9c…`. It is unique per shop, and it is what
> Safaricom calls when a customer finishes paying. **Leave it as the page
> shows it.**

> **Do not put till credentials in Vercel.** They live in the database, per shop,
> because different shops have different tills. Vercel holds only the
> platform-wide switch between sandbox and live.

---

## Step 4 — Test with sandbox money

Before any real money moves, prove the whole loop works.

1. Add two settings in Vercel → **Settings** → **Environment Variables**:
   - `MPESA_ENV` = `sandbox`
   - `MPESA_CALLBACK_BASE` = `https://your-address.vercel.app` — no trailing slash
2. **Redeploy** (Deployments → ⋯ → Redeploy).
3. In the shop, make a small sale and choose M-Pesa.
4. With sandbox credentials no real phone rings — that is expected. The sale
   should appear in **Sales** as awaiting payment.

> **Where the sandbox always trips people up:** the sandbox shortcode and
> passkey are **not** your live ones, and Daraja's test credentials are not the
> ones on your app page. The sandbox test values are published on the Daraja
> site under **Test Credentials**. Use those while `MPESA_ENV=sandbox`.

---

## Step 5 — Go live

Only once sandbox works and Safaricom has approved your app for production.

1. In Daraja, complete **Go Live**. You get a production consumer key and secret.
2. In the shop's **Settings → M-Pesa**, replace the key, secret and passkey with
   the **production** ones, and set the shortcode to your live one.
3. In Vercel, change `MPESA_ENV` to `production`. Check
   `MPESA_CALLBACK_BASE` is your real domain, with `https://` and no trailing
   slash.
4. Redeploy.
5. Make one real sale to yourself for KES 1. The phone should ring, and the sale
   should mark itself paid within seconds.

> **The callback must be public HTTPS, and must not contain the words `mpesa`,
> `m-pesa` or `safaricom`.** Safaricom rejects those addresses. Vercel's
> `.vercel.app` addresses contain none of them, which is why the path is
> `/pay/<random string>` rather than `/api/mpesa/callback`.

---

## Check it worked

- [ ] The shop's Settings page saved a shortcode, key, secret and passkey
- [ ] A sale made with M-Pesa appears in **Sales**, awaiting payment on sandbox
- [ ] `/api/health` still says `"ok":true`
- [ ] In live mode, one real KES 1 payment appears in your M-Pesa statement

---

## If it does not work

**The phone does not ring.**
In sandbox it never will — that is what sandbox means. In production, check
`MPESA_ENV` really says `production` in Vercel, and that the shop's credentials
are the production ones.

**"Invalid shortcode" / "Bad Request - Invalid Shortcode".**
The shortcode in the shop's settings does not belong to those credentials. A
production key with a sandbox shortcode fails exactly like this.

**The customer paid but the sale still says unpaid.**
The callback did not reach you. Check `MPESA_CALLBACK_BASE` is your real public
address, with `https://` and no trailing slash, and that you redeployed after
changing it. Safaricom can only call a public address; `localhost` never works.

**"Callback URL rejected".**
The address contains `mpesa`, `m-pesa` or `safaricom`. Use the `/pay/…` address
the settings page shows, and nothing else.

**"Wrong passkey".**
Sandbox and production passkeys differ, and the passkey belongs to the
shortcode, not the app. Copy it from the Daraja page for the *same* shortcode
you entered.

**The money went to the wrong place.**
It cannot — the shortcode in the shop's settings is where it goes. Check that it
is your business shortcode and not a test one.

---

Next: **[Step 6 — When something is wrong](06-troubleshooting.md)**
