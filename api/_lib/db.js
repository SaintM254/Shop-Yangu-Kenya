/* ============================================================ api/_lib/db.js

   One database, two drivers.

   Production is Neon, reached with @neondatabase/serverless's Pool over a
   WebSocket (Node 22 has one built in). Tests and local development use
   PGlite, a Postgres compiled to WebAssembly that runs in this process — the
   same SQL, the same errors, no server to install.

   Everything above this file sees only three things:

     db.query(text, params)     one statement, returns { rows, rowCount }
     db.tx(fn)                  a transaction; fn gets a client with query()
     db.one / db.many / db.none convenience wrappers

   The transaction is not a convenience. Row-level security in 003_rls.sql is
   scoped by a setting that must live in the same transaction as the query:

     BEGIN;
       select set_config('syk.shop_id', '<uuid>', true);
       select * from sales;
     COMMIT;

   `true` means transaction-local, so a pooled connection cannot leak one
   request's shop into the next one.
*/

import { env } from './config.js';

let driver = null;

/* ------------------------------------------------------------------ Neon */

async function neonDriver() {
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: Number(env.DB_POOL_MAX || 5),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  // Neon suspends an idle database; the first query after that can fail with a
  // connection error. The driver retries, but a clear message helps when it
  // cannot.
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  return {
    name: 'neon',
    async query(text, params) {
      const res = await pool.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount };
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn({
          query: async (text, params) => {
            const res = await client.query(text, params);
            return { rows: res.rows, rowCount: res.rowCount };
          },
        });
        await client.query('commit');
        return out;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/* ---------------------------------------------------------------- PGlite */

async function pgliteDriver() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(env.PGLITE_DIR || undefined);

  /* PGlite is a single connection, so transactions must not interleave. A
     promise chain is a mutex: each transaction waits for the last. */
  let lock = Promise.resolve();
  const serial = (fn) => {
    const run = lock.then(fn, fn);
    lock = run.then(
      () => {},
      () => {}
    );
    return run;
  };

  return {
    name: 'pglite',
    query: (text, params) => pg.query(text, params),
    tx(fn) {
      return serial(async () => {
        await pg.exec('begin');
        try {
          const out = await fn({ query: (t, p) => pg.query(t, p) });
          await pg.exec('commit');
          return out;
        } catch (err) {
          await pg.exec('rollback').catch(() => {});
          throw err;
        }
      });
    },
    async close() {
      await pg.close();
    },
  };
}

/* ------------------------------------------------------------------- API */

/* Tests hand in a driver over their own in-process Postgres. Nothing else
   calls this: production and development always build their own. */
export function __setTestDriver(d) {
  driver = d;
}

export async function db() {
  if (driver) return driver;
  driver = env.DATABASE_DRIVER === 'pglite' ? await pgliteDriver() : await neonDriver();
  return driver;
}

export const query = async (text, params) => (await db()).query(text, params);

/* A transaction, scoped to one shop (or to the super admin). */
export async function tx(ctx, fn) {
  const d = await db();
  return d.tx(async (client) => {
    if (ctx && ctx.shopId) {
      await client.query('select set_config($1, $2, true)', ['syk.shop_id', ctx.shopId]);
    }
    if (ctx && ctx.superAdmin) {
      await client.query('select set_config($1, $2, true)', ['syk.super_admin', 'on']);
    }
    return fn(client);
  });
}

export async function one(text, params) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

export async function many(text, params) {
  return (await query(text, params)).rows;
}

export const oneIn = async (client, text, params) => {
  const { rows } = await client.query(text, params);
  return rows[0] || null;
};

export const manyIn = async (client, text, params) => (await client.query(text, params)).rows;

export const noneIn = async (client, text, params) => {
  await client.query(text, params);
};

export async function health() {
  const d = await db();
  const { rows } = await d.query('select now() as at, current_database() as name');
  return { driver: d.name, at: rows[0].at, database: rows[0].name };
}

export async function shutdown() {
  if (driver) await driver.close();
  driver = null;
}
