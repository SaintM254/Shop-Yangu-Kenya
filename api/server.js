/* ============================================================ api/server.js

   The whole server. Node's own http module, a router, and the files in
   ./routes. No framework, because everything Express would give us here is
   thirty lines and this way there is nothing between the request and the
   database that we did not write.

   In development it also serves the built site, so the app and the API share
   one origin and the session cookie is a plain first-party cookie. In
   production on Vercel it does not serve the site: Vercel serves dist/ itself
   and sends only /api and /pay here, which keeps them on the same origin —
   see docs/03-vercel.md and api/index.js.

   Run it:
     cd api && npm install && node server.js
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { env, isProd } from './_lib/config.js';
import * as db from './_lib/db.js';
import {
  HttpError, Router, readJson, send, parseCookies, clientIp,
  notFound, unauthorized,
} from './_lib/http.js';
import { currentSession } from './_lib/auth.js';
import { mailHealth, devInbox } from './_lib/mail.js';

import authRoutes from './_routes/auth.js';
import shopRoutes from './_routes/shop.js';
import mpesaRoutes from './_routes/mpesa.js';
import adminRoutes from './_routes/admin.js';
import bootstrapRoutes from './_routes/bootstrap.js';

/* ------------------------------------------------------------------ router */

const router = new Router();

/* Anything a route wants to add to the response headers. Set by the handler
   and read after it returns — a cookie, mostly. */
const RESPONSE_HEADERS = Symbol('headers');

bootstrapRoutes(router);
authRoutes(router);
shopRoutes(router);
mpesaRoutes(router);
adminRoutes(router);

/* --------------------------------------------------------------- health */

router.get('/api/health', async () => {
  let database;
  try {
    database = await db.health();
    database.ok = true;
  } catch (err) {
    database = { ok: false, error: err.message };
  }

  return {
    ok: database.ok,
    version: 1,
    env: env.NODE_ENV,
    database,
    mail: await mailHealth(),
    /* Never echo secrets. The presence of a setting is enough to debug a
       deployment. */
    mpesa: {
      environment: env.MPESA_ENV,
      callbackConfigured: Boolean(env.MPESA_CALLBACK_BASE || env.API_URL),
    },
    at: new Date().toISOString(),
  };
});

/* ------------------------------------------------------------------ dev inbox

   With EMAIL_DRIVER=console there is no inbox to open, so a code would only be
   readable by watching the server log. This route hands back the last few
   messages instead. It is registered ONLY outside production, and it never
   exists when a real mail server is configured — there is nothing to read. */

if (!isProd && env.EMAIL_DRIVER === 'console') {
  router.get('/api/dev/inbox', async () => ({
    driver: 'console',
    messages: devInbox.map((m) => ({ to: m.to, subject: m.subject, text: m.text, at: m.at })),
  }));
}

/* ------------------------------------------------------------------ CORS */

/* Only needed when the site is on GitHub Pages and the API somewhere else.
   In development the API serves the site, so the origin is the same and none
   of this runs. */
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (!env.CORS_ORIGINS.includes(origin)) return false;

  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('vary', 'origin');
  /* A cross-site cookie needs SameSite=None; Secure. On localhost over http
     that combination is rejected by the browser, which is why development
     does not use CORS at all. */
  return true;
}

/* ------------------------------------------------------------- static site */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  if (!env.SERVE_SITE) return false;

  const root = path.resolve(process.cwd(), env.WEB_ROOT);
  if (!fs.existsSync(root)) return false;

  /* Decode, then refuse anything that climbs out of the root. */
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel.includes('\0')) return false;
  const target = path.resolve(root, '.' + rel);
  if (target !== root && !target.startsWith(root + path.sep)) return false;

  let file = target;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;

  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    /* Pages are rebuilt on deploy, so a short cache is right; the app's own
       assets carry a query string when they change. */
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

/* ----------------------------------------------------------------- server */

/* The request handler, written against Node's own request and response.

   It is separate from `http.createServer` below so that a host which supplies
   its own request and response — Vercel, on the deployed site — can call it
   directly. Everything below this line works the same in both places. */
async function handleRequest(req, res) {
  const started = Date.now();
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  /* Request ids make a log line and a bug report the same conversation. */
  const rid = Math.random().toString(36).slice(2, 8);
  res.setHeader('x-request-id', rid);

  const crossOrigin = cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(crossOrigin ? 204 : 404).end();
    return;
  }

  try {
    const { route, params } = router.match(req.method, pathname);

    if (!route) {
      /* Not an API route. In development, hand it to the built site. */
      if (env.SERVE_SITE && (req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, pathname)) {
        return;
      }
      throw notFound('No such endpoint.');
    }

    const cookies = parseCookies(req.headers.cookie);
    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readJson(req);

    const ctx = {
      req,
      res,
      params,
      body,
      query: parsed.query || {},
      cookies,
      ip: clientIp(req),
      session: null,
    };
    ctx.session = await currentSession(req, cookies);

    const out = await route.handler(ctx);

    /* A handler may return [body, headers] when it has to set a cookie. */
    if (Array.isArray(out)) {
      const [payload, headers = {}, status = 200] = out;
      send(res, status, payload, headers);
    } else if (out && typeof out === 'object' && 'body' in out && 'headers' in out) {
      send(res, out.status || 200, out.body, out.headers);
    } else {
      send(res, 200, out);
    }

    log(res.statusCode, req.method, pathname, started, rid);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;

    if (status >= 500) {
      console.error(`[${rid}] ${req.method} ${pathname} →`, err);
    }
    log(status, req.method, pathname, started, rid);

    /* An expired or revoked session gets a 401 and a cleared cookie, so the
       browser stops sending a token that can never work again. */
    const headers = status === 401 ? { 'set-cookie': 'syk_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' } : {};
    send(res, status, {
      ok: false,
      error: err instanceof HttpError ? err.message : 'Something went wrong on our side.',
      requestId: rid,
      ...(isProd ? {} : { detail: err.message }),
    }, headers);
  }
}

const server = http.createServer(handleRequest);

function log(status, method, pathname, started, rid) {
  const ms = Date.now() - started;
  /* Callbacks and health checks are noise on every deploy log. */
  const quiet = pathname.startsWith('/pay/') || pathname === '/api/health';
  if (quiet && status < 400) return;
  const flag = status >= 500 ? '!!' : status >= 400 ? ' !' : '  ';
  console.log(`${flag} ${status} ${method.padEnd(6)} ${pathname} ${ms}ms  [${rid}]`);
}

/* ---------------------------------------------------------------- start */

const PORT = env.PORT;
const HOST = env.HOST; /* 0.0.0.0 so the preview proxy can reach it */

/* On Vercel there is no port to listen on: the file in api/ is called once per
   request instead. The host sets VERCEL=1, so the server does not try. */
if (!process.env.VERCEL) server.listen(PORT, HOST, async () => {
  console.log('');
  console.log('  Shop Yangu API');
  console.log(`  ${env.NODE_ENV} on http://${HOST}:${PORT}`);
  console.log(`  driver: ${env.DATABASE_DRIVER}${env.SERVE_SITE ? ` · serving ${env.WEB_ROOT}` : ''}`);
  console.log(`  mail:   ${env.EMAIL_DRIVER}`);
  try {
    const h = await db.health();
    console.log(`  db:     ${h.database} at ${new Date(h.at).toISOString()}`);
  } catch (err) {
    console.log(`  db:     NOT REACHABLE — ${err.message}`);
  }
  console.log('');
});

/* A deploy sends SIGTERM. Finish the requests in flight, then close the pool:
   a hard exit mid-transaction is how a sale gets half-written. */
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n  ${signal}: closing`);
  server.close(async () => {
    await db.shutdown().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('unhandled rejection:', err);
});

export { server, router, handleRequest };
