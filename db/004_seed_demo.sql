-- ===========================================================================
--  004 — Demo data
--
--  Run this fourth, after 001–003, on a fresh database. It is safe to run
--  twice: it returns immediately if the demo shop already exists.
--
--  Why seed through record_sale() instead of inserting rows by hand:
--
--    · the sales you see on the dashboard were made the same way a real sale
--      is made — receipt numbers from the counter, VAT computed, stock
--      decremented through apply_stock, eTIMS queue rows created;
--    · if the functions ever break, this script breaks too, loudly, before
--      anyone ships;
--    · the ledger is internally consistent, so credit balances and daily
--      takings add up without special-casing the demo.
--
--  What you get:
--    · one shop, "Shop Yangu Kenya", Mombasa
--    · one owner login, demo@shopyangu.co.ke (already email-verified)
--    · 5 categories, 20 products, 4 suppliers, 6 customers, 5 expenses
--    · 14 days of trading, roughly 280 receipts
--    · 3 recent credit sales so the credit ledger has a story
--    · a sandbox M-Pesa till with placeholder credentials
--
--  Change the email at the top of the call to seed() at the bottom if you want
--  a different owner address.
-- ===========================================================================

create or replace function seed_demo(p_email text default 'demo@shopyangu.co.ke')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop        uuid;
  v_login       uuid;
  v_cat         record;
  v_prod        record;
  v_pid         uuid;
  v_supplier    record;
  v_customer    record;
  v_day         date;
  v_at          timestamptz;
  v_sale        sales;
  v_line        jsonb;
  v_pay         jsonb;
  v_total       numeric;
  v_qty         numeric;
  v_name        text;
  v_sku         text;
  v_cat_name    text;
  v_cost        numeric;
  v_price       numeric;
  v_stock       numeric;
  v_pick        text;
  v_method      payment_method;
  v_n           integer := 0;
  -- the products, as the screen shows them: sku, name, category, unit, cost,
  -- price, opening stock, reorder level, expiry
  v_catalogue constant text[][] := array[
    ['GRC-001','Sugar 2kg','Grocery','packet','205','240','900','24',''],
    ['GRC-002','Pishori rice 2kg','Grocery','packet','268','320','620','20','2027-08-31'],
    ['GRC-003','Maize flour 2kg','Grocery','packet','163','190','300','30','2027-02-28'],
    ['GRC-004','Cooking oil 1L','Grocery','bottle','245','285','480','18','2027-06-30'],
    ['DRK-001','Soda 350ml','Drinks','bottle','38','50','1400','60','2027-01-31'],
    ['DRK-002','Bottled water 1L','Drinks','bottle','42','60','950','48','2027-04-30'],
    ['DRK-003','Fresh milk 500ml','Drinks','packet','48','60','240','36','2026-11-26'],
    ['DRK-004','Tea leaves 250g','Drinks','packet','112','140','520','20','2027-09-30'],
    ['HHD-001','Bar soap 800g','Household','bar','198','240','380','15',''],
    ['HHD-002','Washing powder 500g','Household','packet','146','180','260','20',''],
    ['HHD-003','Jik 750ml','Household','bottle','96','125','330','12','2027-03-31'],
    ['HHD-004','Matches, box of 10','Household','box','42','60','180','10',''],
    ['PRC-001','Toothpaste 100ml','Personal care','tube','132','165','310','12','2027-11-30'],
    ['PRC-002','Toilet paper, 4 rolls','Personal care','pack','118','150','520','18',''],
    ['PRC-003','Sanitary pads, 10s','Personal care','pack','92','120','210','20','2027-05-31'],
    ['HDW-001','Cement 32.5, 50kg','Hardware','bag','690','780','140','10',''],
    ['HDW-002','Padlock 50mm','Hardware','piece','178','240','130','6',''],
    ['HDW-003','Nails 3 inch, 1kg','Hardware','kg','148','200','190','8',''],
    ['HDW-004','LED bulb 9W','Hardware','piece','122','180','260','10',''],
    ['GRC-005','Salt 1kg','Grocery','packet','22','30','800','30','']
  ];
  -- the fast movers, seeded in a repeating pattern so the reports look real
  v_fast constant text[] := array['GRC-001','GRC-003','GRC-004','DRK-001','DRK-002',
                                 'DRK-003','HHD-001','HHD-002','PRC-002','HDW-001',
                                 'GRC-005','GRC-002'];
begin
  -- Idempotent: one demo shop per database.
  select s.id into v_shop from shops s where s.name = 'Shop Yangu Kenya' limit 1;
  if found then
    raise notice 'demo shop already present (%), nothing done', v_shop;
    return v_shop;
  end if;

  insert into shops (name, branch, phone, kra_pin, plan_kes, plan_started_on, plan_renews_on)
  values ('Shop Yangu Kenya', 'Mombasa Branch', '0722 000 111', 'P051234567X',
          1500, current_date - 40, current_date + 20)
  returning id into v_shop;

  insert into shop_settings (shop_id) values (v_shop);

  -- The demo owner. Email already verified: the point of the seed is a shop
  -- you can look at, not an inbox you have to open.
  insert into logins (shop_id, email, name, role, email_verified_at, last_seen_at)
  values (v_shop, p_email, 'Wanjiku Kamau', 'owner', now(), now())
  returning id into v_login;

  -- Categories
  foreach v_cat_name in array array['Drinks','Grocery','Household','Personal care','Hardware'] loop
    insert into categories (shop_id, name) values (v_shop, v_cat_name);
  end loop;

  -- Products, with an opening stock movement so the ledger explains the count.
  for i in 1 .. array_length(v_catalogue, 1) loop
    v_sku    := v_catalogue[i][1];
    v_name   := v_catalogue[i][2];
    v_cat_name := v_catalogue[i][3];
    v_cost   := v_catalogue[i][5]::numeric;
    v_price  := v_catalogue[i][6]::numeric;
    -- Fourteen days of wholesale volume, plus a fortnight on the shelf.
    v_stock  := v_catalogue[i][7]::numeric * 4;

    select id into v_cat from categories where shop_id = v_shop and name = v_cat_name;

    insert into products (shop_id, category_id, sku, name, unit, cost_price,
                          selling_price, reorder_level, expiry_date)
    values (v_shop, v_cat.id, v_sku, v_name, v_catalogue[i][4],
            v_cost, v_price, v_catalogue[i][8]::numeric,
            nullif(v_catalogue[i][9], '')::date)
    returning id into v_pid;

    -- Opening stock goes through apply_stock, so the shelf count and the
    -- ledger cannot drift apart even in the seed.
    perform apply_stock(v_shop, v_pid, v_stock, 'import', 'Opening stock', null, null, true);
    update stock_movements set at = now() - interval '15 days'
     where product_id = v_pid and reason = 'import';
  end loop;

  -- Suppliers
  insert into suppliers (shop_id, name, phone, terms, balance_owed) values
    (v_shop, 'Kwa Nguvu Distributors',  '0722 341 900', '30 days',          18400),
    (v_shop, 'Coast Beverages Ltd',     '0733 118 220', '7 days',            6300),
    (v_shop, 'Bahari Wholesale',        '0711 762 004', 'Cash on delivery',     0),
    (v_shop, 'Pwani Hardware Supply',   '0700 552 871', '14 days',           9750);

  -- Customers
  insert into customers (shop_id, name, phone, credit_limit, since) values
    (v_shop, 'Mama Zawadi Kiosk', '0722 118 044', 20000, current_date - 500),
    (v_shop, 'Hotel Bahari',      '0733 900 551', 40000, current_date - 700),
    (v_shop, 'Juma Mwinyi',       '0711 442 907',  5000, current_date - 200),
    (v_shop, 'Star Mini Market',  '0700 663 112', 30000, current_date - 900),
    (v_shop, 'Aisha Bakery',      '0745 221 380', 15000, current_date - 100),
    (v_shop, 'Walk-in customer',  '',                  0, current_date - 900);

  -- Expenditure
  insert into expenses (shop_id, spent_on, description, amount, category) values
    (v_shop, current_date - 4,  'Electricity, KPLC token',          1500, 'Utilities'),
    (v_shop, current_date - 5,  'Boda delivery to Hotel Bahari',     300, 'Transport'),
    (v_shop, current_date - 6,  'Casual labour, 2 days',            1600, 'Wages'),
    (v_shop, current_date - 9,  'Shop licence renewal',             2400, 'Licences'),
    (v_shop, current_date - 11, 'Airtime and data',                  500, 'Utilities');

  -- A sandbox till, so the M-Pesa settings screen has something to show.
  -- Replace these with the shop's own Daraja credentials (docs/06).
  insert into mpesa_tills (shop_id, label, shortcode, type, passkey, consumer_key,
                           consumer_secret, callback_secret, environment, is_default)
  values (v_shop, 'Main till', '174379', 'till',
          'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
          'sandbox-consumer-key', 'sandbox-consumer-secret',
          -- 32 hex characters of randomness, no extension needed
          encode(sha256((random()::text || clock_timestamp()::text)::bytea), 'hex'),
          'sandbox', true);

  -- ---------------------------------------------------------------------
  -- Fourteen days of trading.
  -- ---------------------------------------------------------------------

  for d in reverse 13 .. 0 loop
    v_day := current_date - d;

    -- A shop is busy in the morning and quiet on a Sunday.
    for i in 0 .. (case when extract(dow from v_day) = 0 then 10 else 20 end) - 1 loop
      v_at := v_day + make_interval(hours => 7 + ((i * 5 + d) % 11),
                                    mins  => (i * 13 + d * 7) % 60);

      v_line := '[]'::jsonb;
      v_total := 0;
      for k in 0 .. (1 + ((i + d) % 4)) - 1 loop
        v_pick := v_fast[1 + ((i * 3 + k * 5 + d) % array_length(v_fast, 1))];

        select p.id, p.name, p.cost_price, p.selling_price into v_prod
          from products p where p.shop_id = v_shop and p.sku = v_pick;

        -- wholesale quantities: a bag is not bought one at a time
        v_qty := (case when v_prod.cost_price > 400 then 1
                       when v_prod.cost_price > 150 then 2
                       else 6 end) * (1 + ((i + k * 3) % 4));

        v_line := v_line || jsonb_build_object(
          'product_id', v_prod.id, 'name', v_prod.name,
          'qty', v_qty, 'unit_price', v_prod.selling_price,
          'unit_cost', v_prod.cost_price);

        v_total := v_total + v_prod.selling_price * v_qty;
      end loop;

      v_method := (array['cash','mpesa','card'])[1 + ((i + d) % 3)]::payment_method;
      v_pay := jsonb_build_array(jsonb_build_object('method', v_method, 'amount', v_total));

      v_sale := record_sale(v_shop, v_login, null, v_line, v_pay);
      -- Back-date the sale so a fortnight of trading appears on the
      -- dashboard. sold_at is the instant, sold_on the business date the
      -- report groups by: both move together.
      update sales set sold_at = v_at, sold_on = v_at::date where id = v_sale.id;
      update etims_transmissions set created_at = v_at where sale_id = v_sale.id;
      v_n := v_n + 1;
    end loop;
  end loop;

  -- Three credit sales, inside every limit, so the ledger is not empty.
  select id into v_customer from customers where shop_id = v_shop and name = 'Mama Zawadi Kiosk';
  perform record_sale(v_shop, v_login, v_customer.id,
    (select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name,
                                         'qty', 4, 'unit_price', p.selling_price,
                                         'unit_cost', p.cost_price))
       from products p where p.shop_id = v_shop and p.sku in ('GRC-001','DRK-001')),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 400)));

  select id into v_customer from customers where shop_id = v_shop and name = 'Hotel Bahari';
  perform record_sale(v_shop, v_login, v_customer.id,
    (select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name,
                                         'qty', 6, 'unit_price', p.selling_price,
                                         'unit_cost', p.cost_price))
       from products p where p.shop_id = v_shop and p.sku in ('DRK-002','DRK-004')),
    '[]'::jsonb);

  select id into v_customer from customers where shop_id = v_shop and name = 'Juma Mwinyi';
  perform record_sale(v_shop, v_login, v_customer.id,
    (select jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name,
                                         'qty', 2, 'unit_price', p.selling_price,
                                         'unit_cost', p.cost_price))
       from products p where p.shop_id = v_shop and p.sku in ('HDW-004')),
    jsonb_build_array(jsonb_build_object('method', 'mpesa', 'amount', 100)));

  -- One part-paid credit payment, so the ledger has both directions.
  select id into v_customer from customers where shop_id = v_shop and name = 'Hotel Bahari';
  insert into credit_payments (shop_id, customer_id, amount, method, received_by, note)
  values (v_shop, v_customer.id, 800, 'mpesa', v_login, 'Part payment, November');

  insert into audit_entries (shop_id, login_id, action, detail)
  values (v_shop, v_login, 'demo.seeded',
          v_n || ' receipts across 14 days');

  raise notice 'seeded shop %, owner %, % sales', v_shop, p_email, v_n;
  return v_shop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Run it. Change the address if you want a different demo owner.
-- ---------------------------------------------------------------------------

select seed_demo('demo@shopyangu.co.ke');

-- ---------------------------------------------------------------------------
-- A super admin. This account belongs to no shop and reads every shop.
-- Run once; running it again just re-uses the existing login.
-- ---------------------------------------------------------------------------

create or replace function create_super_admin(p_email text, p_name text default 'Super admin')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into logins (shop_id, email, name, role, email_verified_at)
  values (null, p_email, p_name, 'super_admin', now())
  on conflict (email) do update
    set role = 'super_admin', shop_id = null, email_verified_at = coalesce(logins.email_verified_at, now())
  returning id into v_id;

  return v_id;
end;
$$;

select create_super_admin('admin@shopyangu.co.ke', 'Platform admin');

-- ---------------------------------------------------------------------------
-- Check it worked. These should all return rows and non-zero numbers.
--
--   select name, owner_email, live_sessions, products, sales, lifetime_sales
--     from admin_shops();
--   select * from v_daily_takings order by sold_on desc limit 5;
--   select receipt_no, total, credit_amount from v_sales order by sold_at desc limit 5;
-- ---------------------------------------------------------------------------
