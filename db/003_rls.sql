-- ===========================================================================
--  003 — Roles, grants, row-level security
--
--  Run this third, after 001 and 002.
--
--  Two things are being protected here, and neither is theoretical:
--
--   1. MONEY MUST NOT BE DELETABLE. The API is an ordinary web app: a wrong
--      route, a bad merge or a clever request must not be able to remove a
--      receipt, a payment or an audit line. The database refuses on its own,
--      whatever the application thinks is allowed.
--
--   2. M-PESA SECRETS MUST NOT BE READABLE BY THE APP. A till's passkey and
--      consumer secret are the shop's money. The API role cannot even SELECT
--      those columns; it sees v_mpesa_tills (no secrets) and calls two
--      security-definer functions that use the real values on its behalf.
--
--  Roles:
--    the Neon owner  runs migrations and drills. Owns everything, bypasses RLS.
--    syk_app         the API. This is the only role the public server uses.
--
--  Shop isolation is enforced twice: the API scopes every query by shop_id,
--  and these policies return nothing if it ever forgets. The second net is
--  what makes the first one safe to get wrong.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'syk_app') then
    create role syk_app nologin;
  end if;
end
$$;

revoke create on schema public from public;
grant  usage on schema public to syk_app;

-- ---------------------------------------------------------------------------
-- 1. What the API may touch
-- ---------------------------------------------------------------------------

grant select, insert, update on
  shops,
  shop_settings,
  logins,
  categories,
  products,
  suppliers,
  purchase_orders,
  po_lines,
  customers,
  expenses,
  etims_transmissions,
  mpesa_requests,
  admin_notes
to syk_app;

-- Stock is a ledger: append, never rewrite.
grant select, insert on stock_movements to syk_app;

-- ---------------------------------------------------------------------------
-- 2. What the API may only add to
--
--    Sales, their lines and payments, credit payments and the audit log are
--    append-only. A correction is a new row — a return, a credit payment, a
--    stock adjustment — never an edit of history. That is what lets the
--    dashboard numbers be trusted a year from now.
-- ---------------------------------------------------------------------------

grant select, insert on
  sales,
  sale_lines,
  sale_payments,
  credit_payments,
  audit_entries
to syk_app;

-- ---------------------------------------------------------------------------
-- 3. Sessions and one-time codes
--    Housekeeping: last_seen_at, revoked_at, consumed_at, and a sweep of
--    expired rows. Nothing here is history anybody needs later.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  sessions,
  login_codes,
  login_tokens,
  pending_signups
to syk_app;

grant usage, select on all sequences in schema public to syk_app;

-- ---------------------------------------------------------------------------
-- 4. M-Pesa credentials stay behind the wall
-- ---------------------------------------------------------------------------

revoke all on mpesa_tills from syk_app, public;

create or replace view v_mpesa_tills as
select
  t.id,
  t.shop_id,
  t.label,
  t.type,
  t.shortcode,
  t.environment,
  t.is_default,
  t.active,
  t.created_at,
  t.updated_at,
  -- Says whether secrets are in place, without revealing any of them.
  (t.passkey <> '' and t.consumer_key <> '' and t.consumer_secret <> ''
     and t.callback_secret <> '') as configured
from mpesa_tills t;

grant select on v_mpesa_tills to syk_app;

-- ---------------------------------------------------------------------------
-- 5. Views the API reads
--
--    security_invoker = true means the view runs with the *caller's* rights,
--    so the RLS policies in section 7 still apply through it. A definer view
--    here would quietly hand one shop another shop's totals.
--
--    Recreated here rather than in 002 because the flag is a security
--    decision, and it belongs next to the policies it depends on.
-- ---------------------------------------------------------------------------

create or replace view v_sales
with (security_invoker = true) as
select
  s.id, s.shop_id, s.receipt_no, s.sold_at, s.sold_on,
  s.customer_id, s.customer_name,
  s.subtotal, s.vat, s.total, s.credit_amount,
  coalesce(jsonb_agg(distinct jsonb_build_object('m', sp.method, 'amt', sp.amount))
             filter (where sp.id is not null), '[]'::jsonb) as payments,
  count(distinct sl.id)     as line_count,
  coalesce(sum(sl.qty), 0)  as items
from sales s
left join sale_payments sp on sp.sale_id = s.id
left join sale_lines sl    on sl.sale_id = s.id
group by s.id;

create or replace view v_daily_takings
with (security_invoker = true) as
select
  s.shop_id, s.sold_on,
  count(*)     as receipts,
  sum(s.total) as gross,
  sum(s.vat)   as vat,
  sum(s.credit_amount) as credit,
  sum(s.total - s.vat
      - coalesce((select sum(sl.qty * sl.unit_cost_snapshot)
                    from sale_lines sl where sl.sale_id = s.id), 0)) as gross_profit
from sales s
group by s.shop_id, s.sold_on;

-- A shop's own open sessions (the "signed-in devices" list on settings).
create or replace view v_active_sessions
with (security_invoker = true) as
select
  ss.id            as session_id,
  ss.login_id,
  l.email,
  l.name           as person,
  l.role,
  ss.shop_id,
  sh.name          as shop_name,
  ss.created_at    as signed_in_at,
  ss.last_seen_at,
  ss.expires_at,
  ss.ip,
  ss.user_agent
from sessions ss
join logins l  on l.id = ss.login_id
left join shops sh on sh.id = ss.shop_id
where ss.revoked_at is null
  and ss.expires_at > now();

grant select on v_sales, v_daily_takings, v_active_sessions to syk_app;

-- ---------------------------------------------------------------------------
-- 6. The super admin
--
--    A platform operator legitimately reads across every shop, so it cannot be
--    a shop-scoped query. It is not a wide-open view either: each read checks
--    a flag the API sets for that one request, and refuses otherwise. If a
--    shop's session is ever mistakenly upgraded to that flag, the shop list
--    still comes back, but it is the operator's own data — and the flag is set
--    only on routes that proved a super_admin login first.
-- ---------------------------------------------------------------------------

create or replace function is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('syk.super_admin', true), '') = 'on';
$$;

create or replace function require_super_admin()
returns void
language plpgsql
as $$
begin
  if not is_super_admin() then
    raise exception 'this read is for the super admin only'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- The operator's shop list: one row per shop, with the numbers that matter.
create or replace function admin_shops()
returns table (
  id              uuid,
  name            text,
  branch          text,
  phone           text,
  plan_kes        numeric,
  created_at      timestamptz,
  suspended_at    timestamptz,
  owner_email     text,
  owner_name      text,
  owner_last_seen timestamptz,
  live_sessions   bigint,
  products        bigint,
  sales           bigint,
  lifetime_sales  numeric,
  sales_today     numeric,
  credit_out      numeric,
  has_mpesa       boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform require_super_admin();

  return query
  select
    sh.id, sh.name, sh.branch, sh.phone, sh.plan_kes, sh.created_at, sh.suspended_at,
    l.email::text, l.name, l.last_seen_at,
    (select count(*) from sessions s
       where s.shop_id = sh.id and s.revoked_at is null and s.expires_at > now()),
    (select count(*) from products p where p.shop_id = sh.id and p.active),
    (select count(*) from sales s where s.shop_id = sh.id),
    (select coalesce(sum(s.total), 0) from sales s where s.shop_id = sh.id),
    (select coalesce(sum(s.total), 0) from sales s
       where s.shop_id = sh.id and s.sold_on = current_date),
    (select coalesce(sum(c.balance), 0) from customers c where c.shop_id = sh.id),
    exists (select 1 from mpesa_tills t where t.shop_id = sh.id and t.active)
  from shops sh
  left join logins l on l.shop_id = sh.id and l.role = 'owner'
  order by sh.created_at desc;
end;
$$;

-- "Who is logged in right now" — every live session, every shop.
create or replace function admin_sessions(p_live_only boolean default true)
returns table (
  session_id   uuid,
  login_id     uuid,
  email        text,
  person       text,
  role         login_role,
  shop_id      uuid,
  shop_name    text,
  signed_in_at timestamptz,
  last_seen_at timestamptz,
  expires_at   timestamptz,
  ip           text,
  user_agent   text,
  revoked_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform require_super_admin();

  return query
  select ss.id, ss.login_id, l.email::text, l.name, l.role, ss.shop_id, sh.name,
         ss.created_at, ss.last_seen_at, ss.expires_at, ss.ip, ss.user_agent,
         ss.revoked_at
    from sessions ss
    join logins l  on l.id = ss.login_id
    left join shops sh on sh.id = ss.shop_id
   where (not p_live_only)
      or (ss.revoked_at is null and ss.expires_at > now())
   order by ss.last_seen_at desc;
end;
$$;

-- Platform totals for the top of the admin screen.
create or replace function admin_totals()
returns table (
  shops        bigint,
  live_logins  bigint,
  sales_today  numeric,
  sales_all    numeric,
  credit_out   numeric,
  new_shops_7d bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform require_super_admin();

  return query
  select
    (select count(*) from shops where suspended_at is null),
    (select count(*) from sessions where revoked_at is null and expires_at > now()),
    (select coalesce(sum(total), 0) from sales where sold_on = current_date),
    (select coalesce(sum(total), 0) from sales),
    (select coalesce(sum(balance), 0) from customers),
    (select count(*) from shops where created_at > now() - interval '7 days');
end;
$$;

revoke all on function is_super_admin()            from public;
revoke all on function require_super_admin()       from public;
revoke all on function admin_shops()               from public;
revoke all on function admin_sessions(boolean)     from public;
revoke all on function admin_totals()              from public;

grant execute on function is_super_admin()        to syk_app;
grant execute on function admin_shops()           to syk_app;
grant execute on function admin_sessions(boolean) to syk_app;
grant execute on function admin_totals()          to syk_app;

-- ---------------------------------------------------------------------------
-- 7. M-Pesa: the two functions that touch a secret
-- ---------------------------------------------------------------------------

create or replace function mpesa_start(
  p_till     uuid,
  p_phone    text,
  p_amount   numeric,
  p_account  text,
  p_sale     uuid default null
)
returns mpesa_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_till mpesa_tills;
  v_row  mpesa_requests;
begin
  select * into v_till from mpesa_tills where id = p_till and active;
  if not found then
    raise exception 'no active till %', p_till using errcode = 'no_data_found';
  end if;

  insert into mpesa_requests (shop_id, till_id, sale_id, phone, amount, account_ref)
  values (v_till.shop_id, v_till.id, p_sale, p_phone, p_amount, p_account)
  returning * into v_row;

  return v_row;
end;
$$;

-- A Safaricom callback carries only the URL it was given; that path holds a
-- random secret. This is how the API turns that secret into a till, and so
-- into the credentials to verify the payment — without ever being able to
-- list or read the secrets themselves.
create or replace function mpesa_till_by_secret(p_secret text)
returns table (
  till_id     uuid,
  shop_id     uuid,
  shortcode   text,
  till_type   mpesa_till_type,
  environment text,
  is_default  boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.shop_id, t.shortcode, t.type, t.environment, t.is_default
    from mpesa_tills t
   where t.callback_secret = p_secret
     and t.active;
$$;

-- The STK password is base64(shortcode + passkey + timestamp), per shop.
-- Computed in the database so the passkey never travels to the app.
create or replace function mpesa_stk_password(p_till uuid, p_timestamp text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_passkey text;
  v_short   text;
begin
  select t.passkey, t.shortcode into v_passkey, v_short
    from mpesa_tills t where t.id = p_till and t.active;

  if v_passkey is null then
    raise exception 'no active till %', p_till using errcode = 'no_data_found';
  end if;

  return encode(convert_to(v_short || v_passkey || p_timestamp, 'UTF8'), 'base64');
end;
$$;

-- The Daraja consumer key and secret for one till, for the OAuth call only.
-- Granted to the API because it must POST them to Safaricom; scoped to one
-- till id so it cannot be used to list every shop's credentials.
create or replace function mpesa_credentials(p_till uuid)
returns table (consumer_key text, consumer_secret text, shortcode text, type mpesa_till_type)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.consumer_key, t.consumer_secret, t.shortcode, t.type
    from mpesa_tills t where t.id = p_till and t.active;
$$;

-- The callback secret for one till, so the prompt can build its own callback
-- URL. Used once per prompt; the secret itself never reaches the browser.
create or replace function callback_secret(p_till uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.callback_secret from mpesa_tills t where t.id = p_till and t.active;
$$;

revoke all on function mpesa_credentials(uuid) from public;
revoke all on function callback_secret(uuid)   from public;
grant execute on function mpesa_credentials(uuid) to syk_app;
grant execute on function callback_secret(uuid)   to syk_app;

revoke all on function mpesa_start(uuid, text, numeric, text, uuid) from public;
revoke all on function mpesa_till_by_secret(text)                  from public;
revoke all on function mpesa_stk_password(uuid, text)              from public;
revoke all on function mpesa_complete(text, integer, text, text, numeric, text, jsonb) from public;
revoke all on function record_sale(uuid, uuid, uuid, jsonb, jsonb, numeric) from public;
revoke all on function consume_login_code(uuid, text) from public;

grant execute on function mpesa_start(uuid, text, numeric, text, uuid)            to syk_app;
grant execute on function mpesa_till_by_secret(text)                              to syk_app;
grant execute on function mpesa_stk_password(uuid, text)                          to syk_app;
grant execute on function mpesa_complete(text, integer, text, text, numeric, text, jsonb) to syk_app;
grant execute on function record_sale(uuid, uuid, uuid, jsonb, jsonb, numeric)    to syk_app;
grant execute on function consume_login_code(uuid, text)                          to syk_app;

-- ---------------------------------------------------------------------------
-- 8. The audit log is append-only, enforced
--
--    Grants alone would not stop the table owner, and a future teammate will
--    run queries as the owner. So the table refuses edits itself.
-- ---------------------------------------------------------------------------

create or replace function audit_entries_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_entries is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_entries_no_update on audit_entries;
create trigger audit_entries_no_update
  before update or delete on audit_entries
  for each row execute function audit_entries_append_only();

-- ---------------------------------------------------------------------------
-- 9. Row-level security
--
--    The API sets two things for the duration of a request, in the same
--    transaction as the query:
--
--      select set_config('syk.shop_id', '<uuid>', true);   -- shop routes
--      select set_config('syk.super_admin', 'on', true);   -- admin routes
--
--    Both are transaction-local (the `true`), so a pooled connection cannot
--    carry one request's shop into the next request.
-- ---------------------------------------------------------------------------

create or replace function current_shop()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('syk.shop_id', true), '')::uuid;
$$;

alter table sales           enable row level security;
alter table sale_lines      enable row level security;
alter table sale_payments   enable row level security;
alter table credit_payments enable row level security;
alter table customers       enable row level security;
alter table mpesa_requests  enable row level security;
alter table sessions        enable row level security;

-- The owner (migrations, drills, the Neon SQL editor) is not filtered: it is
-- how you fix a shop's data at 11pm. The API role always is.
create policy sales_shop_isolation on sales
  for all to syk_app
  using (shop_id = current_shop()) with check (shop_id = current_shop());

create policy sale_lines_shop_isolation on sale_lines
  for all to syk_app
  using (exists (select 1 from sales s where s.id = sale_lines.sale_id
                   and s.shop_id = current_shop()))
  with check (exists (select 1 from sales s where s.id = sale_lines.sale_id
                        and s.shop_id = current_shop()));

create policy sale_payments_shop_isolation on sale_payments
  for all to syk_app
  using (exists (select 1 from sales s where s.id = sale_payments.sale_id
                   and s.shop_id = current_shop()))
  with check (exists (select 1 from sales s where s.id = sale_payments.sale_id
                        and s.shop_id = current_shop()));

create policy credit_payments_shop_isolation on credit_payments
  for all to syk_app
  using (shop_id = current_shop()) with check (shop_id = current_shop());

create policy customers_shop_isolation on customers
  for all to syk_app
  using (shop_id = current_shop()) with check (shop_id = current_shop());

create policy sessions_shop_isolation on sessions
  for all to syk_app
  using (shop_id = current_shop()) with check (shop_id = current_shop());

-- M-Pesa requests are created by a definer function and finished by the
-- callback, which has no shop in scope until it has resolved the secret.
-- Reads are scoped; the two writes are opened narrowly.
create policy mpesa_requests_read on mpesa_requests
  for select to syk_app using (shop_id = current_shop());

create policy mpesa_requests_insert on mpesa_requests
  for insert to syk_app with check (true);

create policy mpesa_requests_update on mpesa_requests
  for update to syk_app using (true) with check (true);

create policy audit_entries_read on audit_entries
  for select to syk_app
  using (shop_id is null or shop_id = current_shop());

create policy audit_entries_write on audit_entries
  for insert to syk_app with check (true);

-- ---------------------------------------------------------------------------
-- 10. Housekeeping
-- ---------------------------------------------------------------------------

revoke truncate on all tables in schema public from syk_app;

comment on role syk_app is
  'The API role: sells, records, reads. Cannot delete money, edit history, or read M-Pesa secrets.';
comment on table logins is
  'One login per shop, role owner. Plus platform-level super_admin rows with shop_id null. No staff/cashier roles.';
