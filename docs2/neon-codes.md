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

