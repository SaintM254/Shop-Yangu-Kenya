/* ============================================================ api/_lib/neon-auth.js

   The emailed sign-up code, sent by Neon Auth.

   Neon runs a Better Auth instance next to the database, and it will send and
   verify a six-digit code by email without this project owning an SMTP
   account. That is worth having: it is one less service to configure, and its
   own shared sender is fine while the platform is being tested.

   What it does NOT do is decide who belongs to which shop. That stays here —
   a `logins` row is the link between a person and a shop, and the security
   rules key off it. So the code proves a person can read that inbox, and this
   server decides what they are allowed into.

   Nothing in here throws: every caller falls back to the server's own code if
   Neon Auth is not configured or does not answer. A shop must never be unable
   to sign up because a third party was briefly unreachable.

   Configuration (all optional):
     NEON_AUTH_BASE_URL   https://<endpoint>.neon.tech/neondb/auth
     NEON_AUTH_COOKIE_SECRET   only needed for the SDK; not used here

   The endpoints are Better Auth's own, called directly with fetch rather than
   through @neondatabase/auth: the SDK is a large dependency for two POSTs, and
   it wants a cookie secret we would have no other use for.
*/

import crypto from 'node:crypto';
import { env } from './config.js';

const TIMEOUT_MS = 8000;

const base = () => String(env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '');

export const configured = () => Boolean(base());

/* --------------------------------------------------------------- the calls */

async function post(path, body) {
  const url = `${base()}${path}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: String(env.SITE_URL || '') },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });

    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: json.message || json.error || `Neon Auth answered ${res.status}.`,
      };
    }
    return { ok: true, data: json };
  } catch (err) {
    /* Network, DNS, timeout: all the same to a caller. */
    return { ok: false, status: 0, message: err.name === 'AbortError' ? 'Neon Auth timed out.' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/* A code for a new sign-up: Better Auth's "email-verification" type. Sending
   one creates the account there if it does not exist, which is what we want —
   this is the first email a shop ever gets, before it owns anything. */
export async function sendSignupCode(email, name) {
  if (!configured()) return { ok: false, skipped: 'NEON_AUTH_BASE_URL is not set' };

  const result = await post('/email-otp/send-verification-otp', {
    email,
    type: 'email-verification',
    name: name || undefined,
  });

  if (result.ok) return { ok: true, via: 'neon-auth' };

  /* "User already exists" is not a failure for our purposes: the code either
     went out or the address is already verified. Either way, fall back. */
  return { ok: false, status: result.status, message: result.message };
}

/* Check a code entered at /login/. Returns true only on a definite yes.
   Anything else — wrong code, expired code, service down — is a no, so the
   caller falls back to the code this server emailed. */
export async function verifySignupCode(email, code) {
  if (!configured()) return false;

  const result = await post('/email-otp/verify-email', {
    email,
    otp: String(code || '').trim(),
  });

  return result.ok;
}

/* A code that means "I want to sign in", for a shop that already exists and
   has a Neon Auth account. Not used yet — sign-in with a code still goes
   through this server so that the code is tied to a login row. Kept here so
   the two flows are documented in one place. */
export async function sendSigninCode(email) {
  if (!configured()) return { ok: false, skipped: 'NEON_AUTH_BASE_URL is not set' };
  const result = await post('/email-otp/send-verification-otp', { email, type: 'sign-in' });
  return result.ok ? { ok: true, via: 'neon-auth' } : result;
}

/* --------------------------------------------------------------- health */

/* Reports whether Neon Auth is likely to work, without sending anything. The
   health page shows this, so "why did no code arrive" has an answer. */
export function authHealth() {
  if (!configured()) {
    return {
      driver: 'none',
      ok: true,
      note: 'no Neon Auth; this server sends the codes itself',
    };
  }

  let host = '';
  try {
    host = new URL(base()).host;
  } catch {
    return { driver: 'neon-auth', ok: false, error: 'NEON_AUTH_BASE_URL is not a valid address' };
  }

  return { driver: 'neon-auth', ok: true, host };
}

/* A short fingerprint, for logs. Never the secret itself, and never long
   enough to be useful to anybody else. */
export const fingerprint = (value) =>
  value ? crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8) : '';
