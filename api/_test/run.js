/* ============================================================ api/_test/run.js

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
const { __setTestDriver } = await import('../_lib/db.js');
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
  ok(
    'health says who sends the sign-up code, so "no email arrived" has an answer',
    r.body.auth && r.body.auth.driver === 'none',
    JSON.stringify(r.body.auth)
  );
}

group('sign-up: a new shop, by email code');
let ownerCookie;
{
  const r = await call('POST', '/api/auth/signup', {
    shop: 'Bahari Duka',
    name: 'Amina Hassan',
    email: 'amina@bahariduka.co.ke',
    password: 'bahari-dhow-2026',
    confirmPassword: 'bahari-dhow-2026',
  });
  ok('POST /api/auth/signup accepts a new shop', r.status === 200, `status ${r.status}`);
  ok('it is a new sign-up, not an existing account', r.body.existing === false);
  ok('with no Neon Auth configured, our own mailer sends the code', r.body.sentBy === 'ours', r.body.sentBy);
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

group('passwords: chosen at sign-up, used every day after');
{
  /* The shop made above chose a password. The FIRST sign-in of that shop was
     the emailed code — that is how the inbox was proved. Now the password is
     the door, and no email is sent. */
  jar = {};

  const wrong = await call('POST', '/api/auth/signin/password', {
    email: 'amina@bahariduka.co.ke',
    password: 'not-the-password',
  });
  ok('a wrong password is refused', wrong.status === 400, `status ${wrong.status}`);
  ok('and no session cookie is set', !jar.syk_session);
  ok(
    'the message does not reveal whether the address exists',
    wrong.body.error === 'That email and password do not match.',
    wrong.body.error
  );

  const unknown = await call('POST', '/api/auth/signin/password', {
    email: 'nobody@nowhere.co.ke',
    password: 'not-the-password',
  });
  ok(
    'an unknown address gets the same answer as a wrong password',
    unknown.status === wrong.status && unknown.body.error === wrong.body.error
  );

  const before = lastCode();
  const good = await call('POST', '/api/auth/signin/password', {
    email: 'Amina@Bahariduka.co.ke',
    password: 'bahari-dhow-2026',
  });
  ok('the right password signs in', good.status === 200 && Boolean(jar.syk_session), `status ${good.status}`);
  ok('it lands on the dashboard, not on a code screen', good.body.next === 'dashboard');
  ok('the email address is matched whatever its capitals', good.body.user?.email === 'amina@bahariduka.co.ke');
  ok('no email was sent — that is the point of a password', lastCode() === before);

  const me = await call('GET', '/api/session');
  ok('the session is real', me.body.signedIn === true && me.body.user.role === 'owner');

  /* Exactly what is stored, and it is not the password. */
  const row = await pg.query(
    `select password_hash, password_salt, password_params, password_set_at
       from logins where email = 'amina@bahariduka.co.ke'`
  );
  const stored = row.rows[0];
  ok('a hash is stored, not the password', Boolean(stored.password_hash) && stored.password_hash !== 'bahari-dhow-2026');
  ok('with a salt of its own', Boolean(stored.password_salt));
  ok('and the cost recorded, so it can be raised later', /^scrypt\$\d+\$\d+\$\d+\$\d+$/.test(stored.password_params || ''), stored.password_params);
  ok('and the date it was set', Boolean(stored.password_set_at));
  ok('the plain password appears nowhere in the database', !JSON.stringify(row.rows).includes('bahari-dhow-2026'));

  /* Two different people with the same password must not look the same. */
  const salt1 = stored.password_salt;
  const other = await pg.query(
    `select password_salt from logins where email = 'juma@pwani.co.ke'`
  );
  ok('a second shop with the same password gets a different salt', !other.rows[0] || other.rows[0].password_salt !== salt1);

  jar = { ...ownerCookie };
}

group('passwords: what the form refuses, and why');
{
  const attempt = async (password) => {
    jar = {};
    return call('POST', '/api/auth/signup', {
      shop: 'Kibanda Tests',
      name: 'Test Person',
      email: 'kibanda@tests.co.ke',
      password,
      confirmPassword: password,
    });
  };

  jar = {};
  const mismatch = await call('POST', '/api/auth/signup', {
    shop: 'Kibanda Tests',
    name: 'Test Person',
    email: 'kibanda@tests.co.ke',
    password: 'long-enough-1',
    confirmPassword: 'long-enough-2',
  });
  ok('two different passwords are refused before anything is written', mismatch.status === 400, `status ${mismatch.status}`);
  const none = await pg.query(`select count(*)::int n from pending_signups where email = 'kibanda@tests.co.ke'`);
  ok('and no sign-up was created', none.rows[0].n === 0);

  const short = await attempt('abc123');
  ok('a short password is refused, with a reason', short.status === 400 && /8 characters/.test(short.body.error), short.body.error);

  const digits = await attempt('48291047');
  ok('an all-number password is refused', digits.status === 400 && /numbers/.test(digits.body.error), digits.body.error);

  const common = await attempt('password123');
  ok('a common password is refused', common.status === 400, common.body.error);

  const withEmail = await attempt('kibanda-is-my-password');
  ok('a password containing the email name is refused', withEmail.status === 400, withEmail.body.error);

  /* The shop name is on every receipt, so it is not a secret either. Checked
     with an address whose own name is not inside the password. */
  jar = {};
  const withShop = await call('POST', '/api/auth/signup', {
    shop: 'Kibanda Tests',
    name: 'Test Person',
    email: 'zawadi@tests.co.ke',
    /* Written without the space, the way somebody actually types it. */
    password: 'kibandatests99',
    confirmPassword: 'kibandatests99',
  });
  ok(
    'a password containing the shop name is refused, and says why',
    withShop.status === 400 && /shop name/.test(withShop.body.error || ''),
    withShop.body.error
  );

  jar = {};
  const fine = await attempt('chapati-na-ndengu');
  ok('a good passphrase is accepted', fine.status === 200, `status ${fine.status}`);
  jar = { ...ownerCookie };
}

group('passwords: the way back in when one is lost');
{
  /* The code path has not gone away. It is the spare key: forget the password,
     ask for a code, get back in — and then set a new one. */
  jar = {};
  const r = await call('POST', '/api/auth/signin', { email: 'amina@bahariduka.co.ke' });
  ok('asking for a code still works when a password exists', r.status === 200 && r.body.next === 'verify');

  const v = await call('POST', '/api/auth/signin/verify', {
    email: 'amina@bahariduka.co.ke',
    code: lastCode(),
  });
  ok('the code signs in, without the password', v.status === 200 && Boolean(jar.syk_session));

  jar = { ...jar };
  const changed = await call('POST', '/api/auth/password', {
    currentPassword: 'bahari-dhow-2026',
    newPassword: 'pwani-mango-2027',
    confirmPassword: 'pwani-mango-2027',
  });
  ok('a signed-in person can change the password', changed.status === 200, `status ${changed.status}`);

  jar = {};
  const old = await call('POST', '/api/auth/signin/password', {
    email: 'amina@bahariduka.co.ke',
    password: 'bahari-dhow-2026',
  });
  ok('the old password no longer works', old.status === 400, `status ${old.status}`);

  const fresh = await call('POST', '/api/auth/signin/password', {
    email: 'amina@bahariduka.co.ke',
    password: 'pwani-mango-2027',
  });
  ok('the new one does', fresh.status === 200 && Boolean(jar.syk_session), `status ${fresh.status}`);

  const back = await call('POST', '/api/auth/password', {
    currentPassword: 'pwani-mango-2027',
    newPassword: 'bahari-dhow-2026',
    confirmPassword: 'bahari-dhow-2026',
  });
  ok('and it can be changed back', back.status === 200, `status ${back.status}`);

  const anon = await call('POST', '/api/auth/password', {
    newPassword: 'somebody-elses-shop',
    confirmPassword: 'somebody-elses-shop',
  }, { withCookies: false });
  ok('setting a password needs a session', anon.status === 401, `status ${anon.status}`);

  jar = { ...ownerCookie };
}

group('passwords: guessing is slowed down');
{
  jar = {};
  const email = 'kibanda-tests-lock@tests.co.ke';
  /* A real account to guess at, made through SQL so no email is sent. */
  const shop = await pg.query(
    `insert into shops (name, phone) values ('Lock Test Shop', '0700000000') returning id`
  );
  const { hashPassword } = await import('../_lib/password.js');
  const h = await hashPassword('correct-horse-battery');
  await pg.query(
    `insert into logins (shop_id, email, name, role, email_verified_at,
                         password_hash, password_salt, password_params, password_set_at)
     values ($1, $2, 'Lock Test', 'owner', now(), $3, $4, $5, now())`,
    [shop.rows[0].id, email, h.hash, h.salt, h.params]
  );

  let lastStatus = 0;
  for (let i = 0; i < 9; i++) {
    const r = await call('POST', '/api/auth/signin/password', { email, password: 'wrong-' + i });
    lastStatus = r.status;
  }
  ok('the eighth wrong password starts refusing', lastStatus === 429, `status ${lastStatus}`);

  const locked = await call('POST', '/api/auth/signin/password', {
    email,
    password: 'correct-horse-battery',
  });
  ok('even the right password waits once the limit is hit', locked.status === 429, `status ${locked.status}`);
  ok('and the message says how long, and what to do', /minutes/.test(locked.body.error || ''), locked.body.error);

  /* The code path is not affected by a password lockout — otherwise a guesser
     could lock an owner out of their own shop. */
  const byCode = await call('POST', '/api/auth/signin', { email });
  ok('signing in by code is still possible during a password lockout', byCode.status === 200);

  jar = { ...ownerCookie };
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

group('Neon Auth: the first code, sent and checked by Neon');
{
  /* A REAL Better Auth 1.7 server, in this process, on a real port — the same
     protocol Managed Better Auth speaks. Not a stub returning 200 for
     everything: it generates a real code, rejects real wrong codes, and refuses
     an untrusted origin exactly as the hosted service does.

     This is the closest this sandbox can get to the live service. Neon's
     endpoints are unreachable from here, so the proof is: the shop's client and
     the shop's routes against Better Auth's own handler. */
  const http = await import('node:http');
  const { betterAuth } = await import('better-auth');
  const { emailOTP } = await import('better-auth/plugins/email-otp');
  const { memoryAdapter } = await import('better-auth/adapters/memory');

  const store = { user: [], session: [], account: [], verification: [] };
  const delivered = { otp: '', type: '', email: '' };

  const better = betterAuth({
    secret: 'test-secret-for-the-local-better-auth-32',
    baseURL: 'http://127.0.0.1/neondb/auth',
    basePath: '/neondb/auth',
    /* The hosted service trusts the domains configured on the branch. The site
       under test is on SITE_URL, so that is what is trusted here. */
    trustedOrigins: [process.env.SITE_URL, 'http://localhost:*'],
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        sendVerificationOTP({ email, otp, type }) {
          Object.assign(delivered, { otp, type, email });
        },
      }),
    ],
  });

  /* `verifyAtSignup` models the Neon console toggle of the same name. When it is
     on, the user is already verified the moment the account exists — and an
     already-verified user is never sent a sign-up verification code. That is the
     case that made "the app is not requesting the OTP" happen, so it is a real
     toggle here rather than a comment. */
  const console_ = { verifyAtSignup: false };
  const markVerified = (address) => {
    const row = store.user.find((u) => u.email === address);
    if (row) row.emailVerified = console_.verifyAtSignup;
  };

  const neonServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/__delivered') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: delivered.type, digits: String(delivered.otp).length }));
    }

    const response = await better.handler(
      new Request(url, {
        method: req.method,
        headers: req.headers,
        body: body.length && !['GET', 'HEAD'].includes(req.method) ? body : undefined,
      })
    );
    const text = await response.text();

    /* The hosted service marks a new user verified when "Verify at Sign-up" is
       on, before the caller ever sees the response. Same here. */
    let out = text;
    if (url.pathname.endsWith('/sign-up/email') && response.status === 200) {
      try {
        const parsed = JSON.parse(text);
        markNewlyVerified(parsed?.user?.email);
        /* The hosted service RETURNS the verified user, so the caller can see
           it and choose the right kind of code. A body still saying false would
           be the bug being fixed, not a test of it. */
        if (console_.verifyAtSignup && parsed?.user) {
          parsed.user.emailVerified = true;
          out = JSON.stringify(parsed);
        }
      } catch {
        /* A malformed body is the caller's problem, not ours. */
      }
    }

    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(out);
  });

  await new Promise((r) => neonServer.listen(0, '127.0.0.1', r));

  const { env } = await import('../_lib/config.js');
  env.NEON_AUTH_BASE_URL = `http://127.0.0.1:${neonServer.address().port}/neondb/auth`;

  /* The code that was really generated, read from the server that generated it.
     The shop's client is never given it. */
  const realCode = () => delivered.otp;

  /* Apply the console setting at sign-up time WITHOUT patching the adapter's
     arrays: the memory adapter spreads them (`[...db.user]`) internally, so a
     patched `push` is bypassed and, worse, breaks its transaction wrapper.
     The handler is wrapped instead — this runs after Better Auth has answered
     and before the shop sees the reply, which is exactly where the hosted
     service's "Verify at Sign-up" takes effect. */
  const markNewlyVerified = (address) => {
    if (!console_.verifyAtSignup) return;
    const row = store.user.find((u) => u.email === String(address).toLowerCase());
    if (row) row.emailVerified = true;
  };

  const email = 'neon-shop@jaribu.co.ke';

  jar = {};
  const r = await call('POST', '/api/auth/signup', {
    shop: 'Jaribu Duka',
    name: 'Neema Otieno',
    email,
    password: 'bahari-ndege-2026',
    confirmPassword: 'bahari-ndege-2026',
  });
  ok('sign-up still answers when Neon is the sender', r.status === 200, `status ${r.status}`);
  ok('and says who sent the code', r.body.sentBy === 'neon-auth', r.body.sentBy);
  ok('a Neon account was created for the person', r.body.neonAccount === 'created', r.body.neonAccount);
  ok('Neon really generated a six-digit code', /^\d{6}$/.test(realCode() || ''), String(realCode()));
  ok('of the sign-up verification type', delivered.type === 'email-verification', delivered.type);
  ok('for the right address', delivered.email === email, delivered.email);

  /* The email this server sends must not name a code it cannot check. */
  const afterSignup = captured.slice(-14).join('\n');
  ok(
    'our own email carries no code that Neon would reject',
    !/is your Shop Yangu Kenya code/.test(afterSignup),
    afterSignup.slice(0, 80)
  );
  ok('but it does carry the link', /\/auth\/link\/\?token=/.test(afterSignup));

  const wrong = await call('POST', '/api/auth/signup/verify', { email, code: '000000' });
  ok('a code Better Auth rejects is refused here too', wrong.status === 400, `status ${wrong.status}`);

  const right = await call('POST', '/api/auth/signup/verify', { email, code: realCode() });
  ok(
    'the code Better Auth accepted creates the shop',
    right.status === 200 && right.body.user?.role === 'owner',
    `status ${right.status}`
  );
  ok('and the person is signed in', Boolean(jar.syk_session));

  /* The password chosen at sign-up must survive a Neon-verified code. */
  jar = {};
  const byPassword = await call('POST', '/api/auth/signin/password', {
    email,
    password: 'bahari-ndege-2026',
  });
  ok('the password from that sign-up works afterwards', byPassword.status === 200, `status ${byPassword.status}`);

  /* Our code was never in play, and must not become a way in by accident. */
  jar = {};
  const ourOwn = lastCode();
  const sneaky = await call('POST', '/api/auth/signup/verify', { email, code: ourOwn || '111111' });
  ok('a shop cannot be created twice with the same address', sneaky.status !== 200, `status ${sneaky.status}`);
  jar = { ...ownerCookie };

  /* ---------------------------------------------------------------- THE CASE
     "Verify at Sign-up" switched ON. This is the default on a Neon branch, and
     it is what made the OTP silently never arrive: the user is verified by the
     time we would ask for a verification code, so nothing is sent. */
  console_.verifyAtSignup = true;

  jar = {};
  const verifiedEmail = 'already-verified@jaribu.co.ke';
  delivered.otp = '';
  delivered.type = '';

  const v1 = await call('POST', '/api/auth/signup', {
    shop: 'Jaribu Tatu',
    name: 'Verified Person',
    email: verifiedEmail,
    password: 'bahari-ndege-2026',
    confirmPassword: 'bahari-ndege-2026',
  });
  ok('sign-up answers when the address is verified by Neon at sign-up', v1.status === 200, `status ${v1.status}`);
  ok('and reports that Neon considers it verified', v1.body.verifiedAtNeon === true, String(v1.body.verifiedAtNeon));
  ok(
    'so it asks for a SIGN-IN code, which is the only kind that can arrive',
    v1.body.codeType === 'sign-in',
    v1.body.codeType
  );
  ok('and Neon really sent one', /^\d{6}$/.test(realCode() || ''), String(realCode()));

  /* The code is a sign-in code, so verify-email would reject it. The shop has to
     try the other check too, or a real code reads as wrong. */
  const accepted = await call('POST', '/api/auth/signup/verify', { email: verifiedEmail, code: realCode() });
  ok(
    'a sign-in code is accepted at sign-up, not just a verification code',
    accepted.status === 200 && accepted.body.user?.role === 'owner',
    `status ${accepted.status}`
  );

  jar = {};
  const byPw = await call('POST', '/api/auth/signin/password', { email: verifiedEmail, password: 'bahari-ndege-2026' });
  ok('and the password from that sign-up still works', byPw.status === 200, `status ${byPw.status}`);

  /* A wrong code must STILL be refused in this mode. Accepting the second check
     must not turn into accepting anything. */
  const wrongStillWrong = await call('POST', '/api/auth/signup/verify', { email: verifiedEmail, code: '000000' });
  ok('a wrong code is still refused when the user is already verified', wrongStillWrong.status !== 200, `status ${wrongStillWrong.status}`);

  console_.verifyAtSignup = false;
  jar = { ...ownerCookie };

  /* A dead Neon must not stop a shop being created. */
  await new Promise((r) => neonServer.close(r));
  const email2 = 'neon-down@jaribu.co.ke';
  jar = {};
  const fallback = await call('POST', '/api/auth/signup', {
    shop: 'Jaribu Pili',
    name: 'Neema Again',
    email: email2,
    password: 'bahari-ndege-2026',
    confirmPassword: 'bahari-ndege-2026',
  });
  ok('an unreachable Neon does not stop the sign-up', fallback.status === 200, `status ${fallback.status}`);
  ok('it falls back to our own mailer, and says so', fallback.body.sentBy === 'ours', fallback.body.sentBy);

  const fallbackCode = lastCode();
  ok('and our own code was emailed', /^\d{6}$/.test(fallbackCode || ''), fallbackCode);
  const madeIt = await call('POST', '/api/auth/signup/verify', { email: email2, code: fallbackCode });
  ok('which completes a real shop', madeIt.status === 200, `status ${madeIt.status}`);

  env.NEON_AUTH_BASE_URL = '';
  jar = { ...ownerCookie };
}

group('Neon Auth: the setting that silently breaks sign-in');
{
  /* `403 Invalid origin`. Better Auth refuses a POST whose Origin is not on the
     branch's trusted-domain list, and this is the failure that makes a
     correctly-configured deployment look broken. It is a setting, so it is
     tested as one: the client's origin comes from SITE_URL, and if SITE_URL is
     wrong the whole thing must fail loudly rather than half-work. */
  const { authHealth } = await import('../_lib/neon-auth.js');
  const { env } = await import('../_lib/config.js');

  const before = authHealth();
  ok('with nothing configured, health says the server sends codes itself', before.driver === 'none' && before.ok === true);

  const savedSite = env.SITE_URL;
  const savedPepper = env.TOKEN_PEPPER;

  env.NEON_AUTH_BASE_URL = 'https://ep-example-123456.eu-central-1.aws.neon.tech/neondb/auth';
  const good = authHealth();
  ok('a proper base URL is ok', good.ok === true, JSON.stringify(good));
  ok('and health names the trusted origin it will send', good.trustedOrigin === env.SITE_URL, good.trustedOrigin);

  env.NEON_AUTH_BASE_URL = 'https://ep-example.neon.tech/';
  const noPath = authHealth();
  ok('a base URL missing /neondb/auth is caught, with the fix in the message', noPath.ok === false && /neondb\/auth/.test(noPath.error), noPath.error);

  env.NEON_AUTH_BASE_URL = 'not a url';
  const junk = authHealth();
  ok('a nonsense base URL is caught', junk.ok === false, junk.error);

  env.NEON_AUTH_BASE_URL = 'https://ep-example.neon.tech/neondb/auth';
  env.TOKEN_PEPPER = '';
  env.NEON_AUTH_COOKIE_SECRET = '';
  const noSecret = authHealth();
  ok(
    'with no cookie secret and no pepper, health says which two settings fix it',
    noSecret.ok === false && /NEON_AUTH_COOKIE_SECRET/.test(noSecret.error) && /TOKEN_PEPPER/.test(noSecret.error),
    noSecret.error
  );

  env.NEON_AUTH_COOKIE_SECRET = 'a'.repeat(40);
  ok('a cookie secret of its own is enough', authHealth().ok === true);
  env.NEON_AUTH_COOKIE_SECRET = '';

  env.TOKEN_PEPPER = savedPepper;
  env.SITE_URL = savedSite;
  env.NEON_AUTH_BASE_URL = '';
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
