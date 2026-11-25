/* ============================================================ api/_test/vercel.js

   Checks the one file Vercel actually runs.

   The deployed site uses a different host from a laptop: no port to listen on,
   and a request object in Vercel's shape rather than Node's. api/index.js is
   the twenty lines that translate between them, and it is the only part of
   the system that cannot be exercised by `node server.js`.

   So this drives api/index.js exactly as Vercel does — a Vercel-shaped request
   and a Vercel-shaped response — and asserts that real routes answer. The
   router is not mocked; it runs.

   Run it with:  cd api && npm run test:vercel
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

process.env.DATABASE_DRIVER = 'pglite';
process.env.EMAIL_DRIVER = 'console';
process.env.TOKEN_PEPPER = 'adapter-test-pepper';
process.env.SITE_URL = 'http://localhost:8787';
process.env.SERVE_SITE = 'false';
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';

const { PGlite } = await import('@electric-sql/pglite');
const pg = new PGlite();
const load = (f) => fs.readFileSync(root + '/db/' + f, 'utf8')
  .replace(/create extension if not exists pgcrypto;/g, '--x')
  .replace(/create extension if not exists citext;/g, 'create domain citext as text;');
for (const f of ['001_schema.sql', '002_functions.sql', '003_rls.sql', '004_seed_demo.sql']) await pg.exec(load(f));

let lock = Promise.resolve();
const q = async (t, p) => { const r = await pg.query(t, p); return { rows: r.rows, rowCount: r.affectedRows }; };
const shim = { name: 'pglite', query: q,
  tx(fn) { const run = lock.then(async () => { await pg.exec('begin');
      try { const o = await fn({ query: q }); await pg.exec('commit'); return o; }
      catch (e) { await pg.exec('rollback').catch(()=>{}); throw e; } });
    lock = run.then(()=>{},()=>{}); return run; },
  async close() {} };
const dbmod = await import(root + '/api/_lib/db.js');
dbmod.__setTestDriver(shim);

const handler = (await import(root + '/api/index.js')).default;

/* A Vercel-shaped request and response. New-style response: status()/send(). */
function fakeVercel(body, { method = 'GET', url = '/', headers = {} } = {}) {
  const out = { status: 200, headers: {}, body: null, sent: false };
  return [
    { method, url, headers, body },
    {
      status(c) { out.status = c; return this; },
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      send(b) { out.body = b; out.sent = true; },
      end() { out.sent = true; },
      _out: out,
    },
    out,
  ];
}

let pass = 0, fail = 0;
const safeJson = (buf) => {
  try {
    return JSON.parse(buf.toString());
  } catch {
    return null;
  }
};

const ok = (n, c, x = '') => {
  if (c) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}${x ? `  \x1b[90m${x}\x1b[0m` : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}${x ? `  \x1b[90m${x}\x1b[0m` : ''}`); }
};

/* 1. A GET with no body — the health check. */
{
  const [req, res, out] = fakeVercel(undefined, { url: '/api/health' });
  await handler(req, res);
  const json = JSON.parse(out.body.toString());
  ok('GET /api/health answers through the adapter', out.status === 200 && json.ok === true, 'status ' + out.status);
  ok('headers came through', out.headers['content-type'].includes('json'));
  ok('no cookie leak into health', !JSON.stringify(json).includes('adapter-test-pepper'));
}

/* 2. A POST with a body Vercel already parsed. This is the case that would
      silently break sign-in if the body were dropped. */
{
  const [req, res, out] = fakeVercel(
    { email: 'demo@shopyangu.co.ke' },
    { method: 'POST', url: '/api/auth/signin', headers: { 'content-type': 'application/json' } }
  );
  await handler(req, res);
  const json = JSON.parse(out.body.toString());
  ok('POST /api/auth/signin reads Vercel\'s parsed body', out.status === 200 && json.ok === true,
    'status ' + out.status + ' ' + (json.error || ''));
}

/* 3. A nested path, which is what a single-file function must not lose. */
{
  const [req, res, out] = fakeVercel(undefined, { url: '/api/sales?limit=5' });
  await handler(req, res);
  const json = JSON.parse(out.body.toString());
  ok('a nested route reaches the router', out.status === 401 || out.status === 200,
    'status ' + out.status + ' (' + (json.error || 'ok') + ')');
}

/* 4. A 404 from the router, not from the host. */
{
  const [req, res, out] = fakeVercel(undefined, { url: '/api/nope' });
  await handler(req, res);
  const json = JSON.parse(out.body.toString());
  ok('an unknown route is the API\'s own 404', out.status === 404 && json.ok === false, 'status ' + out.status);
}

/* 5. Every URL shape a rewrite can deliver must route identically. Which one
      arrives depends on the runtime, so all of them have to work or the site
      fails in production for reasons nobody can see locally.

      Nothing in this project does a rewrite locally: the only evidence is
      these cases plus the docs, which is why each one is checked. */
const shapes = [
  ['original path untouched', '/api/sales?limit=5'],
  ['destination with the path carried', '/api/index.js?__path=/api/sales&limit=5'],
  ['destination with no scheme of its own', '/api/index?__path=/api/sales'],
  ['query string preserved alongside it', '/api/index.js?__path=/api/sales&all=1'],
];

for (const [label, url] of shapes) {
  const [req, res, out] = fakeVercel(undefined, { url });
  await handler(req, res);
  const json = safeJson(out.body);
  /* /api/sales without a session is a 401 from the router, or a 200 for health.
     A 404 means the path never got there — the exact production failure this
     guards. */
  ok(`URL shape: ${label}`, out.status !== 404, `status ${out.status} ${json && json.error ? '· ' + json.error : ''}`);
}

/* A path that tries to escape must not be honoured. */
{
  const [req, res] = fakeVercel(undefined, { url: '/api/index.js?__path=/etc/passwd' });
  await handler(req, res);
  ok('a hostile __path is not followed', res._out.status === 404, `status ${res._out.status}`);
}

/* 5b. A deployment with a setting missing must still answer /api/health.

      This is the failure that is hardest to debug in real life: the function
      used to throw while being imported, so the host answered with its own
      error page, the health check was "unavailable", and the person had no way
      to find out which setting was wrong. The only acceptable behaviour is a
      200 that names it.

      The module is imported fresh with a cleared pepper, to get the state a
      cold start on a misconfigured deployment actually sees. */
{
  /* config.js snapshots the environment once, at import, so the way to simulate
     a deployment with the variable missing is to empty the value the server
     actually reads. It is a plain object; this is a documented property, not a
     private one. */
  const { env } = await import('../_lib/config.js');
  const saved = env.TOKEN_PEPPER;
  env.TOKEN_PEPPER = '';

  try {
    const fresh = await import('../server.js');
    const out = { status: 0, body: null, headers: {} };
    const res = {
      status(c) { out.status = c; return this; },
      writeHead(c) { out.status = c; return this; },
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      send(b) { out.body = b; },
      end(b) { if (b !== undefined) out.body = b; },
    };
    await fresh.handleRequest(
      { method: 'GET', url: '/api/health', headers: {}, on() {}, destroy() {}, socket: {} },
      res
    );
    const health = safeJson(out.body);
    ok('a missing setting does not crash the function', out.status === 200, `status ${out.status}`);
    ok('health names the missing setting', health && health.configured === false &&
      Array.isArray(health.missing) && health.missing.some((m) => m.name === 'TOKEN_PEPPER'),
      health && health.missing ? JSON.stringify(health.missing.map((m) => m.name)) : 'configured, so nothing named');

    /* And another route refuses with something a person can read. */
    const out2 = { status: 0, body: null, headers: {} };
    const res2 = {
      status(c) { out2.status = c; return this; },
      writeHead(c) { out2.status = c; return this; },
      setHeader(k, v) { out2.headers[k.toLowerCase()] = v; },
      send(b) { out2.body = b; },
      end(b) { if (b !== undefined) out2.body = b; },
    };
    /* A POST needs a body stream, or readJson() waits for one that never
       ends. Readable.from gives it the 'data' and 'end' events it listens for. */
    const { Readable } = await import('node:stream');
    const postReq = Readable.from([Buffer.from(JSON.stringify({ email: 'demo@shopyangu.co.ke' }))]);
    postReq.method = 'POST';
    postReq.url = '/api/auth/signin';
    postReq.headers = { 'content-type': 'application/json' };
    postReq.socket = {};
    await fresh.handleRequest(postReq, res2);
    const refused = safeJson(out2.body);
    ok('another route refuses with a readable 503', out2.status === 503 && /TOKEN_PEPPER/.test(refused && refused.error || ''),
      `status ${out2.status}`);
  } finally {
    env.TOKEN_PEPPER = saved;
  }
}

/* 6. The old-style response object (plain http.ServerResponse) must pass
      straight through untouched. */
{
  const { Readable } = await import('node:stream');
  const reqObj = Readable.from([]);
  reqObj.method = 'GET'; reqObj.url = '/api/health'; reqObj.headers = {};
  let code = 0, payload = '';
  const nodeRes = {
    writeHead(c) { code = c; return this; },
    setHeader() {},
    end(b) { payload = b || ''; },
  };
  await handler(reqObj, nodeRes);
  ok('a Node-style response works too', code === 200 && JSON.parse(payload).ok === true, 'status ' + code);
}

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}${pass} passed, ${fail} failed\x1b[0m`);
await pg.close();
process.exit(fail ? 1 : 0);
