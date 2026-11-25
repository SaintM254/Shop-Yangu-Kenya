#!/usr/bin/env node
/* ============================================================ scripts/db-migrate.js

   Runs db/*.sql against Neon, in order, once each, inside a transaction.

   Why a script rather than pasting into the Neon SQL editor:

     · 001–004 must be applied in order, and 003 recreates functions 002
       defined — pasting them out of order produces a database that looks
       fine until a sale fails;
     · a failure halfway leaves nothing behind, because each file is one
       transaction;
     · app_schema tracks what has been applied, so running this twice is safe.

   Usage, from the repository root:

     node scripts/db-migrate.js --check      show what would run
     node scripts/db-migrate.js              run the pending files
     node scripts/db-migrate.js --seed       also run 004 (demo data)
     node scripts/db-migrate.js --fresh      drop the tracking table first
                                             (does NOT drop your tables)

   It reads DATABASE_URL from api/.env, or from the environment.

   IMPORTANT: use the DIRECT connection string here, not the -pooler one.
   DDL through a connection pooler can hit a different backend mid-script.
   The app itself uses the pooler; migrations do not.
*/

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { splitStatements } from '../api/lib/sql-split.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* Reuse the API's .env loader and config so there is one source of truth. */
process.chdir(path.join(root, 'api'));
const { env } = await import('../api/lib/config.js');
process.chdir(root);

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const seed = args.has('--seed');
const fresh = args.has('--fresh');

if (!env.DATABASE_URL) {
  console.error(`
  No DATABASE_URL.

  Copy api/.env.example to api/.env and paste the connection string from the
  Neon console (Connection Details → the DIRECT string, not the pooled one).
  docs/01-neon-setup.md walks through it.
`);
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(env.DATABASE_URL);

/* --------------------------------------------------------------- files */

const files = fs
  .readdirSync(path.join(root, 'db'))
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort();

/* 004 is the demo data: run it only when asked, so production never gets a
   sample shop by accident. */
const planned = files.filter((f) => seed || !f.startsWith('004'));

console.log(`\n  Shop Yangu Kenya — database\n`);
console.log(`  host: ${hostOf(env.DATABASE_URL)}`);
console.log(`  files: ${planned.length}${seed ? ' (including demo data)' : ''}\n`);

/* ------------------------------------------------------------ tracking */

await sql`
  create table if not exists app_schema (
    file       text primary key,
    applied_at timestamptz not null default now(),
    checksum   text
  )
`;

if (fresh) {
  await sql`delete from app_schema`;
  console.log('  --fresh: tracking table cleared; every file will run again.\n');
}

const applied = new Map(
  (await sql`select file, checksum from app_schema`).map((r) => [r.file, r.checksum])
);

/* --------------------------------------------------------------- apply */

let ran = 0;
let skipped = 0;
let failed = 0;

for (const file of planned) {
  const full = path.join(root, 'db', file);
  const body = fs.readFileSync(full, 'utf8');
  const checksum = (await import('node:crypto'))
    .createHash('sha256')
    .update(body)
    .digest('hex')
    .slice(0, 16);

  const prev = applied.get(file);

  if (prev === checksum) {
    console.log(`  \x1b[90m·\x1b[0m ${file}  already applied`);
    skipped++;
    continue;
  }

  if (prev && prev !== checksum) {
    console.log(`  \x1b[33m!\x1b[0m ${file}  changed since it was applied — running it again`);
  }

  if (check) {
    console.log(`  \x1b[36m→\x1b[0m ${file}  would run`);
    continue;
  }

  try {
    /* The whole file in one transaction. Neon's http driver runs a list of
       statements as a transaction via `transaction()`. */
    const statements = splitStatements(body);
    await sql.transaction(statements.map((s) => sql.query(s)));

    await sql`
      insert into app_schema (file, checksum, applied_at)
      values (${file}, ${checksum}, now())
      on conflict (file) do update
        set checksum = excluded.checksum, applied_at = now()
    `;

    console.log(`  \x1b[32m✓\x1b[0m ${file}  applied  (${statements.length} statements)`);
    ran++;
  } catch (err) {
    console.log(`  \x1b[31m✗ ${file}\x1b[0m`);
    console.log(`\n${err.message}\n`);
    failed++;
    break; /* stop: a later file may depend on this one */
  }
}

/* ---------------------------------------------------------------- report */

if (failed) {
  console.log('\n  Stopped. Nothing from the failed file was applied.\n');
  process.exit(1);
}

if (check) {
  console.log('\n  Check only. Nothing was written.\n');
  process.exit(0);
}

/* A quick look at what is actually there, so "did it work" is answered by the
   database rather than by hope. */
const tables = await sql`
  select table_name from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
   order by 1
`;
const views = await sql`
  select table_name from information_schema.views
   where table_schema = 'public' order by 1
`;
const shops = await sql`select count(*)::int as n from shops`.catch(() => [{ n: 0 }]);

console.log(`\n  ${ran} applied, ${skipped} already applied`);
console.log(`  ${tables.length} tables, ${views.length} views, ${shops[0].n} shop(s)\n`);

/* ------------------------------------------------------------------ utils */

function hostOf(conn) {
  try {
    const u = new URL(conn);
    return u.hostname + (u.hostname.includes('-pooler') ? '  (pooled — prefer the direct host)' : '');
  } catch {
    return 'unknown';
  }
}
