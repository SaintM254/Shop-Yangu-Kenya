# 5 · Take M-Pesa

**Time:** 20 minutes · **Setup cost:** free — Safaricom charges their normal
per-payment tariff, exactly as at the counter · **Approval time:** up to a week,
so start early

Skip this and you have a shop that records sales and cash. Do this and a
customer can pay with M-Pesa, and the sale marks itself paid.

---

## The money never touches the platform

Read this first, because it decides how you set up everything else.

When a customer pays through your shop, **the money goes straight into your own
M-Pesa paybill or till number.** It does not pass through this software, and
this software never holds anyone's money.

That is the right arrangement, and it has three consequences:

- **Each shop brings its own till.** A shop that wants M-Pesa needs its own
  Daraja (Safaricom developer) account and its own shortcode.
- **There is no float to reconcile.** The money is where it would be if the
  customer had paid at the counter.
- **The platform is not a payment provider**, so it is not regulated like one.

> **Word to know — Daraja:** Safaricom's developer portal, at
> <https://developer.safaricom.co.ke>. It is where a till's credentials come
> from. "Daraja" means "bridge" in Swahili.

> **Word to know — shortcode:** the number a customer pays to. A **paybill**
> asks for an account number; a **till** (Buy Goods) does not.

---

## Step 1 · Get a shortcode

You need a paybill or till number **registered to your business**, with M-Pesa
already working at the counter. If a customer can already pay you by M-Pesa on
their phone, you have this.

If you do not have one:

1. Go to any Safaricom shop or your business bank and ask for an **M-Pesa
   paybill for business** (sometimes "Lipa na M-Pesa"). You need your business
   permit or registration and your ID.
2. It takes days to weeks. Start it now and come back to this page later.

> **Do not use a personal M-Pesa number.** It needs to be a business shortcode,
> or Daraja will not issue credentials for it and the money would land in a
> personal wallet.

---

## Step 2 · Get Daraja credentials

1. Go to <https://developer.safaricom.co.ke> and **sign up** (free).
2. Click **My Apps** → **Add a new app**.
   - **App name:** `Shop Yangu`
   - **Products:** tick **Lipa na M-Pesa Online** (this is "STK push").
   - Click **Create app**.
3. The app now shows three things. Copy each:

   | What it is called | Where you will put it |
   |---|---|
   | **Consumer Key** | Your shop → **Settings** → M-Pesa |
   | **Consumer Secret** | the same place |
   | **Passkey** | the same place |

4. While you are there, note which **environment** your app is in:
   - **Sandbox** — for testing. It takes fake money and no real phone rings.
   - **Production** — real money, real customers. You must apply for this
     separately ("Go live"), and Safaricom approves it.

> **Word to know — STK push:** the prompt that appears *on the customer's own
> phone* asking them to enter their M-Pesa PIN. Nothing is charged until they
> do. The person behind the counter never touches the customer's money.

---

## Step 3 · Tell the site about its till

This part is done **inside your shop**, not in Vercel. Each shop has its own
settings.

1. Sign in to your shop at `https://your-address/login/`.
2. Go to **Settings**.
3. Find the **M-Pesa** section.
4. Fill in:

   | Field | What to type |
   |---|---|
   | **Shortcode** | Your paybill or till number, digits only |
   | **Type** | Paybill or Till, whichever you were issued |
   | **Consumer Key** | From Daraja, step 2 |
   | **Consumer Secret** | From Daraja, step 2 |
   | **Passkey** | From Daraja, step 2 |
   | **Callback URL** | Leave as shown — see below |

5. Save. The till is now stored, encrypted, against your shop.

> **The callback address** is generated from your site address and looks like
> `https://your-address/pay/4f3a9c...`. It is unique per shop. It is what
> Safaricom calls when a customer finishes paying. **Leave it exactly as the
> page shows it.**

> **Do not edit this in Vercel.** Till credentials live in the database, per
> shop, because different shops have different tills. Vercel holds only the
> platform-wide switch for sandbox versus live.

---

## Step 4 · Test with sandbox money

Before any real money moves, prove the whole loop works.

1. Add these two settings in Vercel → **Settings** → **Environment Variables**:
   - `MPESA_ENV` = `sandbox`
   - `MPESA_CALLBACK_BASE` = your site address, e.g.
     `https://your-address.vercel.app` — no trailing slash
2. **Redeploy** (Deployments → ⋯ → Redeploy).
3. Sign in to your shop and make a sale of a small amount, choosing M-Pesa as
   the payment method.
4. With sandbox credentials, no real phone rings — this is expected. Check the
   sale in **Dashboard** or **Sales**: it should show as awaiting payment, not
   as paid.

> **Where the sandbox part always trips people up:** the sandbox shortcode and
> passkey are **not** your live ones, and Daraja's test credentials differ from
> the ones on your app page. The sandbox test values are published on the
> Daraja site under **Test Credentials**. Use those while `MPESA_ENV=sandbox`.

---

## Step 5 · Go live

Only when sandbox works and Safaricom has approved your app for production:

1. In Daraja, complete **Go Live**. You get production consumer key and secret.
2. In your shop's **Settings → M-Pesa**, replace the consumer key, secret and
   passkey with the **production** ones, and set the shortcode to your live one.
3. In Vercel, change `MPESA_ENV` to `production`, and make sure
   `MPESA_CALLBACK_BASE` is your real domain with `https://` and no trailing
   slash.
4. Redeploy.
5. Make one real sale to yourself for KES 1. The phone should ring, and the
   sale should mark itself paid within a few seconds.

> **The callback must be public HTTPS and must not contain the words `mpesa`,
> `m-pesa` or `safaricom`.** Safaricom rejects such addresses. Vercel's
> `...vercel.app` addresses contain none of them, which is why the path is
> `/pay/<a long random string>` and not `/api/mpesa/callback`.

---

## ✅ Success looks like this

- [ ] Your shop's Settings page saved a shortcode, key, secret and passkey.
- [ ] A sale made with M-Pesa shows up in **Sales**, marked as awaiting payment
      (sandbox) or paid (live, after the customer enters their PIN).
- [ ] `/api/health` on your site still returns `"ok":true`.
- [ ] In live mode, one real KES 1 payment arrived in your M-Pesa statement.

---

## If it does not work

**"The phone does not ring."** In sandbox, it never will — that is what sandbox
means. In production, check `MPESA_ENV` really says `production` in Vercel, and
that the shop's credentials are the production ones, not the sandbox ones.

**"Invalid shortcode" / "Bad Request - Invalid Shortcode".** The shortcode in
your shop's settings is not the one the credentials belong to. They must match
exactly: a production key with a sandbox shortcode fails this way.

**"The customer paid but the sale still says unpaid."** The callback did not
reach you. Check `MPESA_CALLBACK_BASE` in Vercel is your real public address,
with `https://` and no trailing slash, and that you redeployed after changing
it. Safaricom can only call a public address — `localhost` will never work.

**"Callback URL rejected."** The address contains `mpesa`, `m-pesa` or
`safaricom`. Use the `/pay/...` address the settings page gives you and nothing
else.

**"Wrong passkey."** Sandbox and production passkeys are different, and the
passkey belongs to the shortcode, not to the app. Copy it from the Daraja page
for the *same* shortcode you entered.

**"The money went to the wrong place."** It cannot — the shortcode in your
shop's settings is where it goes. Check it is your business shortcode and not a
test one.

---

Next: **[6 · The platform console →](06-admin.md)**
