-- ============================================================================
--  Shop Yangu Kenya — 001_schema.sql
--
--  Run this FIRST, in a fresh Neon database, before 002_functions.sql.
--  See docs/02-sql-scripts.md for the exact steps.
--
--  Design rules this file keeps, from the product spec (§6):
--
--    · Money is numeric(12,2). Never a float, never integer cents.
--    · Instants are timestamptz. Business dates (a sale's date, an expiry)
--      are plain date — a receipt belongs to a day, not a moment.
--    · Every table that belongs to a shop carries shop_id, and every query
--      runs under row-level security (003_rls.sql), so one shop can never
--      read another shop's rows even if the API has a bug.
--    · A sale line snapshots the name, price and cost at the moment of the
--      sale, so editing a product later cannot rewrite history.
--    · receipt_no is unique per shop and never reused.
--
--  It is safe to re-run: everything is IF NOT EXISTS, and the enums are
--  created inside a DO block that tolerates them already existing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------

-- gen_random_uuid() is in core Postgres 13+, which Neon runs. pgcrypto is
-- created anyway so older projects behave the same.
create extension if not exists pgcrypto;

-- citext gives case-insensitive email columns, so "Owner@Shop.co.ke" and
-- "owner@shop.co.ke" cannot become two accounts.
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- 1. Enumerations
--
--    Enums rather than free text: a typo in a payment method should fail at
--    the database, not silently create a fourth method that no report counts.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'login_role') then
    create type login_role as enum ('owner', 'super_admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum ('cash', 'mpesa', 'card');
  end if;

  if not exists (select 1 from pg_type where typname = 'po_status') then
    create type po_status as enum ('draft', 'ordered', 'received');
  end if;

  if not exists (select 1 from pg_type where typname = 'etims_status') then
    create type etims_status as enum ('pending', 'sent', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'mpesa_till_type') then
    create type mpesa_till_type as enum ('paybill', 'till');
  end if;

  if not exists (select 1 from pg_type where typname = 'mpesa_status') then
    create type mpesa_status as enum ('pending', 'success', 'failed', 'cancelled', 'timeout');
  end if;

  if not exists (select 1 from pg_type where typname = 'otp_purpose') then
    create type otp_purpose as enum ('signup', 'signin');
  end if;

  if not exists (select 1 from pg_type where typname = 'stock_reason') then
    create type stock_reason as enum ('sale', 'purchase', 'adjustment', 'return', 'import');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The shop, and the one login that belongs to it
--
--    One login per shop, as the product decided: no staff accounts, no roles
--    to switch between. The only other role is the platform's own super
--    admin, which is not a shop and is not created by the sign-up flow.
-- ---------------------------------------------------------------------------

create table if not exists shops (
  id                uuid primary key default gen_random_uuid(),
  name              text        not null,
  branch            text        not null default 'Main branch',
  phone             text,
  kra_pin           text,
  -- Plan. Price is read from here, never hard-coded in markup.
  plan_kes          numeric(12,2) not null default 1500,
  plan_started_on   date        not null default current_date,
  plan_renews_on    date,
  -- The shop is soft-deleted: a duka that stops paying keeps its receipts.
  suspended_at      timestamptz,
  suspended_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column shops.plan_kes is 'Monthly price in whole shillings. The client said this will change: the app must read it, never hard-code it.';

-- Settings live in their own row so a partial update cannot rewrite the shop's
-- identity by accident, and so adding a preference is a new column, not a JSON
-- blob nobody can query.
create table if not exists shop_settings (
  shop_id             uuid primary key references shops (id) on delete cascade,
  allow_credit        boolean not null default true,
  ask_customer        boolean not null default false,
  sms_receipt         boolean not null default true,
  offline_selling     boolean not null default true,
  -- Which M-Pesa till the till screen defaults to (set in 006 / docs/06).
  default_mpesa_till  uuid,
  updated_at          timestamptz not null default now()
);

create table if not exists logins (
  id                 uuid primary key default gen_random_uuid(),
  -- A super admin belongs to no shop. A shop owner must have one.
  shop_id            uuid references shops (id) on delete cascade,
  email              citext      not null unique,
  name               text        not null,
  role               login_role  not null default 'owner',
  -- Null until the first OTP or magic link is used. Until then the account
  -- exists but cannot hold a session.
  email_verified_at  timestamptz,
  last_seen_at       timestamptz,
  -- Filled only if a shop ever asks for a password as well as email codes.
  password_hash      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint super_admin_has_no_shop
    check ((role = 'super_admin' and shop_id is null) or (role = 'owner' and shop_id is not null))
);

create index if not exists logins_shop_idx on logins (shop_id);

-- A sign-up that has been emailed a code but has not started yet. Keeping it
-- separate means an unverified email can never own a shop name or a login.
create table if not exists pending_signups (
  id           uuid primary key default gen_random_uuid(),
  email        citext      not null unique,
  shop_name    text        not null,
  person_name  text        not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Email sign-in: a six-digit code, and a link
--
--    Both are stored HASHED. If the database is ever dumped, the dump cannot
--    be used to sign in. Both are single-use and both expire.
--
--    Why both: a code suits a phone on a flaky connection, and a link suits
--    a laptop. The shop asked for "OTP / sign-in links" — this is the pair.
-- ---------------------------------------------------------------------------

create table if not exists login_codes (
  id           uuid primary key default gen_random_uuid(),
  -- A code belongs to an existing login (a sign-in) or to a pending sign-up
  -- (the first email a shop gets). Exactly one of the two, never both: an
  -- address that has only been emailed but not verified owns nothing yet.
  login_id     uuid        references logins (id) on delete cascade,
  pending_id   uuid        references pending_signups (id) on delete cascade,
  -- An HMAC of the six digits with the server's pepper. Never the digits.
  code_hash    text        not null,
  purpose      otp_purpose not null,
  expires_at   timestamptz not null,
  attempts     smallint    not null default 0,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint login_code_has_one_owner
    check ((login_id is null) <> (pending_id is null)),
  constraint signup_code_is_for_signups
    check (pending_id is null or purpose = 'signup')
);

create index if not exists login_codes_login_idx on login_codes (login_id, created_at desc);
create index if not exists login_codes_pending_idx on login_codes (pending_id, created_at desc);

create table if not exists login_tokens (
  id           uuid primary key default gen_random_uuid(),
  -- Same rule as login_codes: a sign-in link, or a sign-up link.
  login_id     uuid        references logins (id) on delete cascade,
  pending_id   uuid        references pending_signups (id) on delete cascade,
  -- An HMAC of a 32-byte random token. The URL carries the raw value once.
  token_hash   text        not null unique,
  purpose      otp_purpose not null,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint login_token_has_one_owner
    check ((login_id is null) <> (pending_id is null)),
  constraint signup_link_is_for_signups
    check (pending_id is null or purpose = 'signup')
);

create index if not exists login_tokens_login_idx on login_tokens (login_id, created_at desc);
create index if not exists login_tokens_pending_idx on login_tokens (pending_id, created_at desc);

comment on table login_tokens is 'Magic links. Single use, 30 minutes, hashed at rest.';

-- ---------------------------------------------------------------------------
-- 4. Sessions
--
--    A session is the cookie the app carries. It records the device, so the
--    super-admin screen can show "who is logged in" honestly, and so a shop
--    can end a session it does not recognise.
-- ---------------------------------------------------------------------------

create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  -- Only the hash of the cookie value is stored.
  token_hash    text        not null unique,
  login_id      uuid        not null references logins (id) on delete cascade,
  shop_id       uuid        references shops (id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),
  revoked_at    timestamptz,
  ip            text,
  user_agent    text
);

create index if not exists sessions_login_idx   on sessions (login_id);
create index if not exists sessions_live_idx    on sessions (expires_at desc) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 5. Catalogue
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid        not null references shops (id) on delete cascade,
  name      text        not null,
  position  smallint    not null default 0,
  unique (shop_id, name)
);

create table if not exists products (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid          not null references shops (id) on delete cascade,
  category_id    uuid          references categories (id) on delete set null,
  sku            text          not null,
  name           text          not null,
  unit           text          not null default 'piece',
  cost_price     numeric(12,2) not null default 0 check (cost_price >= 0),
  selling_price  numeric(12,2) not null default 0 check (selling_price >= 0),
  -- The shelf count. Every change also writes a stock_movements row, so a
  -- number that looks wrong can be explained.
  qty            numeric(12,3) not null default 0,
  reorder_level  numeric(12,3) not null default 0,
  expiry_date    date,
  barcode        text,
  active         boolean       not null default true,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  unique (shop_id, sku)
);

create index if not exists products_shop_idx  on products (shop_id) where active;
create index if not exists products_name_trgm on products (shop_id, lower(name));

create table if not exists stock_movements (
  id          bigserial   primary key,
  shop_id     uuid        not null references shops (id) on delete cascade,
  product_id  uuid        not null references products (id) on delete cascade,
  reason      stock_reason not null,
  -- Positive for stock in, negative for stock out. qty_after is the level
  -- the shelf was left at, so a movement is self-explaining.
  change      numeric(12,3) not null,
  qty_after   numeric(12,3) not null,
  note        text,
  sale_id     uuid,
  login_id    uuid        references logins (id) on delete set null,
  at          timestamptz not null default now()
);

create index if not exists stock_movements_product_idx on stock_movements (product_id, at desc);

-- ---------------------------------------------------------------------------
-- 6. Suppliers and purchase orders
-- ---------------------------------------------------------------------------

create table if not exists suppliers (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid          not null references shops (id) on delete cascade,
  name           text          not null,
  phone          text,
  terms          text          not null default 'Cash on delivery',
  balance_owed   numeric(12,2) not null default 0,
  created_at     timestamptz   not null default now()
);

create table if not exists purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid          not null references shops (id) on delete cascade,
  supplier_id  uuid          references suppliers (id) on delete set null,
  no           text          not null,
  status       po_status     not null default 'draft',
  ordered_on   date,
  received_on  date,
  total        numeric(12,2) not null default 0,
  created_at   timestamptz   not null default now(),
  unique (shop_id, no)
);

create table if not exists po_lines (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid          not null references purchase_orders (id) on delete cascade,
  product_id  uuid          references products (id) on delete set null,
  name        text          not null,
  qty         numeric(12,3) not null check (qty > 0),
  unit_cost   numeric(12,2) not null check (unit_cost >= 0)
);

-- ---------------------------------------------------------------------------
-- 7. Customers and credit
-- ---------------------------------------------------------------------------

create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid          not null references shops (id) on delete cascade,
  name          text          not null,
  phone         text,
  -- 0 means "no credit": a walk-in can buy but cannot owe.
  credit_limit  numeric(12,2) not null default 0,
  -- Money the customer already owed when the shop started using the system.
  -- It is not a sale — no goods moved through the till today — so it is kept
  -- apart from the sales ledger and added in when the balance is worked out.
  opening_balance numeric(12,2) not null default 0,
  -- Derived from openings, sales and payments, but stored so a report does not
  -- have to sum a year of history. recalc_customer_balance() keeps it right.
  balance       numeric(12,2) not null default 0,
  since         date          not null default current_date,
  notes         text,
  created_at    timestamptz   not null default now()
);

create index if not exists customers_shop_idx on customers (shop_id, name);

-- ---------------------------------------------------------------------------
-- 8. Sales
--
--    A sale is one row. Its money is split into sale_lines (what was sold)
--    and sale_payments (how it was paid). A shortfall is credit_amount.
-- ---------------------------------------------------------------------------

create table if not exists sales (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid          not null references shops (id) on delete cascade,
  receipt_no    text          not null,
  sold_at       timestamptz   not null default now(),
  sold_on       date          not null default current_date,
  customer_id   uuid          references customers (id) on delete set null,
  -- The name as printed, so a renamed customer does not rewrite a receipt.
  customer_name text          not null default 'Walk-in',
  subtotal      numeric(12,2) not null,
  vat           numeric(12,2) not null default 0,
  total         numeric(12,2) not null,
  credit_amount numeric(12,2) not null default 0 check (credit_amount >= 0),
  created_by    uuid          references logins (id) on delete set null,
  created_at    timestamptz   not null default now(),
  unique (shop_id, receipt_no),
  -- VAT is 16% of the gross. Checked, not assumed: a sale that does not add
  -- up is a bug, and it should fail here rather than in a KRA report.
  constraint vat_adds_up check (abs(subtotal + vat - total) < 0.02)
);

create index if not exists sales_shop_date_idx on sales (shop_id, sold_on desc, sold_at desc);

create table if not exists sale_lines (
  id                 uuid primary key default gen_random_uuid(),
  sale_id            uuid          not null references sales (id) on delete cascade,
  product_id         uuid          references products (id) on delete set null,
  -- Snapshots. A receipt must never change because the price changed today.
  name_snapshot      text          not null,
  qty                numeric(12,3) not null check (qty > 0),
  unit_price         numeric(12,2) not null check (unit_price >= 0),
  unit_cost_snapshot numeric(12,2) not null default 0
);

create index if not exists sale_lines_sale_idx on sale_lines (sale_id);

create table if not exists sale_payments (
  id       uuid primary key default gen_random_uuid(),
  sale_id  uuid          not null references sales (id) on delete cascade,
  method   payment_method not null,
  amount   numeric(12,2) not null check (amount > 0),
  -- For M-Pesa, the Safaricom receipt and the request it came from.
  mpesa_receipt text,
  mpesa_request_id uuid
);

create index if not exists sale_payments_sale_idx on sale_payments (sale_id);

-- One M-Pesa payment per M-Pesa request. The callback can be retried, so this
-- index (not the application) is what guarantees the money lands exactly once.
create unique index if not exists sale_payments_mpesa_request_uidx
  on sale_payments (mpesa_request_id) where mpesa_request_id is not null;

-- Money a customer pays against what they already owe. Separate from a sale
-- payment: it settles an old receipt, it is not part of a new sale.
create table if not exists credit_payments (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid          not null references shops (id) on delete cascade,
  customer_id  uuid          not null references customers (id) on delete cascade,
  received_at  timestamptz   not null default now(),
  amount       numeric(12,2) not null check (amount > 0),
  method       payment_method not null,
  note         text,
  received_by  uuid          references logins (id) on delete set null
);

create index if not exists credit_payments_customer_idx on credit_payments (customer_id, received_at desc);

-- ---------------------------------------------------------------------------
-- 9. Expenses
-- ---------------------------------------------------------------------------

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid          not null references shops (id) on delete cascade,
  spent_on    date          not null default current_date,
  description text          not null,
  category    text          not null default 'Other',
  amount      numeric(12,2) not null check (amount > 0),
  created_at  timestamptz   not null default now()
);

create index if not exists expenses_shop_date_idx on expenses (shop_id, spent_on desc);

-- ---------------------------------------------------------------------------
-- 10. KRA eTIMS
--
--     The sandbox integration lands here later. The table exists now so a
--     sale can be recorded and marked "not yet transmitted" without a
--     migration on the day eTIMS is switched on.
-- ---------------------------------------------------------------------------

create table if not exists etims_transmissions (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid          not null references sales (id) on delete cascade,
  status     etims_status  not null default 'pending',
  signature  text,
  invoice_no text,
  sent_at    timestamptz,
  response   jsonb,
  created_at timestamptz   not null default now()
);

create index if not exists etims_status_idx on etims_transmissions (status, created_at);

-- ---------------------------------------------------------------------------
-- 11. M-Pesa, one till per shop
--
--     A shop's till number, passkey, consumer key and secret belong to the
--     shop's row here — not to the platform's environment. Two dukas have
--     two tills, and each prompt must go out under the shop whose counter it
--     is. docs/06-mpesa-per-shop.md explains the flow and why the callback
--     carries a per-shop secret.
-- ---------------------------------------------------------------------------

create table if not exists mpesa_tills (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid        not null references shops (id) on delete cascade,
  label             text        not null default 'Main till',
  -- 5-7 digits. For a Buy Goods (Till) number, this is the store number.
  shortcode         text        not null check (shortcode ~ '^[0-9]{5,7}$'),
  type              mpesa_till_type not null default 'till',
  -- Safaricom issues a different passkey per shortcode.
  passkey           text        not null,
  -- The Daraja app credentials. Stored encrypted at rest by the API (see
  -- docs/06); the column is text because the ciphertext is base64.
  consumer_key      text        not null,
  consumer_secret   text        not null,
  -- Random per shop. It is the only thing in an unauthenticated Safaricom
  -- callback URL that proves which shop the payment belongs to.
  callback_secret   text        not null unique,
  environment       text        not null default 'sandbox' check (environment in ('sandbox', 'production')),
  is_default        boolean     not null default false,
  active            boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (shop_id, shortcode)
);

-- Only one default till per shop.
create unique index if not exists mpesa_one_default_per_shop
  on mpesa_tills (shop_id) where is_default;

create table if not exists mpesa_requests (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid          not null references shops (id) on delete cascade,
  till_id             uuid          references mpesa_tills (id) on delete set null,
  sale_id             uuid          references sales (id) on delete set null,
  -- Safaricom's two identifiers. checkout_request_id is what the callback
  -- quotes, and it is unique, so a repeated callback cannot double-credit.
  checkout_request_id text          unique,
  merchant_request_id text,
  phone               text          not null,
  amount              numeric(12,2) not null check (amount > 0),
  account_ref         text          not null,
  status              mpesa_status  not null default 'pending',
  result_code         integer,
  result_desc         text,
  -- The Safaricom receipt (e.g. "NLJ7RT61SV"). Unique where present: the same
  -- payment can never be posted twice.
  mpesa_receipt       text unique,
  raw                 jsonb,
  created_at          timestamptz   not null default now(),
  completed_at        timestamptz
);

create index if not exists mpesa_requests_shop_idx on mpesa_requests (shop_id, created_at desc);
create index if not exists mpesa_requests_pending_idx on mpesa_requests (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- 12. Audit log
--
--     Append-only. No update, no delete: a rule enforced by grants in 004 and
--     by having no endpoint that writes to it directly.
-- ---------------------------------------------------------------------------

create table if not exists audit_entries (
  id        bigserial   primary key,
  shop_id   uuid        references shops (id) on delete cascade,
  login_id  uuid        references logins (id) on delete set null,
  at        timestamptz not null default now(),
  action    text        not null,
  detail    text
);

create index if not exists audit_shop_idx on audit_entries (shop_id, at desc);

-- ---------------------------------------------------------------------------
-- 13. Platform-level notes for the super admin
-- ---------------------------------------------------------------------------

create table if not exists admin_notes (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid        references shops (id) on delete cascade,
  login_id   uuid        references logins (id) on delete cascade,
  note       text        not null,
  created_by uuid        references logins (id) on delete set null,
  created_at timestamptz not null default now()
);
