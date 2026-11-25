# Snippets Neon gives you, and whether they fit this shop

> **The snippet named in your screenshots is the important one, and it is now
> implemented.** It says a verified user needs `type: 'sign-in'`, because a
> sign-up verification code is never sent to an address that is already
> verified. That is exactly what `api/_lib/neon-auth.js` now decides
> automatically. The explanation, and what to do today, is in
> [Step 4 →](04-email-and-sign-in.md#the-app-is-not-requesting-the-otp--the-actual-cause).

---

An already-verified user doesn't receive a sign-up verification code, so emailVerified being true is expected to mean no code arrives from the sign-up flow. The sign-up flow only sends a code when data.user.emailVerified is false after signUp.email().

.tsx code👇
if (data?.user && !data.user.emailVerified) {
  setMessage('Check your email for a verification code');
  setStep('verify'); // Switch to verification form
}

For a user who is already verified, the documented way to get a code is to request one explicitly with type: 'sign-in':
.ts code👇

import { authClient } from './auth';

export async function sendSignInOtp(email: string) {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });

  if (error) throw error;
}
Then sign in with the code:

.ts code👇
import { authClient } from './auth';

export async function signInWithOtp(email: string, otp: string) {
  const { data, error } = await authClient.signIn.emailOtp({ email, otp });

  if (error) throw error;
  return data;
}

