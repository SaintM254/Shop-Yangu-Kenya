The follwing are some of the codes that neon has given me
Make sure the code is actually requested and inspect the result. OTPs are sent when your app calls emailOtp.sendVerificationOtp(). Log the returned error:

import { authClient } from './auth';

export async function sendSignInOtp(email: string) {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });

  if (error) throw error;
}


