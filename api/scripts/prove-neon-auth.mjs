#!/usr/bin/env node
/* ================================================ api/scripts/prove-neon-auth.mjs

   Prove Neon Auth works, against the real service, and print no secrets.

   TWO WAYS TO RUN IT. Use whichever matches how you work.

   1. From GitHub, with no terminal. Actions tab → "Prove Neon Auth" → Run
      workflow → type your email address → Run. It reports four steps and does
      not need the code from your inbox: it proves the account, the send, and
      the password sign-in, which is what breaks.

   2. From a terminal, which also proves the code itself:

        cd api && node scripts/prove-neon-auth.mjs you@yourdomain.co.ke

   With `--no-prompt` (what the workflow uses) it never waits for input, so it
   can never hang a build.

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
/* The address comes from the argument, or from an environment variable so a
   GitHub Actions run can supply it without a terminal. */
const NO_PROMPT = process.argv.includes('--no-prompt');
/* The first argument that is not a flag. Taking argv[2] blindly would read
   `--no-prompt` itself as the email address. */
const emailArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const email = String(emailArg || process.env.PROVE_EMAIL || '').trim().toLowerCase();

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
if (signup.ok) pass('Neon Auth created the account', `emailVerified: ${Boolean(signup.emailVerified)}`);
else if (signup.existed) pass('the account already exists at Neon Auth — continuing', 'treated as verified');
else {
  fail('Neon Auth refused the sign-up', signup.error || signup.code);
  console.log(
    '\n  If this says "Invalid origin", add your site address as a trusted domain:\n' +
      '  Neon console → Auth → Trusted domains. That is the setting that makes\n' +
      '  sign-in work and it is not optional.\n'
  );
  process.exit(1);
}

head('2. Ask Neon to email a code');
/* WHICH KIND, AND WHY IT IS REPORTED. An address that Neon already considers
   verified is never sent a sign-up verification code — the request succeeds and
   nothing arrives. So the type is chosen from what step 1 reported, and the type
   is printed, because "a code was requested" and "a code that can arrive was
   requested" are different facts. */
const verified = Boolean(signup.emailVerified);
const sent = await sendSignupCode(email, 'Proof Check', { verified });
ok(
  'Neon accepted the request',
  sent.ok === true,
  sent.ok ? `type: ${sent.type}` : sent.error
);
if (sent.ok) {
  console.log(
    verified
      ? '  \x1b[90mThis address is already verified at Neon, so the code is a SIGN-IN code.\x1b[0m\n' +
        '  \x1b[90mThat is the only kind an already-verified address can receive.\x1b[0m'
      : '  \x1b[90mThis address needs verifying, so the code is an EMAIL-VERIFICATION code.\x1b[0m'
  );
}
if (!sent.ok) {
  console.log('\n  Nothing was emailed, so stop here. The usual causes:\n' +
    '    · the address has no user at Neon — step 1 must succeed first\n' +
    '    · custom SMTP not connected, and the shared sender only reaches the\n' +
    '      address on the Neon account (Neon → Auth → Email provider)\n');
  process.exit(1);
}

head('3. Check the code');
const wrong = await verifySignupCode(email, '000000');
ok('a deliberately wrong code is REFUSED', wrong === false);

if (NO_PROMPT) {
  console.log(
    '  \x1b[90mthe real code was not typed in --no-prompt mode.\x1b[0m\n' +
      '  \x1b[90mThat is the only step left, and it needs a human with the inbox:\x1b[0m\n' +
      '  \x1b[90mrun this without --no-prompt, or just open the sign-in page.\x1b[0m'
  );
}
const rl = NO_PROMPT ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

const typed = rl
  ? String(await rl.question(`\n  Open ${email} and type the six-digit code (or press Enter to skip): `)).trim()
  : '';
if (rl) rl.close();

if (/^\d{6}$/.test(typed)) {
  const right = await verifySignupCode(email, typed);
  ok('the code from the inbox is ACCEPTED', right === true);
  if (!right) {
    console.log(
      '\n  The code was refused. The two usual reasons:\n' +
        '    · it expired (ten minutes), or an older code was typed\n' +
        '    · this address is verified, so the code is a sign-in code, and the\n' +
        '      shop checks both kinds — but a code CANNOT be reused. If you ran\n' +
        '      this twice, only the newest email works.\n'
    );
  }
} else if (!NO_PROMPT) {
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
