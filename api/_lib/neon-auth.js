/* ============================================================ api/_lib/neon-auth.js

   Neon Auth — Managed Better Auth — through Neon's own SDK.

   Why the SDK and not fetch(): the first version of this file called the Better
   Auth endpoints directly with `fetch`. That looked right and was wrong in two
   ways that only show up against the real service:

   1. Better Auth refuses a POST whose Origin is not a trusted domain on the
      branch, with `403 Invalid origin`. A server-to-server call has no reason
      to send an Origin, and this one did. Every sign-in would have failed.

   2. The endpoints and the response envelopes are the SDK's business. They
      move between versions (this is pinned to @neon/auth 0.8.x, which pins
      Better Auth 1.7.x), and a hand-rolled client silently rots.

   So this file is a thin, deliberate wrapper: it creates a *fresh* SDK client
   per call, with its own cookie jar, because this shop runs its OWN sessions
   and must not let Neon's session cookie leak into, or steer, ours. Neon Auth
   is only ever asked two kinds of question:

     · "email this person a code"            → sendSignupCode / sendSigninCode
     · "is this code right for this person?" → verifySignupCode / verifySigninCode

   What it does NOT do is decide who belongs to which shop. That stays here: a
   `logins` row is the link between a person and a shop, and the eleven RLS
   rules key off it. So a Neon code proves a person can read that inbox, and
   this server decides what they are allowed into.

   Nothing in here throws. Every caller falls back to this server's own code and
   mailer if Neon Auth is not configured or does not answer, so a shop can never
   be unable to sign up because a third party was briefly unreachable.

   Configuration (all optional):
     NEON_AUTH_BASE_URL        https://<endpoint>.neon.tech/neondb/auth
     NEON_AUTH_COOKIE_SECRET   32+ chars. Only used to sign the SDK's own
                               cookie cache; generate with `openssl rand -base64 32`.
                               If unset, a value derived from TOKEN_PEPPER is used,
                               which is already a secret this deployment has.
*/

import crypto from 'node:crypto';
import { env } from './config.js';

const TIMEOUT_MS = 8000;

/* The SDK's config validation refuses anything shorter than 32 characters. */
const MIN_SECRET = 32;

const base = () => String(env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '');

export const configured = () => Boolean(base());

/* A cookie secret the SDK will accept. NEON_AUTH_COOKIE_SECRET is the documented
   variable; TOKEN_PEPPER is already a per-deployment secret that never leaves
   the server, so deriving from it means nothing extra to configure and nothing
   weaker. Deriving (rather than reusing) keeps the two uses independent. */
function cookieSecret() {
  const explicit = String(env.NEON_AUTH_COOKIE_SECRET || '');
  if (explicit.length >= MIN_SECRET) return explicit;

  const pepper = String(env.TOKEN_PEPPER || '');
  if (!pepper) {
    /* Without either, the SDK cannot be constructed. Callers treat this as
       "Neon Auth not usable" and fall back, which is the safe direction. */
    return '';
  }
  return crypto.createHash('sha256').update('neon-auth-cookie:' + pepper).digest('base64');
}

/* --------------------------------------------------------------- the client

   Built per call on purpose.

   `createAuthServer` caches session data in a cookie it signs. For our use —
   two questions, each about one person, each answered in isolation — sharing a
   jar across requests would let one shop's verification state influence
   another's. A fresh client with an empty jar makes every call independent and
   leaves no session behind in this process at all. */
async function client({ origin } = {}) {
  if (!configured()) return null;
  const secret = cookieSecret();
  if (!secret) return null;

  let createAuthServer;
  try {
    ({ createAuthServer } = await import('@neon/auth/server'));
  } catch (err) {
    /* A deployment that trimmed dependencies, or a failed install. Degrade to
       "no Neon Auth" rather than failing sign-up. */
    console.error('[neon-auth] SDK not available:', err.message);
    return null;
  }

  const jar = new Map();

  try {
    return createAuthServer({
      baseUrl: base(),
      cookieSecret: secret,
      context: () => ({
        getCookies: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
        setCookie: (name, value) => {
          if (value === '' || value == null) jar.delete(name);
          else jar.set(name, value);
        },
        getHeader: () => null,
        /* This is the origin Better Auth checks. It must be the branch's
           trusted domain, which is the site's own address — so it is SITE_URL
           and not a made-up value. Getting this wrong is the `403 Invalid
           origin` above. */
        getOrigin: () => String(env.SITE_URL || origin || ''),
        getFramework: () => 'node',
      }),
    });
  } catch (err) {
    console.error('[neon-auth] could not create the client:', err.message);
    return null;
  }
}

/* One place where an SDK failure becomes a plain `{ ok: false }`.

   The SDK returns `{ data, error }` for most calls but throws on network
   failures, so both shapes have to be handled here — once, rather than at each
   call site. */
async function attempt(fn) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const result = await fn();
    const error = result && result.error;
    if (error) {
      return {
        ok: false,
        /* The HTTP status is kept as well as the code: 401 and 403 mean
           completely different things to a caller, and one of them is a setting
           while the other is a missing account. */
        status: Number(error.status) || 0,
        code: error.code || error.status,
        error: readable(error),
      };
    }
    return { ok: true, data: (result && result.data) || null };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || /abort/i.test(err.message || ''));
    return {
      ok: false,
      code: aborted ? 'TIMEOUT' : 'NETWORK',
      error: aborted
        ? 'Neon Auth did not answer in time.'
        : String(err.message || 'Neon Auth could not be reached.'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/* Better Auth answers with `{ message, code }`. The message is shown to a
   shopkeeper, so a raw stack or a JSON blob never gets through. */
function readable(error) {
  const message = String((error && (error.message || error.statusText)) || 'Neon Auth refused that.');
  if (/invalid (email or )?password/i.test(message)) return 'That email and password do not match.';
  if (/invalid otp|invalid code/i.test(message)) return 'That code is not right. Check the newest email.';
  if (/invalid origin/i.test(message)) {
    return 'Neon Auth does not trust this site address yet. Add it as a trusted domain in Neon.';
  }
  if (/user not found/i.test(message)) return 'That email is not registered with Neon Auth.';
  return message.slice(0, 200);
}

/* ------------------------------------------------------- what the shop asks */

/* "Email this person a code they can use to prove the address is theirs."

   WHICH TYPE, AND WHY IT MATTERS.

   Better Auth has two kinds of emailed code, and they are not interchangeable:

     type: 'email-verification'  confirms an address while creating an account
     type: 'sign-in'             signs in somebody who already has an account

   An address that is ALREADY VERIFIED is not sent a sign-up verification code.
   That is documented behaviour, and it is the exact symptom of "the app is not
   requesting the OTP": the request succeeds, nothing is sent, and the API
   answers {"success": true}.

   It happens routinely, because turning on "Verify at Sign-up" in the Neon
   console means signUp.email() itself marks the user verified. So by the time
   we ask, there is nothing left to verify.

   `verified` therefore decides the type. The caller gets it from
   signUpWithPassword(). Pass the wrong one and no email arrives. */
export async function sendSignupCode(email, name, { verified = false } = {}) {
  const auth = await client();
  if (!auth) return { ok: false, code: 'NOT_CONFIGURED', error: 'Neon Auth is not configured.' };

  const type = verified ? 'sign-in' : 'email-verification';

  const result = await attempt(() =>
    auth.emailOtp.sendVerificationOtp({
      email: String(email || '').trim().toLowerCase(),
      type,
      /* Better Auth's sendVerificationOTP hook receives `name` on some versions
         and not others; passing it is harmless and lets Neon personalise the
         email when it does. */
      name: name || undefined,
    })
  );

  return { ...result, type };
}

/* "Is this the code we sent when they signed up?"

   Tries BOTH kinds, because the type is not known here — it is decided by the
   branch's settings, not by this shop. Verified against a real Better Auth
   server:

     /email-otp/verify-email  accepts an 'email-verification' code
                              REJECTS a 'sign-in' code with 400 Invalid OTP
     /sign-in/email-otp       accepts a 'sign-in' code

   So one endpoint is not enough. Trying verification first keeps the strict
   guarantee for a fresh sign-up: the address really was proved. Falling through
   to the sign-in check covers the already-verified case, where Neon sends a
   sign-in code instead.

   Neither call can throw; a wrong code is `false`, not an exception. */
export async function verifySignupCode(email, code) {
  const auth = await client();
  if (!auth || !code) return false;

  const clean = String(email || '').trim().toLowerCase();
  const otp = String(code || '').trim();

  const asVerification = await attempt(() => auth.emailOtp.verifyEmail({ email: clean, otp }));
  if (asVerification.ok) return true;

  const asSignIn = await attempt(() => auth.signIn.emailOtp({ email: clean, otp }));

  /* A sign-in code that is accepted also means the inbox was reachable, which is
     the whole point of the first code. */
  return asSignIn.ok === true;
}

/* "Email a sign-in code." Used for the way back in when a password is lost. */
export async function sendSigninCode(email) {
  const auth = await client();
  if (!auth) return { ok: false, code: 'NOT_CONFIGURED', error: 'Neon Auth is not configured.' };

  return attempt(() =>
    auth.emailOtp.sendVerificationOtp({
      email: String(email || '').trim().toLowerCase(),
      type: 'sign-in',
    })
  );
}

/* "Is this the sign-in code?" Returns the Neon user when it is, or null.

   Kept for completeness: the shop's own `login_codes` remain the source of
   truth for day-to-day code sign-in, because that code is tied to a login row
   and therefore to a shop. This is here so a deployment that turns on Neon's
   sign-in OTP is not left without a way to check it. */
export async function verifySigninCode(email, code) {
  const auth = await client();
  if (!auth || !code) return null;

  const result = await attempt(() =>
    auth.signIn.emailOtp({
      email: String(email || '').trim().toLowerCase(),
      otp: String(code || '').trim(),
    })
  );
  return result.ok ? result.data : null;
}

/* ------------------------------------------------- email and password

   Neon's Auth SDK also does plain email-and-password sign-up, which is what
   this shop uses it for as well as the code. This is the documented set:
   `signUp.email`, `signIn.email`, `getSession`.

   THE TRAP, found by running it: Better Auth's `send-verification-otp` answers
   `{"success": true}` for an address that has no user yet, and sends NOTHING.
   So "ask Neon for a code, then create the person" fails silently — the page
   says a code is on its way and no email ever arrives. The user must exist at
   Neon before the code is requested, which is why signUpWithPassword is called
   first in the sign-up route.

   A fresh client per call, for the same cookie-isolation reason as above. */

/* Create the person at Neon. Returns { ok, existed } — `existed` when the
   address is already registered there, which is not an error for us. */
export async function signUpWithPassword({ email, password, name }) {
  const auth = await client();
  if (!auth) return { ok: false, code: 'NOT_CONFIGURED' };

  const clean = String(email || '').trim().toLowerCase();
  const result = await attempt(() =>
    auth.signUp.email({ email: clean, password: String(password), name: String(name || clean) })
  );
  if (result.ok) {
    const user = result.data?.user || null;
    return {
      ok: true,
      existed: false,
      user,
      /* THE FACT THAT DECIDES WHICH CODE TO SEND.

         With "Verify at Sign-up" ON, Neon marks the user verified as part of
         this call, and may email a code of its own. An already-verified user
         never gets a sign-up verification code — that is documented Better Auth
         behaviour, not a fault. So the type of code we ask for depends on this
         flag, and asking for the wrong one is exactly how "the app is not
         requesting the OTP" happens. */
      emailVerified: Boolean(user?.emailVerified),
    };
  }

  const alreadyThere = /already|exists|registered/i.test(result.error || '');
  return {
    ok: false,
    existed: alreadyThere,
    error: result.error,
    code: result.code,
    /* An address that already exists at Neon has usually verified its inbox
       already, by definition of having used it before. */
    emailVerified: alreadyThere,
  };
}

/* "Is this the right password?" True only on a real yes.

   `unreachable` distinguishes "Neon said no" from "Neon did not answer", which
   is the difference between refusing a person and falling back to the local
   hash. Conflating the two either locks a shop out during an outage or accepts
   a wrong password during one. */
export async function checkPassword(email, password) {
  const auth = await client();
  if (!auth) return { ok: false, unreachable: true, code: 'NOT_CONFIGURED' };

  const result = await attempt(() =>
    auth.signIn.email({
      email: String(email || '').trim().toLowerCase(),
      password: String(password),
    })
  );

  if (result.ok) return { ok: true, unreachable: false, user: result.data?.user || null };

  const offline = result.code === 'NETWORK' || result.code === 'TIMEOUT';
  return {
    ok: false,
    unreachable: offline,
    /* A 5xx from Neon is its problem, not a wrong password. */
    serverFault: /^5\d\d$/.test(String(result.code || '')),
    error: result.error,
    code: result.code,
  };
}

/* Who is this? The "read the current user back" half of the proof.

   Uses a shared jar for one round trip: sign in, then getSession with the same
   client, because a session only exists inside the client that made it. */
export async function readUserAfterPasswordCheck({ email, password }) {
  const auth = await client();
  if (!auth) return { ok: false, code: 'NOT_CONFIGURED' };

  const signedIn = await attempt(() =>
    auth.signIn.email({ email: String(email || '').trim().toLowerCase(), password: String(password) })
  );
  if (!signedIn.ok) return { ok: false, error: signedIn.error, code: signedIn.code };

  const session = await attempt(() => auth.getSession());
  if (!session.ok) return { ok: false, error: session.error, code: session.code };

  const user = session.data?.user || signedIn.data?.user || null;
  return { ok: true, user: user ? { id: user.id, email: user.email, name: user.name } : null };
}

/* Change the password at Neon, keeping our hash and Neon's in step.

   Better Auth's Managed client exposes `changePassword`, so this is not a
   limitation to document around: it is a call. The client is fresh, so it has
   to sign in with the current password first — `changePassword` acts on the
   session the SDK is holding, not on an email address. */
export async function changePassword(email, currentPassword, newPassword) {
  const auth = await client();
  if (!auth) return { ok: false, code: 'NOT_CONFIGURED' };

  const clean = String(email || '').trim().toLowerCase();

  const signedIn = await attempt(() =>
    auth.signIn.email({ email: clean, password: String(currentPassword) })
  );
  if (!signedIn.ok) {
    return { ok: false, unreachable: signedIn.code === 'NETWORK' || signedIn.code === 'TIMEOUT', error: signedIn.error };
  }

  const changed = await attempt(() =>
    auth.changePassword({
      currentPassword: String(currentPassword),
      newPassword: String(newPassword),
    })
  );
  if (!changed.ok) {
    return { ok: false, unreachable: changed.code === 'NETWORK' || changed.code === 'TIMEOUT', error: changed.error };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ probing
                            (for /api/auth/doctor only)

   Two questions the health check cannot answer, because answering them means
   talking to Neon about a particular address. Neither sends an email. Neither
   returns a code, a token, or a secret. */

/* "Are you there?" — the cheapest authenticated request, so a wrong URL, a
   blocked origin, or a dead endpoint shows up as a sentence instead of an
   absence of email. */
export async function ping() {
  if (!configured()) return { ok: false, code: 'NOT_CONFIGURED', error: 'Neon Auth is not configured.' };

  const started = Date.now();
  const result = await attempt(() => authClient().getSession(), { timeoutMs: 12000 });

  if (result.ok) return { ok: true, ms: Date.now() - started };

  /* 403 with an origin complaint is the one error worth naming differently: it
     is a setting, and the fix is specific. */
  if (/origin/i.test(result.error || '') || result.status === 403) {
    return {
      ok: false,
      code: 'ORIGIN',
      error: `Neon rejected the origin ${env.SITE_URL || '(empty)'}. ${result.error}`,
    };
  }

  return { ok: false, code: result.code || 'ERROR', error: result.error };
}

/* "Does this address have an account, and does Neon consider it verified?"

   WHY THIS IS THE IMPORTANT ONE. The kind of code this shop asks for depends on
   `emailVerified`, and asking for the wrong kind sends nothing at all. Better
   Auth has no endpoint that answers this for a third party without signing in,
   so the answer comes from the sign-up attempt itself:

     · creating the account succeeds  → no account existed → not verified
     · it is refused as already registered → an account exists → almost always
       verified, because it has been used before

   A wrong password is supplied deliberately, so this can never sign anybody in
   even if the address turns out to exist. */
export async function whichCode(email) {
  if (!configured()) return { ok: false, code: 'NOT_CONFIGURED', error: 'Neon Auth is not configured.' };

  const address = String(email || '').trim().toLowerCase();
  const result = await attempt(() =>
    authClient().signIn.email({
      email: address,
      /* Not a secret and not an account: a value no person would choose, so it
         cannot match, and a 401 here is a successful probe. */
      password: 'not-a-real-password-4f7c2b91e8',
    })
  );

  /* A wrong password on a real account is 401 too, so neither 401 nor a refusal
     tells us whether the address exists. That is fine: the ONLY thing this shop
     needs is which kind of code to ask for, and "ask for a sign-in code" is
     accepted for both verified and unverified addresses. Better Auth never
     refuses to send a sign-in code.
     So the answer is always the safe one, and this function reports why. */
  if (result.ok) {
    return {
      ok: true,
      exists: true,
      verified: Boolean(result.data?.user?.emailVerified),
      note: 'signed in — the branch must have "require email verification" off',
    };
  }

  if (/origin/i.test(result.error || '') || result.status === 403) {
    return { ok: false, code: 'ORIGIN', error: `Neon rejected the origin ${env.SITE_URL || '(empty)'}.` };
  }

  if (result.status === 401) {
    return {
      ok: true,
      exists: null,
      verified: null,
      note: 'Neon would not say whether this address exists, and that is not needed.',
    };
  }

  return { ok: false, code: result.code || 'ERROR', error: result.error };
}

/* --------------------------------------------------------------- health

   Reports whether Neon Auth is likely to work, WITHOUT sending anything or
   asking about anybody. /api/health shows this, so "why did no code arrive" has
   an answer instead of a shrug. */
export function authHealth() {
  if (!configured()) {
    return {
      driver: 'none',
      ok: true,
      note: 'no Neon Auth; this server sends the codes itself',
    };
  }

  if (!cookieSecret()) {
    return {
      driver: 'neon-auth',
      ok: false,
      error: 'Neon Auth is configured but neither NEON_AUTH_COOKIE_SECRET nor TOKEN_PEPPER is set.',
    };
  }

  let host = '';
  try {
    const url = new URL(base());
    host = url.host;
    if (!/\/auth\/?$/.test(url.pathname)) {
      return {
        driver: 'neon-auth',
        ok: false,
        host,
        error: 'NEON_AUTH_BASE_URL should end in /neondb/auth — copy it from the Neon console.',
      };
    }
  } catch {
    return { driver: 'neon-auth', ok: false, error: 'NEON_AUTH_BASE_URL is not a valid address.' };
  }

  return {
    driver: 'neon-auth',
    ok: true,
    host,
    /* Named explicitly because it is the single most common cause of
       `403 Invalid origin`, and it is a setting, not a bug. */
    trustedOrigin: String(env.SITE_URL || ''),
  };
}

/* For logs and the health page: the host only, never the URL with its path,
   and never a key. */
export function fingerprint() {
  if (!configured()) return 'none';
  try {
    return new URL(base()).host.slice(0, 60);
  } catch {
    return 'invalid';
  }
}
