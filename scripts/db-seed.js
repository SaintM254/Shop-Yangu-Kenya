#!/usr/bin/env node
/* ============================================================ scripts/db-seed.js

   Runs db/004_seed_demo.sql: one shop with fourteen days of trading, so you
   can look at a working till instead of an empty one.

   It is idempotent — the SQL returns early if the demo shop already exists —
   and it never deletes anything.

     node scripts/db-seed.js
     node scripts/db-seed.js --email owner@mydemo.co.ke
     node scripts/db-seed.js --no-admin      (skip the super-admin account)

   Run it against a NEW Neon project the first time. On a database with real
   shops it only adds the demo shop, which is harmless but pointless.
*/

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

process.chdir(path.join(root, 'api'));
const { env } = await import('../api/lib/config.js');
process.chdir(root);

const args = process.argv.slice(2);
const emailArg = args.indexOf('--email');
const email = emailArg !== -1 ? args[emailArg + 1] : 'demo@shopyangu.co.ke';
const withAdmin = !args.includes('--no-admin');

if (!env.DATABASE_URL) {
  console.error('\n  No DATABASE_URL. See docs/01-neon-setup.md.\n');
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(env.DATABASE_URL);

console.log(`\n  Seeding demo data as ${email}\n`);

/* 004 is a set of function definitions plus one call. The definitions are
   plain statements; the call is the part with the email in it, so it is done
   here rather than by string-replacing the file. */
const text = fs.readFileSync(path.join(root, 'db', '004_seed_demo.sql'), 'utf8');

/* Drop the two `select …` calls at the bottom: this script runs them itself. */
const definitions = text
  .replace(/^select seed_demo\([^)]*\);\s*$/m, '')
  .replace(/^select create_super_admin\([^)]*\);\s*$/m, '')
  .trim();

try {
  await sql.transaction(definitions.split(/;\s*\n(?=\s*create or replace function)/).map((s) => {
    const t = s.trim();
    return sql.query(t.endsWith(';') ? t : t + ';');
  }));
  console.log('  ✓ functions created');
} catch (err) {
  console.error('  ✗ could not create the seed functions:\n');
  console.error('   ', err.message, '\n');
  process.exit(1);
}

try {
  const shopId = await sql`select seed_demo(${email}) as id`;
  console.log(`  ✓ demo shop ready  (${shopId[0].id})`);
} catch (err) {
  console.error('  ✗ seeding failed:\n\n   ', err.message, '\n');
  process.exit(1);
}

if (withAdmin) {
  try {
    await sql`select create_super_admin('admin@shopyangu.co.ke', 'Platform admin')`;
    console.log('  ✓ super admin ready  admin@shopyangu.co.ke');
  } catch (err) {
    console.error('  ! super admin not created:', err.message);
  }
}

const summary = await sql`
  select
    (select count(*)::int from products)  as products,
    (select count(*)::int from customers) as customers,
    (select count(*)::int from sales)     as sales,
    (select coalesce(sum(total),0)::text from sales) as takings
`;

console.log(`
  ${summary[0].products} products · ${summary[0].customers} customers
  ${summary[0].sales} receipts · Ksh ${summary[0].takings} taken

  Sign in with ${email} — the code is emailed (or printed to the API log).
  Super admin: admin@shopyangu.co.ke
`);
