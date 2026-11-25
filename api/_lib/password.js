/* ============================================================ api/_lib/password.js

   Passwords, hashed properly.

   The shop's sign-in is still the emailed code. A password is what a shop
   actually wants day to day — one thing to remember, no inbox on the counter.
   So the password is the everyday door and the code is the way back in.

   No dependency. Node ships scrypt, which is a memory-hard key-derivation
   function: deliberately slow and deliberately hungry, so a stolen table of
   hashes cannot be attacked at a billion guesses a second on a graphics card
   the way a bare SHA-256 can.

   What is stored, per account:
     password_salt    random bytes, one per password, base64
     password_params  the cost parameters, so they can be raised later without
                      invalidating every existing password
     password_hash    the derived key, base64

   The parameters are stored WITH the hash rather than read from the config at
   verify time. That is the whole point: a shop that signed up under N=16384
   still verifies after the platform doubles it, and gets upgraded on next
   sign-in (see `needsRehash`).

   Why not argon2 or bcrypt: both are native modules. This repo has no compiled
   dependencies on purpose — Vercel's build is a plain `npm install`, and a
   native module is the one thing that fails there without anybody touching it.
*/

import crypto from 'node:crypto';

/* N is the CPU/memory cost, r the block size, p the parallelism. These are the
   Node defaults for scrypt and cost about 100 ms on a small server — slow
   enough to hurt an attacker, fast enough that a shopkeeper does not notice.
   64 MB is the ceiling the parameters must not exceed. */
export const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

const paramsString = (p) => `scrypt$${p.N}$${p.r}$${p.p}$${p.keylen}`;

export function parseParams(s) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$(\d+)$/.exec(String(s || ''));
  if (!m) return { ...PARAMS };
  return { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]), keylen: Number(m[4]) };
}

const scrypt = (password, salt, params) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      salt,
      params.keylen,
      /* maxmem has to clear 128 * N * r; the default 32 MB is below our own
         parameters, which is a confusing way to fail. */
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });

/* Returns the three columns. The plain password is never stored or logged. */
export async function hashPassword(password, params = PARAMS) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, params);
  return {
    hash: key.toString('base64'),
    salt: salt.toString('base64'),
    params: paramsString(params),
  };
}

/* Constant-time compare, so a wrong password cannot be narrowed down by timing
   how long the answer took. */
export async function verifyPassword(password, { hash, salt, params }) {
  if (!hash || !salt) return false;

  const p = parseParams(params);
  const key = await scrypt(password, Buffer.from(salt, 'base64'), p);
  const stored = Buffer.from(hash, 'base64');

  if (stored.length !== key.length) return false;
  return crypto.timingSafeEqual(stored, key);
}

/* True when a stored password was made with weaker parameters than today's,
   so it can be re-hashed quietly on the next successful sign-in. */
export function needsRehash(params) {
  const p = parseParams(params);
  return p.N < PARAMS.N || p.keylen < PARAMS.keylen;
}

/* ------------------------------------------------------------------ rules */

/* Deliberately short and memorisable, and deliberately not a maze of symbols.
   A shopkeeper who has to write the password on the counter has no password.
   Length is what matters; a 12-character phrase beats an 8-character scramble.

   The list is the ones that actually get used here: the shop's own name, and
   the handful everybody picks. */
const TOO_COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'letmein1', 'welcome1', 'admin123',
  'shop1234', 'duka1234', 'kenya123', 'nairobi1', 'mombasa1', 'shopyangu',
]);

export function checkPassword(password, { email = '', shopName = '' } = {}) {
  const p = String(password || '');

  if (p.length < 8) {
    return 'Use at least 8 characters. A short phrase you will remember beats a scramble you will not.';
  }
  if (p.length > 200) {
    return 'That password is too long. 200 characters is plenty.';
  }
  if (/^\d+$/.test(p)) {
    return 'Use more than just numbers.';
  }
  if (/^(.)\1+$/.test(p)) {
    return 'Use something other than one repeated character.';
  }

  const lower = p.toLowerCase();
  if (TOO_COMMON.has(lower)) {
    return 'That is one of the first passwords anybody tries. Pick something else.';
  }

  const localPart = String(email || '').split('@')[0].toLowerCase();
  if (localPart.length >= 4 && lower.includes(localPart)) {
    return 'Do not use your email address as your password.';
  }

  const shop = String(shopName || '').toLowerCase().replace(/\s+/g, '');
  if (shop.length >= 5 && lower.replace(/\s+/g, '').includes(shop)) {
    return 'Do not use your shop name as your password — everybody can see it on the receipt.';
  }

  return null;
}

/* Two boxes, typed by hand on a phone. */
export function passwordsMatch(a, b) {
  return String(a || '') === String(b || '');
}
