/* ================================================================ neon.ts

   How this project's Neon services are declared, for the Neon CLI and agent
   tooling.

   `auth: true` is Managed Better Auth: Neon runs a Better Auth server beside
   the database and keeps its users and sessions in the `neon_auth` schema, in
   the same branch. This is the supported way to turn it on — `neon deploy`
   provisions it and writes `NEON_AUTH_BASE_URL` back to the environment, so
   nobody has to copy that URL by hand.

   Turning it on is NOT the same as implementing sign-in. The shop's own sign-in
   is in api/_lib/auth.js; Neon Auth is used for the email-and-password account
   and the first verification code (api/_lib/neon-auth.js).

   Docs: https://neon.com/docs/auth/overview
*/
import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  auth: true,

  /* One branch per developer, thrown away after a week. Auth state branches
     with the data, so a preview deployment gets its own isolated users. */
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: '7d' };
    return {};
  },
});
