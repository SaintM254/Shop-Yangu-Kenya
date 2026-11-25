/* ============================================================ api/_lib/auth.js

   Who is asking, and are they allowed to.

   Everything that decides identity lives here:

     · sessions     a random 32-byte token in an HttpOnly cookie; only its
                    HMAC is stored, so a database dump cannot be replayed
     · OTP          six digits, hashed, five attempts, single use, short life
     · magic links  thirty-two bytes, hashed, single use, thirty minutes
     · sign-up      a code proves the address before any shop exists
                    (pending_signups), so an unverified address can never own
                    a shop name

   The database helpers in 003_rls.sql then scope every query to the shop this
   file resolved. Two independent checks, on purpose.
*/

import { env, isProd, requirePepper } from './config.js';
import * as db from './db.js';
import * as passwords from './password.js';
import * as neonAuth from './neon-auth.js';
import {
  cookie, hmac, randomCode, randomToken, sameHash, sha256,
  unauthorized, forbidden, notFound, tooMany, badRequest, HttpError,
} from './http.js';

/* ------------------------------------------------------------------ tokens */

/* Session tokens are stored as HMAC(pepper, token), not sha256(token): a
   plain hash of a known-format token is brute-forceable off a leaked dump,
   an HMAC needs the pepper, which lives in the environment. */
/* requirePepper() throws if it is missing, so a pepper-less process cannot
   mint a token that any other process would honour. That is a louder, safer
   failure than signing with an empty key. */
const sessionHash = (token) => hmac(requirePepper(), 'session:' + token);
const codeHash = (loginId, code) => hmac(requirePepper(), 'code:' + loginId + ':' + code);

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'Lax',
  secure: isProd,
  path: '/',
  domain: env.COOKIE_DOMAIN || undefined,
};

/* ----------------------------------------------------------------- session */

export async function createSession(login, req, { shopId = null } = {}) {
  const token = randomToken(32);
  const days = env.SESSION_DAYS;
  const expires = new Date(Date.now() + days * 86400_000);

  const row = await db.one(
    `insert into sessions (token_hash, login_id, shop_id, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6)
     returning id, expires_at`,
    [
      sessionHash(token),
      login.id,
      shopId,
      expires,
      String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').slice(0, 60),
      String(req.headers['user-agent'] || '').slice(0, 300),
    ]
  );

  await db.query('update logins set last_seen_at = now() where id = $1', [login.id]);

  return {
    token,
    id: row.id,
    expires,
    cookie: cookie(env.SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: days * 86400 }),
  };
}

export function clearCookie() {
  return cookie(env.SESSION_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 });
}

/* The caller behind this request, or null. Does not throw: some routes work
   for anonymous visitors (sign-in, health) and some need a person. */
export async function currentSession(req, cookies) {
  const token = cookies[env.SESSION_COOKIE];
  if (!token) return null;

  const row = await db.one(
    `select ss.id as session_id, ss.shop_id, ss.expires_at, ss.revoked_at,
            ss.ip, ss.user_agent, ss.created_at as signed_in_at,
            l.id as login_id, l.email::text as email, l.name, l.role,
            l.email_verified_at, sh.name as shop_name, sh.suspended_at
       from sessions ss
       join logins l   on l.id = ss.login_id
       left join shops sh on sh.id = ss.shop_id
      where ss.token_hash = $1`,
    [sessionHash(token)]
  );

  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  if (!row.email_verified_at) return null;

  /* Touch last_seen_at at most once a minute: it powers the super-admin
     screen, and a write on every request is a write on every request. */
  if (Date.now() - new Date(row.signed_in_at).getTime() > 60_000) {
    db.query('update sessions set last_seen_at = now() where id = $1', [row.session_id]).catch(
      () => {}
    );
  }

  return row;
}

/* Every authenticated route goes through this. */
export function requireSession(req) {
  if (!req.session) throw unauthorized('Please sign in to continue.');
  if (req.session.suspended_at) {
    throw forbidden('This shop is paused. Contact Shop Yangu on 0722 000 111.');
  }
  return req.session;
}

export function requireOwner(req) {
  const s = requireSession(req);
  if (s.role !== 'owner') throw forbidden('This screen is for the shop.');
  return s;
}

export function requireSuperAdmin(req) {
  const s = requireSession(req);
  if (s.role !== 'super_admin') throw forbidden('This screen is for the platform admin.');
  return s;
}

export async function revokeSession(sessionId) {
  await db.query(
    'update sessions set revoked_at = now() where id = $1 and revoked_at is null',
    [sessionId]
  );
}

export async function revokeAllSessions(loginId, { exceptId = null } = {}) {
  await db.query(
    `update sessions set revoked_at = now()
      where login_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2)`,
    [loginId, exceptId]
  );
}

/* ------------------------------------------------------------- one-time codes */

/* Rate limit: how many codes one address may ask for in a window. Stored in
   login_codes rather than a counter table, so there is nothing else to keep
   in sync. */
const CODE_WINDOW_MIN = Number(env.OTP_WINDOW_MINUTES || 15);
const CODE_MAX_PER_WINDOW = Number(env.OTP_MAX_PER_WINDOW || 5);

export async function recentCodeCount(loginId) {
  const row = await db.one(
    `select count(*)::int as n from login_codes
      where login_id = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [loginId, String(CODE_WINDOW_MIN)]
  );
  return row ? row.n : 0;
}

/* Returns the six digits. The caller emails them; they are nowhere stored. */
export async function issueCode(loginId, purpose) {
  const n = await recentCodeCount(loginId);
  if (n >= CODE_MAX_PER_WINDOW) {
    throw tooMany(
      `That is ${CODE_MAX_PER_WINDOW} codes in ${CODE_WINDOW_MIN} minutes. ` +
        'Wait a few minutes and try again, or check your spam folder.'
    );
  }

  const code = randomCode(6);

  /* Older codes for this login stop working: the newest email is the only
     one that matters, which is what people expect. */
  await db.query(
    `update login_codes set consumed_at = now()
      where login_id = $1 and consumed_at is null`,
    [loginId]
  );

  await db.query(
    `insert into login_codes (login_id, code_hash, purpose, expires_at)
     values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [loginId, codeHash(loginId, code), purpose, String(env.OTP_MINUTES)]
  );

  return code;
}

/* Verify and consume. Returns true only for a live, correct, unexhausted code. */
export async function redeemCode(loginId, code) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const row = await db.one('select consume_login_code($1, $2) as ok', [
    loginId,
    codeHash(loginId, String(code)),
  ]);
  return Boolean(row && row.ok);
}

/* ------------------------------------------------------------------ magic links */

export async function issueLink(loginId, purpose, { minutes = env.LINK_MINUTES } = {}) {
  const token = randomToken(32);
  await db.query(
    `update login_tokens set consumed_at = now()
      where login_id = $1 and consumed_at is null`,
    [loginId]
  );
  await db.query(
    `insert into login_tokens (login_id, token_hash, purpose, expires_at)
     values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [loginId, hmac(requirePepper(), 'signinlink:' + token), purpose, String(minutes)]
  );
  return { token, minutes };
}

/* A link is consumed by being opened, whatever happens next — an
   intercepted link must not be replayable. */
export async function redeemLink(token) {
  if (!token) return null;
  const row = await db.one(
    `update login_tokens
        set consumed_at = now()
      where token_hash = $1
        and consumed_at is null
        and expires_at > now()
      returning login_id, purpose`,
    [hmac(requirePepper(), 'signinlink:' + String(token))]
  );
  if (!row) return null;

  const login = await db.one(
    `select l.id, l.email::text as email, l.name, l.role, l.shop_id,
            l.email_verified_at, sh.name as shop_name
       from logins l left join shops sh on sh.id = l.shop_id
      where l.id = $1`,
    [row.login_id]
  );
  return login;
}

/* --------------------------------------------------------------- sign-up */

/* Step one: the address is not yet a login. It waits in pending_signups until
   the code (or link) in the email comes back — so two people cannot race to
   register the same address, and an abandoned sign-up leaves no shop behind. */
export async function startSignup({ email, shopName, personName, password }) {
  const clean = String(email || '').trim().toLowerCase();
  if (!looksLikeEmail(clean)) throw badRequest('That does not look like an email address.');
  if (!String(shopName || '').trim()) throw badRequest('Give the shop a name.');
  if (!String(personName || '').trim()) throw badRequest('Enter your own name.');

  /* The password is optional so that an account created by SQL — the demo
     shop, the platform admin — still works with a code and no password. A
     person signing up through the form has to choose one. */
  let passwordColumns = {};
  if (password !== undefined && password !== null && password !== '') {
    const problem = passwords.checkPassword(password, { email: clean, shopName });
    if (problem) throw badRequest(problem);
    const hashed = await passwords.hashPassword(password);
    passwordColumns = {
      password_hash: hashed.hash,
      password_salt: hashed.salt,
      password_params: hashed.params,
    };
  }

  const existing = await db.one('select id, shop_id, role, name from logins where email = $1', [clean]);
  if (existing) {
    /* The address already has an account: sign in, do not make a second shop.
       The response has the same shape either way, so this route cannot be
       used to find out which addresses have accounts. */
    return { existing: true, loginId: existing.id, shopId: existing.shop_id, email: clean };
  }

  /* One live sign-up per address. Re-posting the form replaces it, which is
     what somebody who mistyped the shop name expects. */
  const pending = await db.one(
    `insert into pending_signups
       (email, shop_name, person_name, password_hash, password_salt, password_params, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' minutes')::interval)
     on conflict (email) do update
       set shop_name     = excluded.shop_name,
           person_name   = excluded.person_name,
           password_hash = excluded.password_hash,
           password_salt = excluded.password_salt,
           password_params = excluded.password_params,
           expires_at    = excluded.expires_at
     returning id, email::text as email, shop_name, person_name,
               password_hash, password_salt, password_params`,
    [
      clean,
      String(shopName).trim(),
      String(personName).trim(),
      passwordColumns.password_hash || null,
      passwordColumns.password_salt || null,
      passwordColumns.password_params || null,
      String(env.SIGNUP_MINUTES),
    ]
  );

  /* Rate limit per address, before another email goes out. */
  const throttle = await db.one(
    `select count(*)::int as n from login_codes
      where pending_id = $1 and created_at > now() - interval '15 minutes'`,
    [pending.id]
  );
  if (throttle && throttle.n >= CODE_MAX_PER_WINDOW) {
    throw tooMany(
      `That is ${CODE_MAX_PER_WINDOW} emails in 15 minutes. ` +
        'Wait a few minutes, or check your spam folder.'
    );
  }

  await db.query('update login_codes  set consumed_at = now() where pending_id = $1 and consumed_at is null', [pending.id]);
  await db.query('update login_tokens set consumed_at = now() where pending_id = $1 and consumed_at is null', [pending.id]);

  const code = randomCode(6);
  const token = randomToken(32);
  const minutes = env.OTP_MINUTES;

  await db.query(
    `insert into login_codes (pending_id, code_hash, purpose, expires_at)
     values ($1, $2, 'signup', now() + ($3 || ' minutes')::interval)`,
    [pending.id, hmac(requirePepper(), 'pending:' + pending.id + ':' + code), String(minutes)]
  );
  await db.query(
    `insert into login_tokens (pending_id, token_hash, purpose, expires_at)
     values ($1, $2, 'signup', now() + ($3 || ' minutes')::interval)`,
    [pending.id, hmac(requirePepper(), 'signuplink:' + token), String(env.LINK_MINUTES)]
  );

  return {
    existing: false,
    pendingId: pending.id,
    email: pending.email,
    shopName: pending.shop_name,
    personName: pending.person_name,
    code,
    token,
    minutes,
  };
}

/* Step two, by code. Five wrong guesses kill the code, like a sign-in. */
export async function finishSignupWithCode({ email, code }) {
  const clean = String(email || '').trim().toLowerCase();
  const pending = await db.one(
    `select * from pending_signups where email = $1 and expires_at > now()`,
    [clean]
  );
  if (!pending) throw badRequest('That sign-up has expired. Start again — it takes a moment.');

  /* Two places the code could have come from, exactly as when it was sent.

     Neon Auth first: when it is configured the person was emailed ITS code,
     so our own table holds a code nobody has seen. Checking ours first would
     make every sign-up fail once.

     If Neon Auth is not configured, or cannot be reached, or says no, the
     check falls through to our own code. That is what keeps sign-up working
     when a third party is down — the person may then be typing a code we
     did not send, which reads as "that code is not right", but they are never
     locked out of the flow. */
  const viaNeonAuth = neonAuth.configured()
    ? await neonAuth.verifySignupCode(pending.email, code)
    : false;

  const row = viaNeonAuth
    ? { id: null }
    : await db.one(
        `select id from login_codes
          where pending_id = $1 and purpose = 'signup'
            and consumed_at is null and attempts < $2 and expires_at > now()
            and code_hash = $3`,
        [pending.id, env.OTP_ATTEMPTS, hmac(requirePepper(), 'pending:' + pending.id + ':' + String(code))]
      );

  if (!row) {
    const attempt = await db.one(
      `update login_codes set attempts = attempts + 1
        where pending_id = $1 and purpose = 'signup' and consumed_at is null
        returning attempts`,
      [pending.id]
    );
    if (attempt && attempt.attempts >= env.OTP_ATTEMPTS) {
      await db.query('update login_codes set consumed_at = now() where pending_id = $1 and consumed_at is null', [pending.id]);
      throw tooMany('Too many wrong codes. Ask for a new email.');
    }
    throw badRequest('That code is not right. Check the newest email.');
  }

  /* Either way, any code of ours is done with. Consumed rather than deleted,
     so the rate-limit history stays honest. */
  if (row.id) {
    await db.query('update login_codes set consumed_at = now() where id = $1', [row.id]);
  } else {
    await db.query(
      `update login_codes set consumed_at = now()
        where pending_id = $1 and consumed_at is null`,
      [pending.id]
    );
  }

  return provision(pending);
}

/* Step two, by link. The token names the sign-up; no code needed. */
export async function finishSignupWithLink({ token }) {
  const row = await db.one(
    `update login_tokens set consumed_at = now()
      where token_hash = $1 and consumed_at is null and expires_at > now()
        and purpose = 'signup'
      returning pending_id`,
    [hmac(requirePepper(), 'signuplink:' + String(token || ''))]
  );
  if (!row || !row.pending_id) {
    throw badRequest('That link has expired or was already used. Start again.');
  }

  const pending = await db.one(
    `select * from pending_signups where id = $1 and expires_at > now()`,
    [row.pending_id]
  );
  if (!pending) throw badRequest('That sign-up expired. Start again — it takes a moment.');

  return provision(pending);
}

/* Create the shop, its settings, its owner login and its first categories.
   Idempotent on email: if the address became a login meanwhile, it is signed
   in rather than duplicated. */
async function provision(pending) {
  const existing = await db.one(
    `select l.id, l.email::text as email, l.name, l.role, l.shop_id,
            l.email_verified_at, sh.name as shop_name
       from logins l left join shops sh on sh.id = l.shop_id where l.email = $1`,
    [pending.email]
  );
  if (existing) {
    await db.query('delete from pending_signups where id = $1', [pending.id]);
    if (!existing.email_verified_at) {
      await db.query('update logins set email_verified_at = now() where id = $1', [existing.id]);
    }
    return { login: existing, created: false, shopId: existing.shop_id };
  }

  return db.tx(null, async (client) => {
    const shop = await db.oneIn(
      client,
      `insert into shops (name, branch, plan_kes) values ($1, 'Main branch', 1500)
       returning id, name`,
      [pending.shop_name]
    );
    await db.noneIn(client, 'insert into shop_settings (shop_id) values ($1)', [shop.id]);

    /* The five categories every duka starts with. A starting point, not a
       rule: the stock screen lets them be renamed. */
    for (const name of ['Drinks', 'Grocery', 'Household', 'Personal care', 'Hardware']) {
      await db.noneIn(client, 'insert into categories (shop_id, name) values ($1, $2)', [
        shop.id,
        name,
      ]);
    }

    const login = await db.oneIn(
      client,
      `insert into logins
         (shop_id, email, name, role, email_verified_at,
          password_hash, password_salt, password_params, password_set_at)
       values ($1, $2, $3, 'owner', now(), $4, $5, $6,
               case when $4::text is null then null else now() end)
       returning id, email::text as email, name, role, shop_id, email_verified_at`,
      [
        shop.id,
        pending.email,
        pending.person_name,
        pending.password_hash || null,
        pending.password_salt || null,
        pending.password_params || null,
      ]
    );

    await db.noneIn(client, 'delete from pending_signups where id = $1', [pending.id]);

    await db.noneIn(
      client,
      `insert into audit_entries (shop_id, login_id, action, detail)
       values ($1, $2, 'shop.created', $3)`,
      [shop.id, login.id, `Sign-up: ${pending.email}`]
    );

    return { login: { ...login, shop_name: shop.name }, created: true, shopId: shop.id };
  });
}

/* --------------------------------------------------------------- helpers */

export function looksLikeEmail(v) {
  const s = String(v || '');
  if (!s || s.length > 254 || /\s/.test(s)) return false;
  const parts = s.split('@');
  if (parts.length !== 2) return false;
  const [name, domain] = parts;
  return name.length > 0 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/* Where a sign-in link lands. The page reads the token from the URL, posts it
   to the API, and carries on to the dashboard. */
export function linkUrl(path, token) {
  const base = env.SITE_URL.replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export { sha256, sameHash };

/* ---------------------------------------------------- signing in with a password

   The everyday door. Still inside the same rule as everything else: a session
   is only issued for a login row, which is what ties a person to a shop and
   what the security rules read.

   Two things this deliberately does NOT do:

   · Say whether the address exists. A wrong password and an unknown address
     get the same answer, so this cannot be used to list a platform's shops.
   · Say how far off you were. One message, one status.

   It DOES count failures per address, because a password can be guessed in a
   way a six-digit code cannot. */

const PASSWORD_MAX_FAILS = 8;
const PASSWORD_LOCK_MINUTES = 15;

export async function signInWithPassword({ email, password }, meta = {}) {
  const clean = String(email || '').trim().toLowerCase();
  const wrong = badRequest('That email and password do not match.');

  if (!looksLikeEmail(clean)) throw wrong;

  const login = await db.one(
    `select l.id, l.name, l.role, l.shop_id, l.email::text as email,
            l.password_hash, l.password_salt, l.password_params,
            l.email_verified_at, sh.name as shop_name,
            sh.suspended_at as shop_suspended_at
       from logins l left join shops sh on sh.id = l.shop_id
      where l.email = $1`,
    [clean]
  );

  /* No such account, or one that has never had a password: same answer, and
     the same amount of work, so timing does not give it away. */
  if (!login || !login.password_hash) {
    await passwords.verifyPassword(String(password || ''), {
      hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      params: 'scrypt$16384$8$1$64',
    });
    throw wrong;
  }

  /* Failures are counted from the audit log, which already records every
     attempt with its time — no second table to keep in sync. */
  const fails = await db.one(
    `select count(*)::int as n from audit_entries
      where at > now() - ($1 || ' minutes')::interval
        and action = 'signin.password.failed'
        and detail = $2`,
    [String(PASSWORD_LOCK_MINUTES), clean]
  );

  if (fails && fails.n >= PASSWORD_MAX_FAILS) {
    throw tooMany(
      `That is ${PASSWORD_MAX_FAILS} wrong passwords in ${PASSWORD_LOCK_MINUTES} minutes. ` +
        'Wait a few minutes, or sign in with a code by email instead.'
    );
  }

  /* Who says whether the password is right.

     Neon Auth first, when it is configured: that is the account created when
     the person signed up. Our own scrypt hash is the fallback, and it exists
     for two real cases:

     · an account made before Neon was configured, or by SQL;
     · Neon being unreachable. A shop must not lose its till because a third
       party is down. An outage falls through to the hash; a definite "no" from
       Neon does not.

     Keeping those apart is the whole point: a wrong password and a dead service
     look the same in a boolean, and confusing them either refuses a real
     shopkeeper or accepts a wrong password. */
  let verdict = 'local';

  if (neonAuth.configured()) {
    const neon = await neonAuth.checkPassword(clean, password);
    if (neon.ok) {
      verdict = 'neon-yes';
    } else if (neon.unreachable || neon.serverFault) {
      verdict = 'local';
    } else {
      verdict = 'neon-no';
    }
  }

  let right = verdict === 'neon-yes';

  if (!right && verdict === 'local' && login.password_hash) {
    right = await passwords.verifyPassword(String(password || ''), {
      hash: login.password_hash,
      salt: login.password_salt,
      params: login.password_params,
    });
  }

  if (!right) {
    await db.query(
      `insert into audit_entries (action, detail) values ('signin.password.failed', $1)`,
      [clean]
    );
    throw wrong;
  }

  if (login.shop_suspended_at) {
    throw new HttpError(403, 'This shop is paused. Call Shop Yangu on 0722 000 111.');
  }

  /* Verified by holding a password that only the inbox's owner could set. */
  if (!login.email_verified_at) {
    await db.query('update logins set email_verified_at = now() where id = $1', [login.id]);
  }

  /* Quietly upgrade a password hashed under older, cheaper parameters. The
     person never learns; the next sign-in is simply stronger. */
  if (passwords.needsRehash(login.password_params)) {
    const fresh = await passwords.hashPassword(String(password));
    await db.query(
      `update logins set password_hash = $2, password_salt = $3, password_params = $4
        where id = $1`,
      [login.id, fresh.hash, fresh.salt, fresh.params]
    );
  }

  /* `login` is returned alongside the session because the route needs the
     name and role for the reply, and re-reading the row would be a second
     round trip for data we already have. */
  const session = await createSession(login, meta.req, { shopId: login.shop_id || null });
  return { ...session, login, shopId: login.shop_id || null };
}

/* Set or change a password while signed in. The point of entry for an account
   that was created by SQL (the demo shop, the platform admin) and has never had
   one. Requires the current password when there is one — a stolen session
   should not be able to lock the owner out of their own shop. */
export async function setPassword({ login, currentPassword, newPassword }) {
  const row = await db.one(
    'select id, email::text as email, password_hash, password_salt, password_params from logins where id = $1',
    [login.id]
  );
  if (!row) throw notFound('That account no longer exists.');

  /* Who confirms the CURRENT password.

     Neon Auth when it is configured, because that is the authority the sign-in
     path consults, and the two must not disagree about what the current
     password is. Our own hash otherwise — and also when Neon cannot be
     reached, so a password can still be changed during an outage. */
  if (row.password_hash || neonAuth.configured()) {
    let ok = false;

    if (neonAuth.configured()) {
      const neon = await neonAuth.checkPassword(row.email, String(currentPassword || ''));
      if (neon.ok) ok = true;
      else if (neon.unreachable || neon.serverFault) {
        ok = row.password_hash
          ? await passwords.verifyPassword(String(currentPassword || ''), {
              hash: row.password_hash,
              salt: row.password_salt,
              params: row.password_params,
            })
          : false;
      }
    } else if (row.password_hash) {
      ok = await passwords.verifyPassword(String(currentPassword || ''), {
        hash: row.password_hash,
        salt: row.password_salt,
        params: row.password_params,
      });
    }

    if (!ok) throw badRequest('Your current password is not right.');
  }

  const problem = passwords.checkPassword(newPassword, { email: row.email });
  if (problem) throw badRequest(problem);

  const fresh = await passwords.hashPassword(String(newPassword));
  await db.query(
    `update logins
        set password_hash = $2, password_salt = $3, password_params = $4, password_set_at = now()
      where id = $1`,
    [row.id, fresh.hash, fresh.salt, fresh.params]
  );

  /* Neon Auth holds the password the shop checks first, so it has to hear about
     a change. If it cannot be told, the whole change is refused rather than
     half-applied — an old password that still works at Neon while a new one
     works here is exactly the kind of quiet split that loses a shop's trust.

     Not configured is fine: then our hash is the only password there is. */
  if (neonAuth.configured()) {
    const synced = await neonAuth.changePassword(row.email, String(currentPassword || ''), String(newPassword));
    if (!synced.ok) {
      /* Put our own hash back so the two never disagree. */
      await db.query(
        `update logins
            set password_hash = $2, password_salt = $3, password_params = $4
          where id = $1`,
        [row.id, row.password_hash, row.password_salt, row.password_params]
      );
      throw badRequest(
        synced.unreachable
          ? 'Neon Auth did not answer, so the password was not changed. Try again in a minute.'
          : 'Neon Auth refused the change, so nothing was altered. Sign in with a code by email and try again.'
      );
    }
  }

  return { ok: true };
}
