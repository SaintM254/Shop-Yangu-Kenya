# 5 · Each shop's own M-Pesa till

M-Pesa money goes **straight to the shop's own paybill or till**. It does not
pass through the platform, and the platform never holds anyone's money. That is
the right arrangement for a shop: no float to reconcile, no settlement delay, no
regulator asking what you are.

Which means each shop brings its own Daraja credentials. The platform supplies
the server; the shop supplies the till.

## What a shop needs from Safaricom

From the [Daraja portal](https://developer.safaricom.co.ke):

| For a **Buy Goods** till (most dukas) | For a **paybill** |
|---|---|
| Shortcode (e.g. `174379`) | Shortcode |
| Passkey | Passkey |
| Consumer key | Consumer key |
| Consumer secret | Consumer secret |
| — | Paybill number |

Then the shop adds the till in **Settings → M-Pesa**, giving it a label
("Counter till", "Duka la Mombasa") so a shop with two tills can tell them
apart.

## The callback URL is generated, not typed

When a till is added, the API mints a 32-byte random `callback_secret` and
returns:

```
https://your-api-host.example.com/pay/<64 hex characters>
```

That URL goes into the Daraja portal as the shop's callback. The path is
deliberately **not** `/api/mpesa/callback`: Safaricom's portal rejects any
callback URL containing the words `mpesa`, `m-pesa` or `safaricom`, in any
case. The URL is also unguessable, which is the point — anyone who knows it
could post fake payment confirmations. It is a bearer secret, so treat it as
one.

The API looks the till up **by that secret**, not by anything in the body:

```sql
select * from mpesa_till_by_secret($1)
```

so a forged callback cannot claim to be a different shop.

## How a payment runs

```
  till                    API                       Safaricom
   │                       │                          │
   │ POST /api/mpesa/prompt│                          │
   │ {saleId, phone, amt}  │                          │
   ├──────────────────────►│                          │
   │                       │ mpesa_start() → status   │
   │                       │ 'pending' (committed     │
   │                       │  BEFORE the network call)│
   │                       │  POST /stkpush ─────────►│
   │                       │◄──── CheckoutRequestID ──│
   │◄── {checkoutId} ──────│                          │
   │                       │                          │
   │   (customer enters PIN on their phone)            │
   │                       │◄── POST /pay/<secret> ───│
   │                       │ mpesa_complete()         │
   │◄── poll /api/mpesa/status/:id                    │
```

Three details that are easy to get wrong, and are not wrong here:

**The pending row is committed before the STK push.** If the attempt is written
only after Safaricom answers, a timeout leaves no record — and the customer may
still be charged. Writing `pending` first means a timeout leaves a row saying
"we tried", which someone can reconcile against the M-Pesa statement. A failed
push is then marked `failed`, never left `pending`.

**The callback is idempotent.** Safaricom retries callbacks. `mpesa_complete()`
credits a sale once; a replay finds the sale already paid and changes nothing.

**The callback answers exactly:**

```json
{ "ResultCode": 0, "ResultDesc": "Accepted" }
```

Anything else and Safaricom keeps retrying, which a shop experiences as the
same payment appearing several times in their statement view.

## Result codes the app understands

| Code | Meaning | What the app says |
|---|---|---|
| `0` | Paid | The sale is settled, the receipt prints |
| `1032` | Cancelled by the customer | "The customer cancelled on their phone." |
| `1037` | Timed out / no PIN | "No PIN was entered. Try again." |
| `1001` | Not enough money | "There is not enough in that M-Pesa account." |
| anything else | Unknown | The code, verbatim, so it can be given to Safaricom |

## Sandbox and production

```ini
MPESA_ENV=sandbox        # or production
MPESA_CALLBACK_BASE=https://your-api-host.example.com
MPESA_TIMEOUT_SECONDS=60
```

`MPESA_ENV` picks the base URL; you can override it with `MPESA_BASE_URL`.
The credentials themselves live in the database, per till, so moving from
sandbox to production is a matter of adding a production till — the sandbox one
can stay for testing.

## The test route

`POST /api/mpesa/tills/:id/test` asks Daraja for an OAuth token with that
till's credentials and reports whether they work, without starting a payment
and without spending anything. Use it after entering credentials; it is the
difference between "saved" and "works".

## What the API can and cannot see

`003_rls.sql` makes the credentials columns unreadable even to the API role.
It sees `v_mpesa_tills`, which has the label, shortcode, type and a boolean
`configured` — never the passkey or the consumer secret. The two `security
definer` functions (`mpesa_till_by_secret`, `mpesa_stk_password`) are the only
way to touch them, and each does one job.

So a SQL injection in a route, or a bug that dumps a row, cannot leak a shop's
Daraja credentials.
