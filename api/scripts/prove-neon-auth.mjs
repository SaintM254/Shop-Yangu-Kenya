#!/usr/bin/env node
/* ================================================ api/scripts/prove-neon-auth.mjs

   Prove Neon Auth works, against the real service, and print no secrets.

   Run it after setting NEON_AUTH_BASE_URL:

     cd api && node scripts/prove-neon-auth.mjs you@yourdomain.co.ke

   It does four things, in the order the shop does them:

     1. creates a user with email and password at Neon Auth
     2. asks Neon to email a verification code
     3. checks a wrong code — which must FAIL — so a lucky 200 cannot pass
     4. reads the current user back, and signs in with the password

   What it never does: print NEON_AUTH_BASE_URL, the cookie secret, the pepper,
   or the code itself. The verification code is read from the inbox by a human,
   which is the point — it proves the email actually arrived at that address.
*/

import readline from 'node:readline/promises';

const base = String(process.env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '');
const email = String(process.argv[2] || '').trim().toLowerCase();

const pass = (name, extra = '') => console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? `  \x1b[90m${extra}\x1b[0m` : ''}`);
const fail = (name, extra = '') => console.log(`  \x1b[31m✗ ${name}\x1b[0m${extra ? `  ${extra}` : ''}`);
const head = (name) => console.log(`\n\x1b[1m${name}\x1b[0m`);

let failures = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass(name, extra);
  else {
    failures++;
    fail(name, extra);
  }
};

if (!base) {
  console.error(
    '\n  NEON_AUTH_BASE_URL is not set.\n\n' +
      '  Copy it from Neon: your project → Auth → the Base URL, which ends in /neondb/auth.\n' +
      '  Then:\n\n' +
      '    NEON_AUTH_BASE_URL="https://ep-....neon.tech/neondb/auth" \\\n' +
      '      node scripts/prove-neon-auth.mjs you@yourdomain.co.ke\n'
  );
  process.exit(2);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('\n  Give an email address you can open right now:\n\n    node scripts/prove-neon-auth.mjs you@yourdomain.co.ke\n');
  process.exit(2);
}

/* A password that satisfies both Neon and this shop. Not secret: it exists for
   one minute and is not used anywhere else. */
const password = `prove-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

const { signUpWithPassword, sendSignupCode, verifySignupCode, readUserAfterPasswordCheck, authHealth } =
  await import('../_lib/neon-auth.js');

head('The settings');
const health = authHealth();
ok('Neon Auth is configured', health.driver === 'neon-auth', health.host || '');
ok('the base URL has the /neondb/auth path', health.ok === true, health.error || '');
ok('a site origin will be sent (this is what Better Auth checks)', Boolean(health.trustedOrigin), health.trustedOrigin);
if (health.error) console.log(`\n  ${health.error}\n`);

head('1. Create the user with email and password');
const signup = await signUpWithPassword({ email, password, name: 'Proof Check' });
if (signup.ok) pass('Neon Auth created the account');
else if (signup.existed) pass('the account already exists at Neon Auth — continuing');
else {
  fail('Neon Auth refused the sign-up', signup.error || signup.code);
  console.log(
    '\n  If this says "Invalid origin", add your site address as a trusted domain:\n' +
      '  Neon console → Auth → Trusted domains. That is the setting that makes\n' +
      '  sign-in work and it is not optional.\n'
  );
  process.exit(1);
}

head('2. Ask Neon to email a verification code');
const sent = await sendSignupCode(email, 'Proof Check');
ok('Neon accepted the request', sent.ok === true, sent.ok ? '' : sent.error);
if (!sent.ok) {
  console.log('\n  Nothing was emailed, so stop here. The usual causes:\n' +
    '    · the address has no user at Neon — step 1 must succeed first\n' +
    '    · custom SMTP not connected, and the shared sender only reaches the\n' +
    '      address on the Neon account (Neon → Auth → Email provider)\n');
  process.exit(1);
}

head('3. Check the code');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const wrong = await verifySignupCode(email, '000000');
ok('a deliberately wrong code is REFUSED', wrong === false);

const typed = String(await rl.question(`\n  Open ${email} and type the six-digit code (or press Enter to skip): `)).trim();
rl.close();

if (/^\d{6}$/.test(typed)) {
  const right = await verifySignupCode(email, typed);
  ok('the code from the inbox is ACCEPTED', right === true);
} else {
  console.log('  \x1b[90mskipped — the code step was not proved from this machine\x1b[0m');
}

head('4. Read the current user back');
const read = await readUserAfterPasswordCheck({ email, password });
ok('sign-in with the password works', read.ok === true, read.error || '');
ok('the current user came back', Boolean(read.user?.email), read.user?.email || '');
ok('and it is the same address', read.user?.email === email);

/* Never print the password or the base URL. */
console.log(
  `\n${failures === 0 ? '\x1b[32m' : '\x1b[31m'}${failures === 0 ? 'Neon Auth is working' : `${failures} check(s) failed`}\x1b[0m\n`
);
process.exit(failures ? 1 : 0);
