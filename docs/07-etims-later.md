# 7 · eTIMS: what is here, and what is not

**This is the one place in the system that is scaffolded rather than finished.**
It is written down plainly so nobody discovers it during a KRA audit.

## What is real today

- **The VAT is right.** Every sale stores `total`, `subtotal` and `vat`, with
  VAT inclusive at 16%: `vat = round(total × 0.16 ÷ 1.16, 2)`. A 480 shilling
  sale carries 66.21 of VAT. That arithmetic is tested.
- **There is a place to record a transmission.** `etims_transmissions` has
  `sale_id`, `status` (`pending` / `sent` / `failed`), `signature`,
  `invoice_no`, `sent_at` and the raw `response` JSON, one row per attempt.
- **Every sale starts `pending`.** The till no longer invents a signature — the
  old mock printed a plausible-looking `KRA…` number, which is worse than
  printing nothing.
- **The screen exists.** `/etims/` shows how many receipts are sent, how many
  are waiting, and the VAT in the period, all from real data.

## What is not

**Nothing is transmitted to KRA.** There is no client for the eTIMS API, no
device initialisation, no signing of the invoice payload. The screen will show
every receipt as `pending` and it will stay that way.

That is the honest state. A shop cannot claim compliance from this build.

## What a working integration needs

1. **A registered device.** eTIMS is not a web API you call with a key; the
   taxpayer registers a *device* (a VSCU) and gets an initialisation
   certificate. KRA issues a device number, a serial and a set of keys.
2. **Signing.** Each invoice is signed with those keys before it is sent. The
   signature is what appears as the verification code on the customer's
   receipt.
3. **The transmission call** — `saveTrnsSalesOsdc` in the current API — with
   the shop's PIN, the invoice number, the line items, the VAT breakdown, and
   the signature.
4. **A queue that survives a dead connection.** A shop that loses internet
   must keep selling; the receipts are sent when it comes back, in order,
   with the original timestamps. `etims_transmissions.status = 'pending'`
   already models this, which is why the column exists before the client does.
5. **A credit note path.** A refund is a separate signed document. There is no
   refund screen yet either, so these two come together.

## The shape it would take here

```js
// api/routes/etims.js — does not exist yet
router.post('/api/etims/flush', async (req) => {
  const s = requireOwner(req);
  const pending = await db.many('select * from etims_transmissions where status = $1 …', ['pending']);
  for (const t of pending) {
    const signed = await sign(t, s.shop_id);   // the VSCU keys
    const reply = await transmit(signed);      // KRA
    /* One row per attempt, so a failure is a fact on file, not a toast. */
  }
});
```

Two rules from the rest of this codebase should carry over:

- **Never re-sign a receipt with a new number on a retry.** The same principle
  as the till not renumbering: the customer holds a piece of paper.
- **A failed transmission must not stop the sale.** The sale is the shop's
  money; the transmission is a compliance obligation that can catch up.

## Until then

Invoice the shop as not-yet-eTIMS. If a shop is already VAT-registered and
must issue fiscal receipts, they keep using their existing VSCU for those
sales, and use this system for stock, credit and the till — which is what most
small dukas do anyway.
