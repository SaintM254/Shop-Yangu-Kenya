/* ============================================================ api/_lib/config.js

   Every setting comes from the environment, and nothing here has a default
   that would silently do the wrong thing in production.

   Copy api/.env.example to api/.env and fill it in. See docs/01-neon.md
   for where each value comes from.
*/

import fs from 'node:fs';
import path from 'node:path';

/* A tiny .env reader. Node 20.6+ has --env-file, but this keeps `node
   server.js` working with no flags and no dependency. */
function loadDotEnv() {
  const file = path.join(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

const raw = process.env;

function required(name) {
  const v = raw[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Copy api/.env.example to api/.env and fill it in — ` +
        'docs/01-neon.md walks through every value.'
    );
  }
  return v;
}

/* "true"/"1"/"yes" → true, anything else false. Written out because
   Boolean("false") is true, and that bug signs in the wrong people. */
const bool = (v, fallback = false) =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(v));

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

/* Vercel sets VERCEL=1 in every function it runs. Nothing else needs to know
   that, but three settings below differ there: there is no site to serve from
   the API, nothing is listening on a port, and the site's own address is the
   deployment's address. Detecting it here means the person deploying has three
   fewer things to type correctly. */
const onVercel = !!process.env.VERCEL;

/* Vercel's own address for this deployment, without a trailing slash:
   https://shop-yangu-kenya.vercel.app on a preview, the real domain on
   production. VERCEL_URL has no scheme on it, hence the https://. */
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
  : process.env.VERCEL_URL
    ? 'https://' + process.env.VERCEL_URL
    : '';

export const env = {
  NODE_ENV: raw.NODE_ENV || (onVercel ? 'production' : 'development'),
  PORT: Number(raw.PORT || 8787),
  HOST: raw.HOST || '0.0.0.0',

  /* postgres | pglite. pglite is for tests and a laptop with no Neon. */
  DATABASE_DRIVER: raw.DATABASE_DRIVER || (raw.DATABASE_URL ? 'postgres' : 'pglite'),
  DATABASE_URL: raw.DATABASE_URL || '',
  PGLITE_DIR: raw.PGLITE_DIR || '',
  DB_POOL_MAX: raw.DB_POOL_MAX || '5',

  /* Where the built site lives. The API serves it too in development, so the
     app and the API share one origin and the session cookie is plain. */
  WEB_ROOT: raw.WEB_ROOT || 'dist',
  /* Vercel serves the built site itself, so the function must not try to. */
  SERVE_SITE: bool(raw.SERVE_SITE, !onVercel),

  /* Where the site is published. Used for the links in emails, and for CORS
     in the one setup where the API is on a different host. */
  SITE_URL: raw.SITE_URL || vercelUrl || 'http://localhost:8787',
  /* On Vercel the API is on the same address as the site, so links and M-Pesa
     callbacks are built from SITE_URL and this stays empty. */
  API_URL: raw.API_URL || vercelUrl || '',
  COOKIE_DOMAIN: raw.COOKIE_DOMAIN || '',
  /* Only needed when the API is on another origin from the site. */
  CORS_ORIGINS: list(raw.CORS_ORIGINS),

  SESSION_COOKIE: raw.SESSION_COOKIE || 'syk_session',
  SESSION_DAYS: Number(raw.SESSION_DAYS || 30),

  /* Code/link lifetimes. Six digits and 30 minutes is the pair the spec asks
     for: a code for a phone, a link for a laptop. */
  OTP_MINUTES: Number(raw.OTP_MINUTES || 10),
  OTP_ATTEMPTS: Number(raw.OTP_ATTEMPTS || 5),
  LINK_MINUTES: Number(raw.LINK_MINUTES || 30),
  SIGNUP_MINUTES: Number(raw.SIGNUP_MINUTES || 60),
  /* How many codes one address may ask for in a window. Five in fifteen
     minutes is right for a shop; a test harness raises it. */
  OTP_WINDOW_MINUTES: Number(raw.OTP_WINDOW_MINUTES || 15),
  OTP_MAX_PER_WINDOW: Number(raw.OTP_MAX_PER_WINDOW || 5),

  /* Email. smtp sends; console writes the code to the server log, which is
     what you want in development and in tests. */
  EMAIL_DRIVER: raw.EMAIL_DRIVER || 'console',
  MAIL_FROM: raw.MAIL_FROM || 'Shop Yangu Kenya <no-reply@shopyangu.co.ke>',
  SMTP_HOST: raw.SMTP_HOST || '',
  SMTP_PORT: Number(raw.SMTP_PORT || 587),
  SMTP_SECURE: bool(raw.SMTP_SECURE, false),
  SMTP_USER: raw.SMTP_USER || '',
  SMTP_PASS: raw.SMTP_PASS || '',

  /* M-Pesa. The credentials themselves live per shop in mpesa_tills; this is
     only the base URL and the switch between sandbox and production. */
  MPESA_ENV: raw.MPESA_ENV || 'sandbox',
  MPESA_BASE_URL: raw.MPESA_BASE_URL || '',
  /* The callback must be public HTTPS. Its path must not contain "mpesa",
     "m-pesa" or "safaricom" — Safaricom rejects those. Hence /pay/<secret>. */
  MPESA_CALLBACK_BASE: raw.MPESA_CALLBACK_BASE || vercelUrl || '',
  MPESA_TIMEOUT_SECONDS: Number(raw.MPESA_TIMEOUT_SECONDS || 60),

  /* Set to a real value in production. Used to sign nothing (JWTs are not
     used) but to derive the hash key for session tokens.

     Only the server needs this: it is what makes a session token unforgeable.
     The setup scripts (db-migrate, db-seed, make-super-admin) never touch a
     token, and making them demand it would be a password prompt with no
     purpose — so they are allowed to import this module without one. If a
     token is ever minted without a pepper, signToken() refuses. */
  TOKEN_PEPPER: raw.TOKEN_PEPPER || '',
};

/* The server will not start without a pepper. Imported by server.js and by
   api/index.js, so a deploy with the variable missing fails loudly at cold
   start rather than signing tokens with an empty key. */
export function requirePepper() {
  if (!env.TOKEN_PEPPER) {
    throw new Error(
      'Missing TOKEN_PEPPER. Copy api/.env.example to api/.env and fill it in — ' +
        'docs/01-neon.md walks through every value.'
    );
  }
  return env.TOKEN_PEPPER;
}

export const isProd = env.NODE_ENV === 'production';
