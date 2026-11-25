-- ============================================================================
--  Shop Yangu Kenya — 002_functions.sql
--
--  Run this AFTER 001_schema.sql. See docs/02-sql-scripts.md.
--
--  These functions are where the app's rules live when they matter:
--
--    · a sale decrements stock in the same transaction as the sale
--    · a sale can never oversell the last packet
--    · a receipt number is allocated inside the transaction, never reused
--    · a customer's balance is recalculated from history, not incremented
--      by hand, so it cannot drift
--
--  The API calls these with SELECT/INSERT; it never writes stock or balances
--  directly. That is what makes "two tills cannot sell the same last packet"
--  true rather than hopeful.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. updated_at, kept honest by the database rather than the caller
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shops_touch on shops;
create trigger shops_touch before update on shops
  for each row execute function touch_updated_at();

drop trigger if exists logins_touch on logins;
create trigger logins_touch before update on logins
  for each row execute function touch_updated_at();

drop trigger if exists products_touch on products;
create trigger products_touch before update on products
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Receipt numbers
--
--    S-0001, per shop, from a counter row. Taking the counter with
--    `for update` serialises two tills starting a sale at the same instant: the
--    second waits, then gets the next number. A receipt number is therefore
--    never handed out twice, even under load, and never reused after a void.
-- ---------------------------------------------------------------------------

create table if not exists shop_counters (
  shop_id        uuid primary key references shops (id) on delete cascade,
  last_receipt   integer not null default 0
);

create or replace function next_receipt_no(p_shop uuid)
returns text
language plpgsql
as $$
declare
  n integer;
begin
  insert into shop_counters (shop_id, last_receipt)
  values (p_shop, 0)
  on conflict (shop_id) do nothing;

  update shop_counters
     set last_receipt = last_receipt + 1
   where shop_id = p_shop
  returning last_receipt into n;

  return 'S-' || lpad(n::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Stock
--
--    One function, one reason: stock only ever moves through here, so every
--    change leaves a movement row that says why. The quantity is checked
--    against zero when the caller says `allow_negative = false`, which is what
--    the till does — a shop with no matches cannot sell matches.
-- ---------------------------------------------------------------------------

create or replace function apply_stock(
  p_shop      uuid,
  p_product   uuid,
  p_change    numeric,
  p_reason    stock_reason,
  p_note      text default null,
  p_sale      uuid default null,
  p_login     uuid default null,
  p_allow_negative boolean default false
)
returns numeric
language plpgsql
as $$
declare
  v_after numeric;
begin
  update products
     set qty = qty + p_change
   where id = p_product and shop_id = p_shop
  returning qty into v_after;

  if not found then
    raise exception 'product % does not belong to shop %', p_product, p_shop
      using errcode = 'foreign_key_violation';
  end if;

  if v_after < 0 and not p_allow_negative then
    raise exception 'not enough stock for product %: % left, tried to take %',
      p_product, v_after - p_change, -p_change
      using errcode = 'check_violation';
  end if;

  insert into stock_movements (shop_id, product_id, reason, change, qty_after, note, sale_id, login_id)
  values (p_shop, p_product, p_reason, p_change, v_after, p_note, p_sale, p_login);

  update products set updated_at = now() where id = p_product;

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Recording a sale
--
--    Everything a till does, in one transaction:
--      · allocate the receipt number
--      · write the sale and its lines (snapshotting name, price and cost)
--      · take the stock, refusing to go below zero
--      · write the payments, and the credit if the customer did not cover it
--      · recalculate that customer's balance
--      · mark the sale as awaiting its eTIMS transmission
--      · write an audit entry
--
--    p_lines:    [{product_id, qty, unit_price, unit_cost, name}]
--    p_payments: [{method, amount, mpesa_receipt, mpesa_request_id}]
--
--    Money is passed as whole shillings and the VAT is computed here, not by
--    the client: a till that rounds differently from the books is a tax
--    problem waiting to happen.
-- ---------------------------------------------------------------------------

create or replace function record_sale(
  p_shop        uuid,
  p_login       uuid,
  p_customer    uuid,
  p_lines       jsonb,
  p_payments    jsonb,
  p_vat_rate    numeric default 0.16
)
returns sales
language plpgsql
as $$
declare
  v_sale        sales;
  v_line        jsonb;
  v_pay         jsonb;
  v_total       numeric(12,2) := 0;
  v_vat         numeric(12,2);
  v_subtotal    numeric(12,2);
  v_paid        numeric(12,2) := 0;
  v_credit      numeric(12,2);
  v_customer    customers;
  v_receipt     text;
  v_name        text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'a sale needs at least one line' using errcode = 'check_violation';
  end if;

  -- The customer, if there is one, must belong to this shop.
  if p_customer is not null then
    select * into v_customer from customers where id = p_customer and shop_id = p_shop;
    if not found then
      raise exception 'customer % is not this shop''s' , p_customer using errcode = 'foreign_key_violation';
    end if;
  end if;

  -- Total from the lines, not from the client's arithmetic.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_total := v_total + (coalesce((v_line->>'qty')::numeric, 0)
                        * coalesce((v_line->>'unit_price')::numeric, 0));
  end loop;

  if v_total <= 0 then
    raise exception 'a sale must total more than zero' using errcode = 'check_violation';
  end if;

  -- VAT is 16% of the gross, so what the customer sees is what is charged.
  v_vat      := round(v_total * p_vat_rate / (1 + p_vat_rate), 2);
  v_subtotal := v_total - v_vat;

  if p_payments is not null then
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      v_paid := v_paid + coalesce((v_pay->>'amount')::numeric, 0);
    end loop;
  end if;

  v_credit := greatest(0, round(v_total - v_paid, 2));

  -- Credit needs somebody to owe it. A walk-in cannot.
  if v_credit > 0 and p_customer is null then
    raise exception 'a sale with % on credit needs a named customer', v_credit
      using errcode = 'check_violation';
  end if;

  if v_credit > 0 and v_customer.credit_limit > 0
     and v_customer.balance + v_credit > v_customer.credit_limit then
    raise exception 'that would take % over their credit limit of %',
      coalesce(v_customer.name, 'the customer'), v_customer.credit_limit
      using errcode = 'check_violation';
  end if;

  v_receipt := next_receipt_no(p_shop);

  insert into sales (shop_id, receipt_no, customer_id, customer_name, subtotal, vat, total,
                     credit_amount, created_by)
  values (p_shop, v_receipt, p_customer,
          coalesce(v_customer.name, 'Walk-in'),
          v_subtotal, v_vat, v_total, v_credit, p_login)
  returning * into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into sale_lines (sale_id, product_id, name_snapshot, qty, unit_price, unit_cost_snapshot)
    values (v_sale.id,
            (v_line->>'product_id')::uuid,
            coalesce(v_line->>'name', 'Item'),
            (v_line->>'qty')::numeric,
            (v_line->>'unit_price')::numeric,
            coalesce((v_line->>'unit_cost')::numeric, 0));

    -- Stock out, in the same transaction. This is the line that stops two
    -- tills overselling the last packet: the second one raises and rolls back.
    if (v_line->>'product_id') is not null then
      perform apply_stock(p_shop, (v_line->>'product_id')::uuid,
                          -((v_line->>'qty')::numeric), 'sale',
                          'Sold on ' || v_receipt, v_sale.id, p_login, false);
    end if;
  end loop;

  if p_payments is not null then
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      if coalesce((v_pay->>'amount')::numeric, 0) > 0 then
        insert into sale_payments (sale_id, method, amount, mpesa_receipt, mpesa_request_id)
        values (v_sale.id,
                (v_pay->>'method')::payment_method,
                (v_pay->>'amount')::numeric,
                nullif(v_pay->>'mpesa_receipt', ''),
                nullif(v_pay->>'mpesa_request_id', '')::uuid);
      end if;
    end loop;
  end if;

  if v_credit > 0 then
    perform recalc_customer_balance(p_customer);
  end if;

  insert into etims_transmissions (sale_id, status) values (v_sale.id, 'pending');

  insert into audit_entries (shop_id, login_id, action, detail)
  values (p_shop, p_login, 'sale.recorded',
          v_receipt || ' · ' || v_total::text || ' · ' || case when v_credit > 0 then 'credit ' || v_credit::text else 'paid' end);

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Customer balances
--
--    Recalculated from history every time, rather than added to. A balance
--    that is computed cannot drift, and a nightly job is not required for it
--    to be right.
--
--      balance = credited sales
--              − payments against credit
--              − any cash paid at the time of those sales beyond the credit
-- ---------------------------------------------------------------------------

create or replace function recalc_customer_balance(p_customer uuid)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric(12,2);
begin
  /* Opening balance + everything sold on credit − everything paid back.
     A shop that migrates from a paper book has customers who already owe;
     ignoring that would show a clean slate that is not true. */
  select (select c.opening_balance from customers c where c.id = p_customer)
       + coalesce(sum(s.credit_amount), 0)
       - coalesce((select sum(cp.amount) from credit_payments cp where cp.customer_id = p_customer), 0)
    into v_balance
    from sales s
   where s.customer_id = p_customer;

  update customers set balance = greatest(0, v_balance) where id = p_customer;
  return greatest(0, v_balance);
end;
$$;

create or replace function recalc_all_customer_balances(p_shop uuid)
returns integer
language plpgsql
as $$
declare
  c record;
  n integer := 0;
begin
  for c in select id from customers where shop_id = p_shop loop
    perform recalc_customer_balance(c.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- When a customer pays off credit, their balance must follow immediately.
create or replace function credit_payment_touch_balance()
returns trigger
language plpgsql
as $$
begin
  perform recalc_customer_balance(new.customer_id);
  insert into audit_entries (shop_id, login_id, action, detail)
  values (new.shop_id, new.received_by, 'credit.paid',
          new.amount::text || ' by ' || new.method::text);
  return new;
end;
$$;

drop trigger if exists credit_payment_balance on credit_payments;
create trigger credit_payment_balance after insert on credit_payments
  for each row execute function credit_payment_touch_balance();

-- ---------------------------------------------------------------------------
-- 6. M-Pesa requests
--
--    Starting a prompt and finishing it are two steps, because Safaricom
--    answers twice: once when it accepts the request (CheckoutRequestID) and
--    once when the customer enters their PIN (the callback). Only the second
--    is money.
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
  select t.shop_id, t.id, p_sale, p_phone, p_amount, p_account
    from mpesa_tills t where t.id = p_till
  returning * into v_row;

  return v_row;
end;
$$;

-- The callback. Idempotent by construction: checkout_request_id and
-- mpesa_receipt are unique, so a callback delivered twice changes nothing the
-- second time and cannot credit the same money twice.
create or replace function mpesa_complete(
  p_checkout_id  text,
  p_result_code  integer,
  p_result_desc  text,
  p_receipt      text,
  p_amount       numeric,
  p_phone        text,
  p_raw          jsonb
)
returns mpesa_requests
language plpgsql
as $$
declare
  v_row mpesa_requests;
  v_status mpesa_status;
begin
  select * into v_row from mpesa_requests where checkout_request_id = p_checkout_id;
  if not found then
    raise exception 'unknown checkout request %', p_checkout_id using errcode = 'no_data_found';
  end if;

  -- Already settled: return it unchanged. A retried callback is not an error.
  if v_row.status <> 'pending' then
    return v_row;
  end if;

  v_status := case
    when p_result_code = 0 then 'success'
    when p_result_code = 1032 then 'cancelled'
    when p_result_code in (1037, 1001) then 'timeout'
    else 'failed'
  end;

  update mpesa_requests
     set status = v_status,
         result_code = p_result_code,
         result_desc = p_result_desc,
         mpesa_receipt = p_receipt,
         raw = p_raw,
         completed_at = now()
   where id = v_row.id
  returning * into v_row;

  -- Money arrived. If this request was started against a sale, book it as that
  -- sale's payment now; the partial unique index on sale_payments.mpesa_request_id
  -- makes a replayed callback a no-op instead of a double credit.
  if v_status = 'success' then
    if v_row.sale_id is not null then
      insert into sale_payments (sale_id, method, amount, mpesa_receipt, mpesa_request_id)
      values (v_row.sale_id, 'mpesa', coalesce(p_amount, v_row.amount),
              p_receipt, v_row.id)
      on conflict (mpesa_request_id) where mpesa_request_id is not null do nothing;
    end if;

    if p_amount is not null and p_amount <> v_row.amount then
      insert into audit_entries (shop_id, action, detail)
      values (v_row.shop_id, 'mpesa.amount_mismatch',
              'asked for ' || v_row.amount::text || ', paid ' || p_amount::text
              || ' · ' || coalesce(p_receipt, ''));
    end if;
  end if;

  insert into audit_entries (shop_id, action, detail)
  values (v_row.shop_id, 'mpesa.' || v_status::text,
          coalesce(p_receipt, '') || ' · ' || coalesce(p_amount, 0)::text);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Sign-in codes are single use
-- ---------------------------------------------------------------------------

create or replace function consume_login_code(p_login uuid, p_code_hash text)
returns boolean
language plpgsql
as $$
declare
  v_row login_codes;
begin
  select * into v_row
    from login_codes
   where login_id = p_login
     and consumed_at is null
     and expires_at > now()
   order by created_at desc
   limit 1;

  if not found then
    return false;
  end if;

  -- Five wrong guesses and the code is dead. Brute-forcing six digits is
  -- otherwise a few seconds of work.
  if v_row.attempts >= 5 then
    update login_codes set consumed_at = now() where id = v_row.id;
    return false;
  end if;

  if v_row.code_hash <> p_code_hash then
    update login_codes set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;

  update login_codes set consumed_at = now() where id = v_row.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Views the API and the super-admin screen read
-- ---------------------------------------------------------------------------

-- Sales as the till screen wants them: one row per sale, payments folded in.
create or replace view v_sales as
select
  s.id,
  s.shop_id,
  s.receipt_no,
  s.sold_at,
  s.sold_on,
  s.customer_id,
  s.customer_name,
  s.subtotal,
  s.vat,
  s.total,
  s.credit_amount,
  coalesce(
    jsonb_agg(distinct jsonb_build_object('m', sp.method, 'amt', sp.amount))
      filter (where sp.id is not null), '[]'::jsonb) as payments,
  count(distinct sl.id) as line_count,
  coalesce(sum(sl.qty), 0) as items
from sales s
left join sale_payments sp on sp.sale_id = s.id
left join sale_lines sl    on sl.sale_id = s.id
group by s.id;

-- Today's numbers, per shop: what the dashboard card shows.
create or replace view v_daily_takings as
select
  s.shop_id,
  s.sold_on,
  count(*)                                  as receipts,
  sum(s.total)                              as gross,
  sum(s.vat)                                as vat,
  sum(s.credit_amount)                      as credit,
  sum(s.total - s.vat
      - coalesce((select sum(sl.qty * sl.unit_cost_snapshot)
                    from sale_lines sl where sl.sale_id = s.id), 0)) as gross_profit
from sales s
group by s.shop_id, s.sold_on;

-- "Who is logged in": live sessions with the shop and the person.
create or replace view v_active_sessions as
select
  ss.id                as session_id,
  ss.login_id,
  l.email,
  l.name               as person,
  l.role,
  ss.shop_id,
  sh.name              as shop_name,
  ss.created_at        as signed_in_at,
  ss.last_seen_at,
  ss.expires_at,
  ss.ip,
  ss.user_agent
from sessions ss
join logins l  on l.id = ss.login_id
left join shops sh on sh.id = ss.shop_id
where ss.revoked_at is null
  and ss.expires_at > now();

-- The super-admin dashboard: one row per shop.
create or replace view v_shop_overview as
select
  sh.id,
  sh.name,
  sh.branch,
  sh.phone,
  sh.plan_kes,
  sh.created_at,
  sh.suspended_at,
  l.email              as owner_email,
  l.name               as owner_name,
  l.last_seen_at       as owner_last_seen,
  (select count(*) from sessions s
     where s.shop_id = sh.id and s.revoked_at is null and s.expires_at > now()) as live_sessions,
  (select count(*) from products p where p.shop_id = sh.id and p.active)          as products,
  (select count(*) from sales s where s.shop_id = sh.id)                          as sales,
  (select coalesce(sum(s.total), 0) from sales s where s.shop_id = sh.id)         as lifetime_sales,
  (select coalesce(sum(s.total), 0) from sales s
     where s.shop_id = sh.id and s.sold_on = current_date)                        as sales_today,
  (select coalesce(sum(c.balance), 0) from customers c where c.shop_id = sh.id)   as credit_out,
  exists (select 1 from mpesa_tills t where t.shop_id = sh.id and t.active)       as has_mpesa
from shops sh
left join logins l on l.shop_id = sh.id and l.role = 'owner';
