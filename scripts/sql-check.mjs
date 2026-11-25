/* ============================================================ scripts/sql-check.mjs

   Checks the three files people paste into Neon's SQL editor.

   The whole point of db/apply-*.sql is that a person who has never opened a
   terminal can set the database up by copying and pasting. That promise is
   only worth something if the files have actually been tried. So this pastes
   them into a real Postgres, in the same order the docs tell a person to, and
   checks that they apply, that the result is a working shop, and that running
   them a second time changes nothing.

   Run it after any change to db/*.sql or scripts/build-sql.js:

     node scripts/build-sql.js && node scripts/sql-check.mjs

   The Postgres here is PGlite — the real thing, compiled to WebAssembly and
   running in this process. Two extension lines are rewritten below because
   Neon has the pgcrypto and citext extensions and PGlite does not; a person
   pasting into Neon needs no such change.
*/

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* PGlite is installed by the API, and this script sits outside it. Resolve it
   from api/package.json so the script runs from the repository root. */
const apiRequire = createRequire(path.join(root, 'api', 'package.json'));
const { PGlite } = await import(pathToFileURL(apiRequire.resolve('@electric-sql/pglite')).href);
const pg = new PGlite();

/* Neon has both of these extensions; PGlite has neither. The replacement for
   citext is a plain-text domain, created in a way that tolerates a second run
   because one of the checks below runs the files twice. */
const prep = (sql) =>
  sql
    .replace(/create extension if not exists pgcrypto;/g, '-- built in on Neon')
    .replace(
      /create extension if not exists citext;/g,
      'do $domain$ begin create domain citext as text; exception when duplicate_object then null; end $domain$;'
    );

let pass = 0;
let fail = 0;

const run = async (file, label) => {
  try {
    await pg.exec(prep(fs.readFileSync(path.join(root, 'db', file), 'utf8')));
    console.log(`  \x1b[32m✓\x1b[0m ${label} \x1b[90m(${file})\x1b[0m`);
    pass++;
    return true;
  } catch (err) {
    console.log(`  \x1b[31m✗ ${label}\x1b[0m \x1b[90m(${file})\x1b[0m`);
    console.log(`\n${err.message}\n`);
    fail++;
    return false;
  }
};

const one = async (sql, params) => (await pg.query(sql, params)).rows[0];

console.log('\n  Shop Yangu Kenya — the files for the Neon SQL editor\n');

/* -------------------------------------------------- first run, in order */

console.log('  pasting them for the first time:\n');
let good = await run('apply-all.sql', 'database setup');
good = (await run('apply-demo.sql', 'demo shop')) && good;
good = (await run('apply-super-admin.sql', 'platform admin')) && good;

/* ------------------------------------------- what that actually produced */

const shop = await one('select id, name from shops order by created_at limit 1');
const counts = await one(`
  select (select count(*) from products)::int products,
         (select count(*) from sales)::int sales,
         (select count(*) from customers)::int customers
`);
const admin = await one("select email, shop_id from logins where role = 'super_admin'");

const healthy =
  !!shop && counts.products === 20 && counts.sales > 100 && counts.customers > 0 && !!admin && admin.shop_id === null;

const show = (label, value, ok) =>
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label.padEnd(11)} \x1b[90m${value}\x1b[0m`);

console.log('\n  what the pasted files produced:\n');
show('shop', shop ? shop.name : 'MISSING', !!shop);
show('products', counts.products, counts.products === 20);
show('customers', counts.customers, counts.customers > 0);
show('sales', counts.sales, counts.sales > 100);
show('admin', admin ? `${admin.email} (owns no shop)` : 'MISSING', !!admin && admin.shop_id === null);
if (healthy) pass++;
else fail++;

/* ------------------------------------ second run: nothing may change */

console.log('\n  pasting them again, as someone might:\n');
let again = await run('apply-all.sql', 'database setup, again');
again = (await run('apply-demo.sql', 'demo shop, again')) && again;
again = (await run('apply-super-admin.sql', 'platform admin, again')) && again;

const after = await one(`
  select (select count(*) from shops)::int shops,
         (select count(*) from products)::int products,
         (select count(*) from sales)::int sales,
         (select count(*) from logins where role = 'super_admin')::int admins
`);
const unchanged =
  after.shops === 1 && after.products === 20 && after.sales === counts.sales && after.admins === 1;

console.log('');
if (again && unchanged) {
  console.log('  \x1b[32m✓\x1b[0m re-running all three changes nothing — still one shop, one admin\n');
  pass++;
} else {
  console.log(`  \x1b[31m✗ re-running changed the database\x1b[0m \x1b[90m${JSON.stringify(after)}\x1b[0m\n`);
  fail++;
}

/* --------------------------------- removing the demo, as the docs describe

   The docs give three lines for deleting the demo shop, and they only work in
   that order: the audit log refuses deletes without the trigger switched off.
   If that recipe is wrong, a person following the docs hits a wall. */
try {
  await pg.exec(`
    alter table audit_entries disable trigger audit_entries_no_update;
    delete from shops where name = 'Shop Yangu Kenya';
    alter table audit_entries enable trigger audit_entries_no_update;
  `);
  const gone = await one(`
    select (select count(*) from shops)::int shops,
           (select count(*) from products)::int products,
           (select count(*) from sales)::int sales
  `);
  const clean = gone.shops === 0 && gone.products === 0 && gone.sales === 0;
  console.log(
    clean
      ? '  \x1b[32m✓\x1b[0m the documented way to remove the demo shop works\n'
      : `  \x1b[31m✗ removing the demo left rows behind\x1b[0m \x1b[90m${JSON.stringify(gone)}\x1b[0m\n`
  );
  clean ? pass++ : fail++;
} catch (err) {
  console.log(`  \x1b[31m✗ the documented way to remove the demo shop fails\x1b[0m\n${err.message}\n`);
  fail++;
}

console.log(`  ${fail ? '\x1b[31m' : '\x1b[32m'}${pass} passed, ${fail} failed\x1b[0m\n`);

await pg.close();
process.exit(fail ? 1 : 0);
