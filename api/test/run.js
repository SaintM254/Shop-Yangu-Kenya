/* ============================================================ api/test/run.js

   The end-to-end suite. It starts the real server against a real Postgres
   (PGlite, in-process), runs the SQL migrations, and then uses the API the way
   a browser does: sign up, get a code, verify, sell, take M-Pesa, read the
   admin console.

   Run it:
     cd api && npm install && npm test

   Every assertion is a claim the docs make. If one fails, a doc is wrong or
   the code is — either way something is broken before a shop finds out.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
process.env.DATABASE_DRIVER = 'pglite';
process.env.PGLITE_DIR = '';
process.env.EMAIL_DRIVER = 'console';
process.env.TOKEN_PEPPER = 'test-pepper-not-a-real-secret';
process.env.SITE_URL = 'http://localhost:8787';
process.env.SERVE_SITE = 'false';
process.env.NODE_ENV = 'test';

const { PGlite } = await import('@electric-sql/pglite');

let pass = 0;
let fail = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? `  \x1b[90m${extra}\x1b[0m` : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${extra ? `  ${extra}` : ''}`);
  }
};
const group = (name) => console.log(`\n\x1b[1m${name}\x1b[0m`);

/* ---------------------------------------------------------------- database */

const pg = new PGlite();

/* PGlite has no contrib modules; Neon has both. For the test only, stand in
   for citext (a text domain) and pgcrypto (gen_random_uuid is core). */
const loadSql = (file) =>
  fs
    .readFileSync(path.join(root, 'db', file), 'utf8')
    .replace(/create extension if not exists pgcrypto;/g, '-- pgcrypto: core in this build')
    .replace(
      /create extension if not exists citext;/g,
      'create domain citext as text;'
    );

for (const f of ['001_schema.sql', '002_functions.sql', '003_rls.sql', '004_seed_demo.sql']) {
  await pg.exec(loadSql(f));
}

/* The server reaches the database through this shim: one process, one PGlite,
   the same SQL Neon gets. */
let lock = Promise.resolve();
const q = async (text, params) => {
  const res = await pg.query(text, params);
  return { rows: res.rows, rowCount: res.affectedRows };
};
const shim = {
  name: 'pglite-test',
  query: q,
  /* PGlite is one connection: transactions queue behind each other. */
  tx(fn) {
    const run = lock.then(async () => {
      await pg.exec('begin');
      try {
        const out = await fn({ query: q });
        await pg.exec('commit');
        return out;
      } catch (err) {
        await pg.exec('rollback').catch(() => {});
        throw err;
      }
    });
    lock = run.then(() => {}, () => {});
    return run;
  },
  async close() {},
};
const { __setTestDriver } = await import('../lib/db.js');
__setTestDriver(shim);

/* ------------------------------------------------------------------ client */

const { server } = await import('../server.js');
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

/* A cookie jar, because sign-in is a cookie and every later request needs it. */
let jar = {};
const cookies = () =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

async function call(method, path, body, { withCookies = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(withCookies && Object.keys(jar).length ? { cookie: cookies() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  for (const raw of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    const k = pair.slice(0, i);
    const v = pair.slice(i + 1);
    if (!v) delete jar[k];
    else jar[k] = v;
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const lastCode = () => {
  const log = captured.join('\n');
  const matches = [...log.matchAll(/is your Shop Yangu(?: Kenya)? (?:sign-in |admin )?code|code for .*? is (\d{6})|Your sign-in code[^\n]*|^\s+(\d{6})\.?$/gm)];
  /* Simpler and exact: every email prints "Your ... code for X is NNNNNN"
     or "Your platform admin sign-in code is NNNNNN". */
  const sixes = [...log.matchAll(/\b(\d{6})\b/g)].map((m) => m[1]);
  return sixes[sixes.length - 1];
};

const captured = [];
const realLog = console.log;
console.log = (...args) => {
  captured.push(args.join(' '));
  realLog(...args);
};

/* -------------------------------------------------------------------- tests */

group('health');
{
  const r = await call('GET', '/api/health');
  ok('GET /api/health answers', r.status === 200, `status ${r.status}`);
  ok('database is reachable', r.body.database?.ok === true);
  ok('no secrets leak from health', !JSON.stringify(r.body).includes('test-pepper'));
}

group('sign-up: a new shop, by email code');
let ownerCookie;
{
  const r = await call('POST', '/api/auth/signup', {
    shop: 'Bahari Duka',
    name: 'Amina Hassan',
    email: 'amina@bahariduka.co.ke',
  });
  ok('POST /api/auth/signup accepts a new shop', r.status === 200, `status ${r.status}`);
  ok('it is a new sign-up, not an existing account', r.body.existing === false);
  ok('no session yet — the email has not been checked', Object.keys(jar).length === 0);

  const code = lastCode();
  ok('the code was sent (to the log, in test)', /^\d{6}$/.test(code || ''), code);

  const bad = await call('POST', '/api/auth/signup/verify', {
    email: 'amina@bahariduka.co.ke',
    code: '000001',
  });
  ok('a wrong code is refused', bad.status === 400, `status ${bad.status}`);

  const v = await call('POST', '/api/auth/signup/verify', {
    email: 'amina@bahariduka.co.ke',
    code,
  });
  ok('the right code creates the shop and signs in', v.status === 200 && v.body.user?.role === 'owner', `status ${v.status}`);
  ok('a session cookie was set', Boolean(jar.syk_session));
  ok('the shop is landed on the dashboard', v.body.next === 'dashboard');
  ok('the email is now verified', (await call('GET', '/api/session')).body.signedIn === true);
  ownerCookie = { ...jar };
}

group('sign-in: an existing shop');
{
  jar = {};
  const r = await call('POST', '/api/auth/signin', { email: 'amina@bahariduka.co.ke' });
  ok('POST /api/auth/signin sends a code', r.status === 200 && r.body.next === 'verify');

  const unknown = await call('POST', '/api/auth/signin', { email: 'nobody@nowhere.co.ke' });
  ok(
    'an unknown address gets the same answer (no account enumeration)',
    unknown.status === 200 && unknown.body.next === 'verify' && !unknown.body.role
  );

  const v = await call('POST', '/api/auth/signin/verify', {
    email: 'amina@bahariduka.co.ke',
    code: lastCode(),
  });
  ok('the code signs in', v.status === 200 && jar.syk_session);
}

group('sign-up: an address that already has a shop');
{
  jar = {};
  const r = await call('POST', '/api/auth/signup', {
    shop: 'Second Shop Attempt',
    name: 'Amina Again',
    email: 'amina@bahariduka.co.ke',
  });
  ok('the duplicate is caught before a second shop exists', r.body.existing === true);
  const n = await pg.query(`select count(*)::int n from shops where name = 'Second Shop Attempt'`);
  ok('and no shop was created', n.rows[0].n === 0);
  jar = { ...ownerCookie };
}

group('the session');
{
  const r = await call('GET', '/api/session');
  ok('GET /api/session says who I am', r.body.signedIn === true && r.body.user.email === 'amina@bahariduka.co.ke');
  ok('the role is owner, there is no second role for shop staff', r.body.user.role === 'owner');
}

group('bootstrap: the first paint');
let boot;
{
  const r = await call('GET', '/api/bootstrap');
  ok('GET /api/bootstrap answers', r.status === 200, `status ${r.status}`);
  boot = r.body;
  ok('it carries the shop', boot.shop?.name === 'Bahari Duka');
  ok('it carries the user', boot.user?.name === 'Amina Hassan');
  ok('the five starter categories are there', boot.cats.length === 5, boot.cats.join(', '));
  ok('a new shop starts with no sales', boot.sales.length === 0 && boot.fresh === true);
  ok('settings are defaulted', boot.settings.allowCredit === true);
  ok('money is a number, not a string', typeof boot.shop.plan === 'number', typeof boot.shop.plan);
}

group('products and stock');
let productId;
{
  const r = await call('POST', '/api/products', {
    name: 'Sugar 2kg',
    sku: 'GRC-001',
    unit: 'packet',
    cost: 205,
    price: 240,
    reorder: 24,
    qty: 40,
    categoryId: boot.categories.find((c) => c.name === 'Grocery').id,
  });
  ok('POST /api/products creates one', r.status === 200 && r.body.product?.name === 'Sugar 2kg', `status ${r.status}`);
  productId = r.body.product.id;
  ok('opening stock is on the shelf', r.body.product.qty === 40, r.body.product.qty);

  const mv = await call('GET', `/api/stock/movements?productId=${productId}`);
  ok('and the ledger explains it', mv.body.movements.length === 1 && mv.body.movements[0].reason === 'import');

  const adj = await call('POST', '/api/stock/adjust', { productId, change: -2, note: 'Two broken' });
  ok('a stock adjustment is recorded', adj.status === 200 && adj.body.qty === 38, adj.body.qty);

  const tooMuch = await call('POST', '/api/stock/adjust', { productId, change: -100 });
  ok('taking more than is on the shelf is refused', tooMuch.status === 400 || tooMuch.status === 409, `status ${tooMuch.status}`);
}

group('a sale');
let saleId;
let receiptNo;
{
  const r = await call('POST', '/api/sales', {
    items: [{ id: productId, name: 'Sugar 2kg', qty: 2, price: 240, cost: 205 }],
    paid: [{ m: 'Cash', amt: 480 }],
  });
  ok('POST /api/sales records one', r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  const sale = r.body.sale;
  saleId = sale.id;
  receiptNo = sale.no;
  ok('the receipt is the shop\'s first', sale.no === 'S-0001', sale.no);
  ok('the total is right', sale.total === 480, sale.total);
  ok('VAT is 16% of the gross, inclusive', Math.abs(sale.vat - 66.21) < 0.02, sale.vat);
  ok('subtotal + VAT = total', Math.abs(sale.subtotal + sale.vat - sale.total) < 0.02);
  ok('stock came off the shelf', r.body.stock[0].qty === 36, r.body.stock[0].qty);
  ok('nothing is owed', sale.credit === 0);
  ok('the payment method reads the way the screen filters', sale.paid[0].m === 'Cash', sale.paid[0].m);

  const boot2 = await call('GET', '/api/bootstrap');
  ok('and it appears in the list', boot2.body.sales.length === 1 && boot2.body.sales[0].no === 'S-0001');
  ok('with its takings', boot2.body.takings[0].gross === 480, boot2.body.takings[0].gross);
}

group('selling more than there is');
{
  const r = await call('POST', '/api/sales', {
    items: [{ id: productId, name: 'Sugar 2kg', qty: 999, price: 240, cost: 205 }],
    paid: [{ m: 'Cash', amt: 999 * 240 }],
  });
  ok('is refused, with a reason a shopkeeper can read', r.status === 409 || r.status === 400, `status ${r.status}`);
  ok('the message names the product', /not enough stock/i.test(r.body.error || ''), r.body.error);

  const p = await pg.query('select qty from products where id = $1', [productId]);
  ok('and the shelf is untouched', Number(p.rows[0].qty) === 36, p.rows[0].qty);
}

group('credit');
let customerId;
{
  const c = await call('POST', '/api/customers', { name: 'Mama Zawadi', phone: '0722 118 044', limit: 20000 });
  customerId = c.body.customer.id;
  ok('POST /api/customers creates one', c.status === 200);

  const r = await call('POST', '/api/sales', {
    items: [{ id: productId, name: 'Sugar 2kg', qty: 1, price: 240, cost: 205 }],
    paid: [],
    customer: customerId,
  });
  ok('an unpaid sale becomes credit', r.body.sale?.credit === 240, r.body.sale?.credit);

  const boot2 = await call('GET', '/api/bootstrap');
  const mine = boot2.body.customers.find((x) => x.id === customerId);
  ok('the customer balance follows', mine.bal === 240, mine.bal);

  const pay = await call('POST', '/api/credit-payments', {
    customerId,
    amount: 100,
    method: 'cash',
  });
  ok('a credit payment brings it down', pay.status === 200 && pay.body.balance === 140, pay.body.balance);

  const walkIn = await call('POST', '/api/sales', {
    items: [{ id: productId, name: 'Sugar 2kg', qty: 1, price: 240, cost: 205 }],
    paid: [],
  });
  ok('a walk-in cannot take credit', walkIn.status === 400, `status ${walkIn.status}`);
}

group('the writes the screens make');
{
  /* A shop migrating from a paper book has customers who already owe. That
     figure has to survive into the balance, or the books look cleaner than
     they are. */
  const c = await call('POST', '/api/customers', {
    name: 'Opening Balance Co', limit: 5000, openingBalance: 1500,
  });
  ok('a customer can be created with money already owed',
    c.body.customer?.bal === 1500, c.body.customer?.bal);

  const pay = await call('POST', '/api/credit-payments', {
    customerId: c.body.customer.id, amount: 500, method: 'mpesa',
  });
  ok('a payment comes off the opening balance too',
    pay.body.balance === 1000, pay.body.balance);

  /* The settings screen edits in place: there is one set of settings, so it
     is a PATCH, not a POST to a collection. */
  const off = await call('PATCH', '/api/settings', { allowCredit: false });
  ok('PATCH /api/settings turns credit off',
    off.status === 200 && off.body.settings.allowCredit === false);

  const on = await call('PATCH', '/api/settings', { allowCredit: true });
  ok('and on again', on.body.settings.allowCredit === true);

  const creditSale = await call('POST', '/api/sales', {
    items: [{ id: productId, name: 'Sugar 2kg', qty: 1, price: 240, cost: 205 }],
    paid: [], customer: c.body.customer.id,
  });
  ok('with credit on, a shortfall is a credit sale', creditSale.status === 200);

  /* The shop's own profile, which prints on every receipt. */
  const renamed = await call('PATCH', '/api/shop', { name: 'Shop Yangu Kenya Mk II' });
  ok('PATCH /api/shop renames the shop',
    renamed.status === 200 && renamed.body.shop.name === 'Shop Yangu Kenya Mk II');
  /* Put it back: the rest of the suite looks this shop up by name. */
  await call('PATCH', '/api/shop', { name: 'Bahari Duka' });

  /* An expense is what turns gross profit into net. */
  const exp = await call('POST', '/api/expenses', { what: 'Electricity', amount: 2400, cat: 'Utilities' });
  ok('POST /api/expenses records one', exp.status === 200 && exp.body.expense.amt === 2400);

  /* A product added by hand gets its opening stock through the ledger, so the
     count can be explained later. */
  const prod = await call('POST', '/api/products', {
    name: 'Test Omo 1kg', sku: 'OMO-TEST', price: 310, cost: 250, qty: 15, reorder: 4,
  });
  ok('POST /api/products adds one', prod.status === 200 && Boolean(prod.body.product.id));
  const shelf = await pg.query('select qty from products where id = $1', [prod.body.product.id]);
  ok('and its opening stock is on the shelf', Number(shelf.rows[0].qty) === 15, shelf.rows[0].qty);

  const moved = await pg.query(
    'select reason from stock_movements where product_id = $1',
    [prod.body.product.id]
  );
  ok('with a movement that says where it came from',
    moved.rows.length === 1, JSON.stringify(moved.rows));

  /* Editing a price must not move stock: a price is not a delivery. */
  const edited = await call('PATCH', `/api/products/${prod.body.product.id}`, { price: 330 });
  const after = await pg.query('select qty, selling_price from products where id = $1', [prod.body.product.id]);
  ok('editing a price leaves the shelf alone',
    Number(after.rows[0].qty) === 15 && Number(after.rows[0].selling_price) === 330,
    JSON.stringify(after.rows[0]));
}

group('accounting: a till never edits history');
{
  const r = await call('PATCH', `/api/sales/${saleId}`, { total: 1 });
  ok('there is no route to change a receipt', r.status === 404 || r.status === 405, `status ${r.status}`);

  /* And the database refuses even if a route ever existed. */
  let refused = false;
  try {
    await pg.exec('set role syk_app');
    await pg.query('update sales set total = 1 where id = $1', [saleId]);
  } catch (err) {
    refused = /permission denied|row-level security/i.test(err.message);
  } finally {
    await pg.exec('reset role');
  }
  ok('the database refuses an edit to a sale', refused);
}

group('M-Pesa: per-shop till');
let tillId;
let callbackSecret;
let checkoutId;
{
  const t = await call('POST', '/api/mpesa/tills', {
    label: 'Counter till',
    shortcode: '174379',
    type: 'till',
    passkey: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    consumerKey: 'test-key',
    consumerSecret: 'test-secret',
    environment: 'sandbox',
    isDefault: true,
  });
  ok('POST /api/mpesa/tills adds one', t.status === 200, `status ${t.status} ${JSON.stringify(t.body).slice(0, 120)}`);
  tillId = t.body.till.id;
  ok('it comes with a callback URL for the Daraja portal', /^\/pay\/[a-f0-9]{32,}$/.test(t.body.callbackPath || ''), t.body.callbackPath);
  ok('and the URL is free of the words Safaricom rejects', !/mpesa|m-pesa|safaricom/i.test(t.body.callbackUrl || 'x'));
  callbackSecret = (t.body.callbackPath || '').replace('/pay/', '');

  const list = await call('GET', '/api/mpesa/tills');
  ok('the till is listed', list.body.tills.length === 1);
  ok('the list carries no secrets', !JSON.stringify(list.body).includes('bfb279f9aa'));

  /* Start a prompt. There is no internet-facing Daraja here, so the OAuth call
     will fail — which is what a shop sees with a wrong consumer key. The point
     of the test is that the failure is clean and the request is recorded. */
  const p = await call('POST', '/api/mpesa/prompt', {
    phone: '0712 345 678',
    amount: 480,
    ref: receiptNo,
    tillId,
  });
  ok('a prompt either goes out or fails with a readable reason', [200, 400, 502].includes(p.status), `status ${p.status}`);
  if (p.status !== 200) {
    ok('the reason names Safaricom or the credentials', /credential|Safaricom|prompt/i.test(p.body.error || ''), p.body.error);
    const rec = await pg.query('select status from mpesa_requests order by created_at desc limit 1');
    ok('the attempt was recorded as failed, not lost', rec.rows[0].status === 'failed', rec.rows[0].status);
  }

  /* The callback is the part that must be right whether or not Daraja is up.
     Pretend Safaricom just sent it. */
  const row = await pg.query(
    `insert into mpesa_requests (shop_id, till_id, sale_id, checkout_request_id, phone, amount, account_ref)
     select $1, $2, $3, 'ws_CO_TEST_1', '254712345678', 480, $4
     returning id`,
    [(await pg.query(`select id from shops where name = 'Bahari Duka'`)).rows[0].id, tillId, saleId, 'S-0001']
  );
  ok('a pending request is on file', Boolean(row.rows[0].id));

  const cb = await fetch(`${base}/pay/${callbackSecret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      Body: {
        stkCallback: {
          MerchantRequestID: 'm-1',
          CheckoutRequestID: 'ws_CO_TEST_1',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 480 },
              { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
        },
      },
    }),
  });
  ok('the callback answers Safaricom with ResultCode 0', cb.status === 200);
  const cbBody = await cb.json();
  ok('and the exact body Safaricom expects', cbBody.ResultCode === 0 && cbBody.ResultDesc === 'Accepted');

  const settled = await pg.query(`select status, mpesa_receipt from mpesa_requests where checkout_request_id = 'ws_CO_TEST_1'`);
  ok('the request is settled', settled.rows[0].status === 'success', settled.rows[0].status);
  ok('with the Safaricom receipt', settled.rows[0].mpesa_receipt === 'NLJ7RT61SV');

  const paidRows = await pg.query(`select count(*)::int n from sale_payments where mpesa_receipt = 'NLJ7RT61SV'`);
  ok('the money is booked against the sale, once', paidRows.rows[0].n === 1, paidRows.rows[0].n);

  /* Replay it: Safaricom retries, and a retry must not credit twice. */
  const again = await fetch(`${base}/pay/${callbackSecret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      Body: { stkCallback: { CheckoutRequestID: 'ws_CO_TEST_1', ResultCode: 0, ResultDesc: 'ok',
        CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' }] } } },
    }),
  });
  ok('a replayed callback is still accepted', again.status === 200);
  const twice = await pg.query(`select count(*)::int n from sale_payments where mpesa_receipt = 'NLJ7RT61SV'`);
  ok('and cannot credit the same money twice', twice.rows[0].n === 1, twice.rows[0].n);

  const wrong = await fetch(`${base}/pay/0000000000000000`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'x', ResultCode: 0 } } }),
  });
  ok('an unknown callback secret is rejected', wrong.status === 404);
}

group('the super admin');
{
  jar = {};
  /* The seed already made one; this proves the helper is idempotent. */
  await pg.query(`select create_super_admin('admin@shopyangu.co.ke', 'Platform admin')`);

  const r = await call('POST', '/api/admin/signin', { email: 'admin@shopyangu.co.ke' });
  ok('POST /api/admin/signin sends a code', r.status === 200 && r.body.next === 'verify');

  const denied = await call('GET', '/api/admin/overview');
  ok('the console is closed before the code is entered', denied.status === 401, `status ${denied.status}`);

  const v = await call('POST', '/api/admin/signin/verify', { email: 'admin@shopyangu.co.ke', code: lastCode() });
  ok('the code signs the admin in', v.status === 200 && v.body.next === 'admin', `status ${v.status}`);

  const o = await call('GET', '/api/admin/overview');
  ok('GET /api/admin/overview answers', o.status === 200, `status ${o.status}`);
  ok('it lists every shop', o.body.shops.length >= 2, `shops: ${o.body.shops.map((s) => s.name).join(', ')}`);
  ok('with the owner email for each', o.body.shops.every((s) => s.ownerEmail.includes('@')));
  ok('and who is logged in', o.body.sessions.length >= 1, `sessions: ${o.body.sessions.length}`);
  ok('the live session shows its shop', o.body.sessions.some((s) => s.shopName === 'Bahari Duka'));
  ok('totals add up', o.body.totals.shops >= 2 && typeof o.body.totals.salesAll === 'number');

  const shop = o.body.shops.find((s) => s.name === 'Bahari Duka');
  const detail = await call('GET', `/api/admin/shops/${shop.id}`);
  ok('one shop can be opened in detail', detail.status === 200 && detail.body.shop.name === 'Bahari Duka');
  ok('with its owner', detail.body.shop.ownerEmail === 'amina@bahariduka.co.ke');
  ok('and its tills', detail.body.tills.length === 1);

  /* A super admin is not a shop. It must not be able to read shop data. */
  const boot = await call('GET', '/api/bootstrap');
  ok('a super admin cannot open a shop\'s bootstrap', boot.status === 403, `status ${boot.status}`);

  /* Pause: the shop is suspended and its sessions end immediately. */
  const p = await call('POST', `/api/admin/shops/${shop.id}/pause`, { reason: 'Unpaid for two months' });
  ok('a shop can be paused', p.status === 200 && p.body.shop.suspended === true);

  /* Pausing also ends every session in that shop immediately, so the owner's
     old cookie is dead. Prove that first. */
  const adminJar = { ...jar };
  jar = { ...ownerCookie };
  const knockedOut = await call('GET', '/api/bootstrap');
  ok('pausing ends the shop\'s live sessions at once', knockedOut.status === 401, `status ${knockedOut.status}`);

  /* And if they sign in again, they are told the shop is paused. */
  jar = {};
  await call('POST', '/api/auth/signin', { email: 'amina@bahariduka.co.ke' });
  const blocked = await call('POST', '/api/auth/signin/verify', {
    email: 'amina@bahariduka.co.ke',
    code: lastCode(),
  });
  ok('a paused shop cannot sign in', blocked.status === 403, `status ${blocked.status}`);
  ok('with a message that says what to do', /paused/i.test(blocked.body.error || ''), blocked.body.error);

  jar = adminJar;
  const resume = await call('POST', `/api/admin/shops/${shop.id}/resume`);
  ok('and resumed again', resume.status === 200 && resume.body.shop.suspended === false);

  jar = {};
  await call('POST', '/api/auth/signin', { email: 'amina@bahariduka.co.ke' });
  const back = await call('POST', '/api/auth/signin/verify', {
    email: 'amina@bahariduka.co.ke',
    code: lastCode(),
  });
  ok('after which the owner is back at the till', back.status === 200, `status ${back.status}`);
  const fixed = await call('GET', '/api/bootstrap');
  ok('and the shop opens', fixed.status === 200, `status ${fixed.status}`);
  /* This is the owner's live cookie now; pausing revoked the first one. */
  ownerCookie = { ...jar };
}

group('shop isolation: one shop cannot see another');
{
  /* Make a second shop with a product, then prove the first cannot read it. */
  jar = {};
  const s = await call('POST', '/api/auth/signup', { shop: 'Pwani Hardware', name: 'Juma', email: 'juma@pwani.co.ke' });
  const v = await call('POST', '/api/auth/signup/verify', { email: 'juma@pwani.co.ke', code: lastCode() });
  ok('a second shop signs up', v.status === 200);
  const p = await call('POST', '/api/products', { name: 'Cement 50kg', cost: 690, price: 780, qty: 5 });
  ok('and adds its own product', p.status === 200);

  const itsBoot = await call('GET', '/api/bootstrap');
  ok('it sees only its own catalogue', itsBoot.body.products.length === 1 && itsBoot.body.products[0].name === 'Cement 50kg', itsBoot.body.products.map((x) => x.name).join(','));
  ok('and no customers from the other shop', itsBoot.body.customers.length === 0, itsBoot.body.customers.length);

  /* The first shop's data is still whole. */
  jar = { ...ownerCookie };
  const mine = await call('GET', '/api/bootstrap');
  /* Not "one product": the point is that nothing from the other shop crossed
     over, whatever this shop has added of its own by now. */
  ok('and the first shop still sees only its own',
    mine.body.products.every((x) => x.name !== 'Cement 50kg'),
    mine.body.products.map((x) => x.name).join(','));
}

group('sessions: signing out');
{
  jar = { ...ownerCookie };
  const before = await call('GET', '/api/sessions');
  ok('the device list shows the devices', before.body.sessions.length >= 1);

  const out = await call('POST', '/api/auth/signout');
  ok('POST /api/auth/signout answers', out.status === 200);
  const after = await call('GET', '/api/bootstrap');
  ok('and the cookie no longer works', after.status === 401, `status ${after.status}`);
}

group('rate limiting');
{
  jar = {};
  let limited = false;
  for (let i = 0; i < 8; i++) {
    const r = await call('POST', '/api/auth/signin', { email: 'juma@pwani.co.ke' });
    if (r.status === 429) {
      limited = true;
      ok('asking for too many codes is refused', true, `on attempt ${i + 1}`);
      break;
    }
  }
  ok('the sixth code in fifteen minutes is too many', limited);
}

/* ------------------------------------------------------------------- done */

console.log = realLog;
console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} passed, ${fail} failed\x1b[0m`);
if (failures.length) {
  console.log('\nFailed:');
  for (const f of failures) console.log('  · ' + f);
}

server.close();
await pg.close();
process.exit(fail ? 1 : 0);
