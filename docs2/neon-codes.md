# Snippets Neon gives you, and whether they fit this shop

Neon's assistant (and other chatbots) will hand you short pieces of code for
Better Auth. They are usually **correct about Better Auth** and **slightly wrong
about this shop**, because this shop has two properties most examples do not:

- **It runs its own sessions.** A session cookie issued by this server, checked
  against the `logins` table, is what decides which shop a request may touch.
  Neon Auth must never issue a session that reaches shop data.
- **Its Neon client is on the server**, in `api/_lib/neon-auth.js`, not in the
  browser. A browser client would put Neon's cookie next to this shop's, and two
  session systems fighting over one origin is how leaks happen.

So: read the snippet, check it against the table below, and prefer the version
already in this repository.

---

## The snippet you were given

```ts
import { authClient } from './auth';

export async function sendSignInOtp(email: string) {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });

  if (error) throw error;
}
```

**What is right about it.** `sendVerificationOtp({ email, type })` is the real
method, the parameters are real, and the advice — *log the returned error,
because OTPs are only sent when your app actually asks* — is excellent advice.
Most "no code arrived" bugs are either a call that never happened, or a call whose
error was swallowed.

**What does not fit here.** Three things, in order of importance.

### 1. `type: 'sign-in'` is the wrong job at sign-up

| Type | Its job | Works for an address with no account? |
|---|---|---|
| `'email-verification'` | confirm an address **while creating** an account | **no** — answers `{"success": true}` and sends nothing |
| `'sign-in'` | sign in a user who **already exists** | yes, it sends — but it is a sign-in code, not a verification |

At sign-up this shop creates the Neon account first (`signUpWithPassword`), then
asks for the code with `type: 'email-verification'`. That ordering is deliberate
and is commented in `api/_lib/neon-auth.js` and in `api/_routes/auth.js`. Swap it
and sign-up silently stops sending mail.

`type: 'sign-in'` is used by this shop in one place only: the way back in when a
password is forgotten.

### 2. `authClient` is a browser client

`authClient` from `@neon/auth` is for the browser. This shop's client is
`createAuthServer` from `@neon/auth/server`, constructed per call with an empty
cookie jar, so nothing about Neon's session survives in the process.

If you want the browser to talk to Neon directly you would need Neon's cookie,
its trusted domains, and a second definition of "signed in" — and this shop
already has one. Do not add it.

### 3. `{"success": true}` is not proof anything was sent

Better Auth returns success even when the send is a no-op. Never build a "check
your email" screen on the strength of that response alone. The only proofs are:

- an email in an inbox, or
- a code that a **wrong** guess is genuinely refused against.

That is why `api/scripts/prove-neon-auth.mjs` deliberately tries a wrong code
first, and why the repository's test suite runs against a real Better Auth server
rather than a stub that returns 200 to everything.

---

## The same job, as this shop does it

Already written — do not add another copy:

| Job | Function | In |
|---|---|---|
| create the Neon account | `signUpWithPassword` | `api/_lib/neon-auth.js` |
| send the sign-up code | `sendSignupCode` | `api/_lib/neon-auth.js` |
| check the sign-up code | `verifySignupCode` | `api/_lib/neon-auth.js` |
| send a sign-in code | `sendSigninCode` | `api/_lib/neon-auth.js` |
| check a password | `checkPassword` | `api/_lib/neon-auth.js` |
| prove all of it | `prove-neon-auth.mjs` | `api/scripts/` |

Every one of them returns `{ ok, error }` rather than throwing, because every
caller has a documented fallback: this shop can send its own code and check its
own scrypt hash if Neon is unreachable. A function that throws turns a third
party's bad afternoon into a shop that cannot open.

---

## The habit worth keeping from that snippet

`if (error) throw error;` — the *checking* is the good part. The only change
here is that the check is done once, in one wrapper, and it logs instead of
throwing:

```js
const result = await attempt(() => auth.emailOtp.sendVerificationOtp({ email, type }));
if (!result.ok) console.warn('[auth] Neon Auth did not send:', result.code, result.error);
```

An error that is caught, logged, and fallen back from is a shop that keeps
working. An error that is thrown in the middle of a sign-up is a shop that does
not.
