#!/usr/bin/env node
/* ============================================================ scripts/make-super-admin.js

   Adds a platform admin, or promotes an existing login to one.

     node scripts/make-super-admin.js you@example.com "Your Name"

   There is no API route that can do this, on purpose: a super admin can read
   every shop, so creating one is a decision made at the database by someone
   with the connection string, not by a request.

   A super admin belongs to no shop. If the address already owns one, it is
   promoted and detached — which is why the script asks before doing that.
*/

import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* The scripts sit outside api/, and npm puts the API's packages in
   api/node_modules. Resolving from api/package.json finds them wherever npm
   decided to hoist them — root or workspace — instead of depending on which. */
const apiRequire = createRequire(path.join(root, 'api', 'package.json'));
const apiModule = async (name) => {
  const mod = await import(pathToFileURL(apiRequire.resolve(name)).href);
  /* A CommonJS package imported by URL arrives wrapped in `default`, which
     named imports would hide. Unwrap so both shapes look the same. */
  return mod && mod.default && !mod.neon ? { ...mod.default, ...mod } : mod;
};


process.chdir(path.join(root, 'api'));
const { env } = await import('../api/_lib/config.js');
process.chdir(root);

const [email, name = 'Platform admin'] = process.argv.slice(2);

if (!email || !email.includes('@')) {
  console.error(`
  Usage:  node scripts/make-super-admin.js you@example.com "Your Name"

  The address does not need an account: one is made. Sign-in works the same
  way as a shop — a code or a link to that inbox.
`);
  process.exit(1);
}

if (!env.DATABASE_URL) {
  console.error('\n  No DATABASE_URL. See docs/01-neon.md.\n');
  process.exit(1);
}

const { neon } = await apiModule('@neondatabase/serverless');
const sql = neon(env.DATABASE_URL);

const clean = email.trim().toLowerCase();

const [existing] = await sql`
  select l.id, l.name, l.role, l.shop_id, s.name as shop_name
    from logins l left join shops s on s.id = l.shop_id
   where l.email = ${clean}
`;

if (existing && existing.shop_id) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\n  ${clean} owns the shop "${existing.shop_name}".\n` +
      `  Promoting it to super admin detaches it from that shop, and the shop\n` +
      `  is left without an owner login.\n\n  Type "detach" to continue: `
  );
  rl.close();
  if (answer.trim() !== 'detach') {
    console.log('\n  Nothing changed.\n');
    process.exit(0);
  }
}

const [row] = await sql`
  insert into logins (shop_id, email, name, role, email_verified_at)
  values (null, ${clean}, ${name}, 'super_admin', now())
  on conflict (email) do update
    set role = 'super_admin',
        shop_id = null,
        email_verified_at = coalesce(logins.email_verified_at, now())
  returning id, email::text as email, role
`;

console.log(`
  ✓ ${row.email} is a super admin.

  Sign in at /admin/ with that address. The code goes to the inbox — or, with
  EMAIL_DRIVER=console, straight to the API log.
`);
