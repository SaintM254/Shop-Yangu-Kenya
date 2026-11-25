# 7 · eTIMS and KRA receipts

**This is the one part of the system that is deliberately unfinished.** It is
written down plainly, in public, so nobody finds out about it during a KRA
audit.

Read this before you sell to a VAT-registered business and before you promise
anyone that this software files their taxes.

> **Word to know — eTIMS:** Kenya Revenue Authority's system for electronic tax
> invoices. VAT-registered businesses must send each sale to KRA and print a
> verification code on the customer's receipt.
>
> **Word to know — VAT:** Value Added Tax, 16% in Kenya. It is *inside* the
> price a customer sees, not added on top.

---

## What works today

**The VAT arithmetic is correct, and tested.** Every sale stores the total, the
amount before VAT, and the VAT itself. VAT is included in the price at 16%, so
on a KES 480 sale:

```
VAT = 480 × 16 ÷ 116 = KES 66.21
```

That sum is checked by the automated tests on every change. It is the part that
would cost a shop real money if it were wrong, so it is the part that is
finished.

**Every sale is recorded as "not yet sent".** When a sale happens, the system
notes that it still needs a fiscal receipt. Nothing pretends otherwise.

**The screen exists.** `/etims/` shows how many receipts are sent, how many are
waiting, and the VAT for the period — all from real data. Every receipt will
show as **pending**, and will stay that way until the integration exists.

**No fake numbers.** An earlier version printed a plausible-looking `KRA…`
number on receipts. That was removed: a made-up verification code is worse than
no code, because a customer could believe it and a shop could be accused of
fabricating one.

---

## What does not work

**Nothing is sent to KRA.** There is no connection to their system. A shop
cannot claim eTIMS compliance on the strength of this build. If a shop is
VAT-registered and must issue fiscal receipts, they keep using their existing
fiscal device for those sales and use this system for stock, credit and the
till — which is what most small dukas do anyway.

---

## What it would take to finish it

Five pieces of work, roughly in order of difficulty. There is no shortcut
around the first one.

1. **A registered device.** eTIMS is not a website you call with a password.
   The business registers a *device* with KRA — a VSCU — and KRA issues a device
   number, a serial number and a set of keys. This is paperwork, not code, and
   it has to come first.

2. **Signing each receipt.** Every invoice is signed with those keys before it
   is sent. That signature is what the customer sees as the verification code.
   Without the device from step 1, there is nothing to sign with.

3. **The sending call.** KRA's current endpoint for a sale
   (`saveTrnsSalesOsdc`) needs the shop's tax PIN, an invoice number, the line
   items, the VAT breakdown, and the signature.

4. **A queue that survives a dead connection.** This part is already designed.
   A shop that loses internet must keep selling, and the receipts go when it
   comes back, in order, keeping their original times. That is what the
   `pending` status is for, and it is why the column exists before the code
   does.

5. **Credit notes.** A refund is a separate signed document, not a negative
   sale. There is no refund screen yet either, so the two arrive together.

Two rules from the rest of this system carry over:

- **Never re-sign a receipt with a new number on a retry.** The customer is
  holding a piece of paper. This is the same rule that stops the till
  renumbering a receipt.
- **A failed tax transmission must never stop a sale.** The sale is the shop's
  money; the transmission is a compliance duty that can catch up.

---

## Until then

If you are setting this up for a shop:

- **Do not** tell the shop this handles eTIMS.
- **Do** tell them the VAT on every sale is calculated and stored correctly,
  which is the number their accountant will ask for.
- If the shop must issue fiscal receipts today, they keep their fiscal device
  beside this system.

---

Next: **[8 · How much this costs →](08-cost-and-limits.md)**
