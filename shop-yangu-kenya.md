# Shop Yangu Kenya — build prompt

A wholesale and large-retail shop system, sold as software at **Ksh 1,500 per month**.
This document is the prompt to hand to a coding agent starting from an empty repository.
It describes what to build, the decisions already taken, the exact data model, and the
mistakes to avoid.

The visual and interaction reference is `docs/shop-yangu-kenya.html` in this folder — one
self-contained file, no build step, no network. Open it in a browser and use it. Everything
described here exists there as a working prototype, so when this document is ambiguous, the
prototype is the truth.

---

## 1. The one-line brief

> A phone-first shop system for Kenyan wholesalers and large retailers: sell, split the
> payment across cash/M-Pesa/card, let a customer go into credit when they come up short,
> keep stock and expiry straight, import years of old records from Excel, and produce
> KRA eTIMS-valid receipts and branded PDF/Excel exports. **Ksh 1,500 a month.**

Two constraints shape every screen:

1. **Most users are on a phone.** The owner may have a laptop; the person at the till almost
   certainly does not. Design the 360 px layout first, then let it grow.
2. **Money must be honest.** Every figure on screen is a real sum of stored rows. No rounded
   "for display" numbers, no sample values left in after a build.

---

## 2. Scope of this stage

Build the product described below. It is a new, separate product: do not import, copy or
modify the Mau Crest Hub application in this repository. Borrow the *design language* only,
as set out in §4.

Deliver, in this order:

1. A running app (frontend + API + database) with the tables in §6.
2. The screens in §5, mobile-first, all functional against real data.
3. The Excel import and the branded exports in §7.
4. Seed data that looks like a real Mombasa wholesale shop, not `lorem ipsum`.

---

## 3. One login per shop

**The shop is the account.** There is exactly one login per shop, and everyone at the
counter uses it. There are no staff accounts, no roles, no invitations, no enable/disable,
and no per-person permissions to reason about.

That is a management decision, not a placeholder: one shop owner, one password to keep,
one place to look when the shop needs to get in. Every screen in the app belongs to that
one account.

What this means for the build:

- **No role column, no role gate.** Nothing in the UI is hidden from the shop, because the
  only person who can sign in is the shop.
- **No "who sold it".** A sale belongs to the shop, not to a cashier. The receipt prints the
  shop's details and no "served by" line, the sales list has no cashier column, and the
  audit log records *what* happened rather than who did it.
- **No switch in the header** to preview another role. There is no other role.
- **The audit log stays.** It is still append-only and still useful — it is the shop's
  record of what happened, not a staff surveillance tool.

If a future customer genuinely needs staff accounts, that is a new spec and a new
conversation. Do not build the scaffolding for it now.

---

## 4. Design language

Mirror the reference prototype. It is flat, quiet, and reads well in sunlight on a cheap
phone.

**Colour** — Shop Yangu Kenya's own accent is a cerulean blue on deep navy, from the
supplied swatch sheet. The warm paper palette is shared with the reference system.

```
--syk        #287094   primary: buttons, links, chart lines, active states
--syk-dark   #023246   navigation, dark surfaces, hover on primary
--syk-tint   #E7F0F5   soft fills, selected chips, info pills
--syk-line   #D4D4CE   a soft warm grey, for rules where sand is too warm

--cream      #FFF8E1   page background
--paper      #FFFFFF   cards, inputs when focused
--cream-deep #F5EBC8   table headers, hover, progress tracks
--sand       #E7DDB5   every 1px border in the product
--ink        #1E2A22   body text
--ink-muted  #596658   secondary text

--forest     #1F4D2E   success,  --forest-tint #E3EFDF
--warning    #8F5200   low stock, --warning-tint #FBE8C2
--danger     #A8321F   out of stock, --danger-tint #F8DFD9
--gold       #B7892B   reserved for the plan/billing accents
```

**Typography** — Public Sans (self-hosted; never a Google Fonts `<link>`). Tabular figures
on every number: `font-variant-numeric: tabular-nums`. Money is always `Ksh 12,345`,
thousands separated, no decimals except where a cent matters (the payment-goal card shows
`Ksh 63,130.00` with the cents in muted grey).

**Shape and depth** — radii 10 px (inputs), 16 px (panels/cards), 20 px (dialogs), 999 px
(pills, buttons). **No shadows anywhere.** Depth comes from a 1px `--sand` border and the
cream/paper contrast. Icons are lucide line icons at 1.75 stroke, 20 px, 16 px when inline
in text.

**Layout** — one column under 900 px with a bottom tab bar (5 items: Home, Sell, Stock,
Customers, Reports) and a slide-in drawer for the rest. At 900 px and up, a 248 px navy rail
replaces both. Cards are never nested inside cards.

**The payment-goal card** — the dashboard's signature element, taken from the supplied
reference image: a white rounded card, "Payment Goal" and a small circular arrow button,
then "Total Balance" centred in large numerals with grey cents, a soft blue area sparkline,
and two full-width pill buttons — a filled blue one with an up-right arrow, a white one with
a down-left arrow. Below it, four stat cards.

**Up and down colours — read this twice.** In this product money that **falls** is **red**
and money that **rises** is **green**. That is the brief's instruction, and it is the
opposite of the habit in the reference system. Implement it as one function
(`deltaChip(pct)`), so it can be flipped in one place if the client changes their mind.

---

## 5. Screens

Eleven. Each one must work at 360 px with no horizontal scrolling outside deliberately
scrollable chip rows.

### 5.1 Dashboard
Greeting with the shop owner's first name, today's date and branch. The payment-goal card showing
today's takings as "Total Balance". Four stat cards: sales today, gross profit, receipts,
owed to you — each with a delta against yesterday, coloured by the rule above. A grouped
bar chart of this week against last week. "Needs attention": low stock, out of stock,
customers near their credit limit. Recent receipts and top movers by value.

### 5.2 Point of sale
Product search (name or barcode) and category chips. Basket lines with a large
thumb-friendly stepper (`−` / number / `+`) and a remove button. Payment: one *part* per
method, up to three, each with its own amount and a **Fill/Rest** button that inserts what
is still unpaid. Method buttons are per part, not one global selector — a split is two
amounts on two methods, and that has to be visible.

The totals block shows subtotal, VAT 16% *included*, the total, and then exactly one of:

- **Change** when they overpay, or
- **Goes to credit** in red when they come up short.

The primary button changes with the situation: "Complete sale", or "Complete and hold
Ksh 980 on credit". A blank amount on a single method means "the exact total" — do not make
the person at the till type the same number twice.

Completing a sale with a shortfall asks **who** is taking the credit, then writes the
difference to that customer's balance. The stock is decremented, the receipt is rendered
below (shop name, branch, phone, KRA PIN, lines, VAT, payments, change or credit, eTIMS
signature), and it can be printed or saved as PDF.

### 5.3 Stock
Four stat cards (products, stock value at cost, low stock, out of stock), category chips, a
search box, and the list. On a phone the list is cards; from 760 px it is a table with cost
and margin columns. Both must show the same rows — build them from one array.

The product sheet is the piece to get right for mobile: name, code, category, cost, price,
**quantity with a 52 px stepper plus +1/+6/+12/+24/+48 quick-add chips**, reorder level,
expiry date. The stepper input must be `inputmode="numeric"` and select its contents on
focus, so a stock-take is tap, type, done. Quantity *replaces* the old figure — it is a
count, not a delta, and the sheet says so in one line.

### 5.4 Purchases
Purchase orders with status (draft → ordered → received) and a Receive action that puts the
quantities on the shelf. Suppliers with their terms and what is owed.

### 5.5 Sales
Every receipt, newest first, filterable by payment method and "on credit". Each row can be
printed (branded A4/PDF) or opened in the till's receipt block. Every receipt in the shop is
listed, newest first, and the filter counts match.

### 5.6 Customers
Balance, credit limit and a usage bar per customer. "Take payment" records a payment against
the balance; overpaying leaves them in credit, and the UI says so. "Ledger" shows dated
sales and payments for that customer.

### 5.7 Import records
The migration screen described in §7.

### 5.8 Reports
Range chips (today / this week / this month / this quarter). Receipts, gross sales, VAT
included, cost of goods, gross profit, expenses, net profit, sold on credit, gross margin.
Then a breakdown by category and the expense list. Export as branded PDF or CSV.

### 5.9 KRA eTIMS
Transmitted today, waiting to send, VAT collected this month, next filing date. Device and
PIN block (business name, KRA PIN, device serial, last transmission, signature scheme).
A "send a test transmission" button that really calls the eTIMS sandbox in production.
Recent transmissions, each with its signature.

### 5.10 Settings
Plan card (price rendered from data, never hard-coded in markup — the client has said the
price will change), shop profile (name, branch, phone on receipts, KRA PIN), the shop's
single login (its name, editable in place), preferences (allow credit, ask for a customer, SMS receipts,
offline selling), and a data section with full exports.

### 5.11 Audit log
Who did what, when, filterable. Append-only: no edit, no delete, no "clear".

---

## 6. Data model

Postgres. Money as `numeric(12,2)` — never floats, never integer cents in the API. All
timestamps `timestamptz`; all *business dates* (a sale's date, an expiry date) plain `date`,
because a receipt belongs to a day, not an instant.

```sql
shop            (id, name, branch, phone, kra_pin, plan_kes, plan_renews_on, created_at)
-- one login per shop: no user table, no roles, no per-person permissions
login           (id, shop_id, name, email unique, password_hash, last_seen_at)
category        (id, shop_id, name, position)
product         (id, shop_id, sku, name, category_id, unit, cost_price, selling_price,
                 qty, reorder_level, expiry_date date null, barcode null,
                 created_at, updated_at,
                 unique (shop_id, sku))
supplier        (id, shop_id, name, phone, terms, balance_owed)
purchase_order  (id, shop_id, supplier_id, no, status enum('draft','ordered','received'),
                 ordered_on date, received_on date null, total)
po_line         (id, po_id, product_id, qty, unit_cost)
customer        (id, shop_id, name, phone, credit_limit, balance, since date, notes)
sale            (id, shop_id, receipt_no, sold_at timestamptz, sold_on date,
                 customer_id null, subtotal, vat, total,
                 credit_amount, created_at,
                 unique (shop_id, receipt_no))
sale_line       (id, sale_id, product_id, name_snapshot, qty, unit_price,
                 unit_cost_snapshot)          -- snapshots: a receipt must never change
sale_payment    (id, sale_id, method enum('cash','mpesa','card'), amount)
payment         (id, shop_id, customer_id, received_at, amount, method)
expense         (id, shop_id, spent_on date, description, category, amount)
etims_transmission (id, sale_id, status enum('pending','sent','failed'), signature,
                    sent_at, response)
audit_entry     (id, shop_id, at, action, detail)
```

Rules that matter:

- **`sale_line` snapshots the name, price and cost.** Editing a product later must not
  rewrite history, and deleting a product must not break an old receipt. This is the single
  most common bug in shop systems.
- **`receipt_no` is unique per shop** and is never reused, even after a void.
- **`customer.balance` is derived, but stored.** Store it for fast list rendering, and
  recalculate it from sales minus payments in one nightly job and in every test. If the
  two ever disagree, the derived figure wins and the stored one is repaired.
- **`sale.credit_amount`** is `total - sum(sale_payment.amount)` when positive. It is an
  explicit column so the "goes to credit" figure cannot drift.
- **VAT is inclusive**, 16%, computed as `total × 16 / 116`. Kenya prices are quoted
  inclusive; do not add tax on top at the till.

---

## 7. Excel import and branded export

### 7.1 Import

The screen offers three templates, and each is a **real `.xlsx`** — an OOXML zip with a
coloured header row, opened by Excel as a normal workbook. Not a CSV renamed `.xlsx`; not
a Google Sheet link. The prototype builds these in the browser from base64 payloads; in the
real product the API serves them from a template folder.

| Sheet | Columns |
|---|---|
| Products | `sku, name, category, unit, cost_price, selling_price, opening_qty, reorder_level, expiry_date, supplier, barcode` |
| Customers | `name, phone, credit_limit, opening_balance, since, notes` |
| Sales history | `receipt_no, date, customer, sku, qty, unit_price, amount_paid, payment_method, notes` |

The flow is: choose the sheet type → drop a file → **preview and a full validation report**
→ press Import. Nothing is written before the press, and an import can be undone as one
batch.

**Date handling is the part that goes wrong**, so it gets explicit rules:

- Dates are written `DD/MM/YY` — `02/04/26` — the way every screen, receipt and report in
  this product prints them. **Never** read that shape as `mm/dd`. `YYYY-MM-DD` and bare
  Excel serial integers are accepted too, because Excel writes them.
- Reject anything else **by row number, with the value shown**. Never guess.
- A **sale** date in the future is rejected: a sale cannot happen tomorrow.
- An **expiry** date in the future is of course allowed — do not reuse the sale rule.
- An imported sale keeps its own date. It must land in the right month's reports and must
  never appear as today's takings. Verify this with a test that imports a sale dated last
  quarter and asserts today's total is unchanged.
- A duplicate `receipt_no` or `sku` is **skipped, never doubled**, and reported.
- Rows that fail are left out; the rest go in. The report says how many of each.

Also import opening balances: a customer's `opening_balance` becomes their `balance`, and a
product's `opening_qty` becomes its `qty`. A migration is mostly these two numbers plus
receipt history.

### 7.2 Export

Every export is branded: the shop name captured at signup, the branch, the phone and the
KRA PIN at the top; "Printed by <user>" and the timestamp at the side; the shop name and
eTIMS line in the footer.

- **PDF** is a print stylesheet, not a PDF library. One hidden `#printSheet` holds the
  document; printing hides the app and prints the sheet. It must work from a phone's share
  sheet as "Save as PDF". Test it with the browser's own print output — a screenshot of a
  print-media page is how you will notice a blank second page.
- **Excel/CSV** uses the same column names as the templates, so an export can be edited and
  re-imported. Quote fields containing commas, strip the BOM on read, and write a BOM on
  export so Excel opens UTF-8 names correctly.

---

## 8. Money rules

```
subtotal          = total × 100 / 116
vat               = total × 16 / 116
total             = sum(line.qty × line.unit_price)
paid              = sum(payments)
change            = max(0, paid - total)
credit            = max(0, total - paid)
```

- A shortfall is only allowed if the shop has "allow credit" on. The till then requires a
  named customer; a walk-in cannot hold a balance.
- A blank amount with one method means the exact total.
- Rounding: round each line to 2 dp, then sum. Do not sum then round.
- Display: `Ksh 12,345` for headline figures, `Ksh 12,345.67` where cents matter. Never
  `Ksh 12,345.0` and never `12,345.00 Ksh`.

---

## 9. Technical shape

Suggested stack — a small team can hold all of this in their head:

- **Frontend:** React + TypeScript + Vite, Tailwind with the tokens above as CSS variables.
  No component library: the primitives are ~10 small components (button, field, pill,
  stepper, sheet, chip, card, table→cards, toggle, toast).
- **API:** Node + Fastify (or Express) + Zod validation, one route file per resource.
  Every response includes `shop_id` scoping — a bug where one shop sees another's data is
  the one bug that ends a SaaS.
- **Database:** Postgres with plain SQL migrations. Not an ORM that hides the money column
  types.
- **Auth:** one login per shop, scoped by `shop_id`. JWT in an httpOnly cookie; every write
  is scoped to the shop from that token, never from the request body.
- **Offline:** the till must keep selling when the signal drops. Queue sales in IndexedDB,
  show a quiet "held on this device" count, transmit on reconnect. Keep this simple and
  visible; silent data loss kills trust.
- **eTIMS:** integrate the KRA sandbox behind one interface (`submitSale(sale) →
  {signature, status}`) with a `SandboxProvider` and a `LiveProvider`. Never let the till
  block on KRA: sign locally, transmit asynchronously, retry with backoff.
- **PDF/exports:** print CSS for PDF; a server-side workbook (e.g. ExcelJS) only if the
  client needs a file larger than the browser can hold.

---

## 10. Definition of done

Check each of these in a browser at **360 px wide** and again at 1280 px. Both, every time.

- [ ] A sale with a split payment completes, and the totals match to the shilling.
- [ ] A sale that comes up short offers credit, records it against a named customer, and
      that customer's balance moves by exactly the shortfall.
- [ ] An overpayment shows change and does not touch credit.
- [ ] A product's stock drops by the quantity sold, and never goes below zero.
- [ ] The stock sheet's stepper is usable with a thumb; the quantity can be typed directly.
- [ ] The shop signs in once, and every screen is reachable from that one login.
- [ ] An import of 50 rows with 3 bad dates reports the 3 rows, imports 47, and can be
      undone in one action.
- [ ] An imported sale dated last quarter appears in that quarter's report and not in today.
- [ ] Every template downloads as an `.xlsx` that Excel opens with a coloured header row.
- [ ] Every PDF export carries the shop's name and KRA PIN, and fits one page.
- [ ] Nothing scrolls sideways at 360 px except chip rows, on any of the eleven screens.
- [ ] No figure on any screen is hard-coded. Change the seed data and every number changes.
- [ ] The plan price is read from `shop.plan_kes`; changing it to 1,200 updates every
      mention of it.

---

## 11. Traps, learned the hard way

- **`nowrap` on a block button clips the label on a phone.** Let block buttons wrap.
- **A grid column can force a page-wide scroll.** Give grid children `min-width: 0` and set
  `min-width: 0` on the main column; then measure `document.body.scrollWidth` in a test.
- **`[hidden]` loses to `display: flex`.** Add `[hidden]{display:none !important}`.
- **Four stat cards need about 148 px each.** Use
  `repeat(auto-fit, minmax(148px, 1fr))` and let the count follow the width; never fix four
  columns inside a two-thirds column.
- **Naming something `sum`, `name` or `open` at module scope shadows what you need later.**
  This bit the prototype: a `new Set()` inside a function whose name was shadowed by a
  local `sum` threw `seen.set is not a function`. Prefix helpers (`sumOf`, `readCsv`).
- **A sparkline of two points is a V.** Draw a cubic through the points, not straight lines.
- **A toast over a bottom sheet covers the buttons.** Move toasts to the top while a sheet
  is open on a phone.
- **Printing before the sheet is rendered gives a blank page.** Render, then wait a frame,
  then print.
- **The current date in a prototype should be fixed.** Time-dependent seeds make screenshots
  and tests non-reproducible; pin "today" and make every date derive from it.
- **Excel dates may be serial integers or text.** Handle both, and never silently swap
  day and month.

---

## 12. What to build next, in order

1. Auth: shop signup (capture the shop name — it brands every receipt) and the single login.
2. Products and stock, with the stepper sheet. This is what people touch most.
3. The till: basket, split payment, credit, receipt, print.
4. Customers and credit payments.
5. The Excel import, with the validation report and undo.
6. Reports and branded PDF/CSV export.
7. eTIMS: sandbox first, queue and retry, then live credentials.
8. Purchases, suppliers, expenses.
9. Billing for the Ksh 1,500 subscription (M-Pesa STK push), with a grace period rather
    than a hard lock — a shop that cannot sell because a payment failed will not come back.
10. Offline mode and the audit log.

Do not build: staff accounts or roles, multi-shop chains, payroll, a customer-facing
storefront, or a loyalty programme. None of them were asked for, and each one would slow down the thing that was.
