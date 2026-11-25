/* ============================================================ api/_routes/auth.js

   The door.

   POST /api/auth/signup          shop name, person, email, password →
                                 an email with a code and a link. No account
                                 exists until the code comes back.
   POST /api/auth/signup/verify   the code, or the link's token → the shop
                                 exists, and the session cookie is set
   POST /api/auth/signin/password email and password → signed in. The everyday
                                 door; no email is sent.
   POST /api/auth/signin          email → a code and a link, if the address is
                                 known (same response either way). The way in
                                 when a password is lost.
   POST /api/auth/signin/verify   the code, or the token → signed in
   POST /api/auth/password        set or change a password while signed in
   POST /api/auth/link            GET /auth/link?token=… on the site posts here
   POST /api/auth/signout         ends this session
   GET  /api/session              who am I
   GET  /api/sessions             this shop's other signed-in devices
   POST /api/sessions/:id/revoke  end one of them

   Why a password at all, and why the code stays:

   A password is what people expect for the tenth sign-in, not the first. So
   the account is created once, with a password chosen up front, and the FIRST
   sign-in is proved with a code sent to the inbox — which is also what proves
   the inbox is theirs. After that the password is the door, and the code is
   the spare key: a way back in that does not need a reset link, a mailer, or
   anybody's help.

   The password is stored as scrypt with a per-password salt (see
   api/_lib/password.js). Nothing here ever holds or logs the plain password.
*/

import * as db from '../_lib/db.js';
import { env } from '../_lib/config.js';
import * as auth from '../_lib/auth.js';
import { sendMail } from '../_lib/mail.js';
import * as neonAuth from '../_lib/neon-auth.js';
import * as emails from '../_lib/emails.js';
import { badRequest, notFound, unauthorized, send, tooMany, HttpError } from '../_lib/http.js';

/* The cookie is set by the handler, which is why these routes get `res`. */
const withCookie = (body, cookieLine) => [body, { 'set-cookie': cookieLine }];

export default function (router) {
  /* ------------------------------------------------------------- sign-up */

  router.post('/api/auth/signup', async (req) => {
    const { shop, name, email, password, confirmPassword } = req.body || {};

    /* Checked before anything is written, so a typo costs no second email. */
    if (password !== undefined || confirmPassword !== undefined) {
      if (String(password || '') !== String(confirmPassword || '')) {
        throw badRequest('The two passwords are not the same. Type them again.');
      }
    }

    const result = await auth.startSignup({
      email,
      shopName: shop,
      personName: name,
      password,
    });

    if (result.existing) {
      /* The address is already a shop. Send a sign-in email instead; the page
         says "you already have a shop, here is a code" — which is also the
         honest answer if somebody is probing for addresses. */
      const code = await auth.issueCode(result.loginId, 'signin');
      const { token } = await auth.issueLink(result.loginId, 'signin');
      const login = await db.one('select id, name, shop_id from logins where id = $1', [result.loginId]);
      const shopRow = await db.one('select name from shops where id = $1', [result.shopId]);

      const mail = emails.signinEmail({
        code,
        link: auth.linkUrl('/auth/link/', token),
        shopName: shopRow ? shopRow.name : 'your shop',
        personName: login.name,
        minutes: env.OTP_MINUTES,
      });
      await sendMail({ ...mail, to: result.email });

      return { ok: true, existing: true, email: result.email, next: 'signin' };
    }

    /* Who sends the code.

       Neon Auth first, when it is configured: it holds the SMTP connection and
       does the verifying, so a new shop does not have to connect a mailer
       before it can create an account. Its code is checked by Neon, not by us,
       which is why finishSignupWithCode asks Neon before it looks in our own
       table.

       ORDER MATTERS, and this was learned the hard way by running it. Better
       Auth's send-verification-otp answers `{"success": true}` for an address
       that has no user yet, and sends nothing. Asking for the code first would
       therefore show "check your email" and silently deliver zero emails. The
       person's Neon account has to exist before the code is requested, so it is
       created here, before the send.

       The password goes to Neon at the same time as to our own hash: Neon's
       sign-in is the one the shop checks first, and our scrypt hash is the
       offline fallback for when Neon cannot be reached.

       If Neon Auth is absent, unreachable, slow, or simply says no, the code we
       just made in logins_codes is sent by our own mailer instead. Sign-up
       therefore cannot be broken by a third party being down — the worst case
       is that the email looks different from usual. */
    let sentBy = 'ours';
    let codeForMail = result.code;
    let neonAccount = null;

    if (neonAuth.configured() && !result.existing) {
      /* The account first — the code cannot be sent to somebody Neon has never
         heard of. NEVER fatal: if Neon refuses (already registered, weak
         password by its rules, unreachable) the shop is still created here with
         our own code and our own hash. */
      neonAccount = await neonAuth.signUpWithPassword({
        email: result.email,
        password: password || '',
        name: result.personName,
      });
      if (!neonAccount.ok && !neonAccount.existed) {
        console.warn('[auth] Neon Auth sign-up did not happen:', neonAccount.code, neonAccount.error);
      }

      const sent = await neonAuth.sendSignupCode(result.email, result.personName);
      if (sent.ok) {
        sentBy = 'neon-auth';
        /* Never put a live code in a response, and do not put one we did not
           send into an email either. */
        codeForMail = null;
      }
    }

    /* With Neon Auth sending, the link is the only thing left in our email, so
       the email is built for the link alone rather than carrying a code we
       cannot honour. */
    const mail = emails.signupEmail({
      code: codeForMail,
      link: auth.linkUrl('/auth/link/', result.token),
      shopName: result.shopName,
      personName: result.personName,
      minutes: result.minutes,
    });
    await sendMail({ ...mail, to: result.email });

    return {
      ok: true,
      existing: false,
      email: result.email,
      /* The page shows "waiting for the code" and a resend button. */
      next: 'verify',
      shopName: result.shopName,
      sentBy,
      /* Named for the docs and the test suite: whether a Neon account exists
         for this person. It says nothing about a password. */
      neonAccount: neonAccount ? (neonAccount.ok ? 'created' : neonAccount.existed ? 'already' : 'none') : 'off',
    };
  });

  router.post('/api/auth/signup/verify', async (req, res) => {
    const { email, code, token } = req.body || {};

    const result = token
      ? await auth.finishSignupWithLink({ token })
      : await auth.finishSignupWithCode({ email, code });

    const session = await auth.createSession(result.login, req.req, { shopId: result.shopId });

    /* A welcome email, once, for the record. It must not fail the sign-up:
       the shop exists now and the person is signed in. */
    if (result.created) {
      const s = await db.one('select name from shops where id = $1', [result.shopId]);
      sendMail({
        ...emails.welcomeEmail({ shopName: s.name, personName: result.login.name }),
        to: result.login.email,
      }).catch((err) => console.error('[mail] welcome failed:', err.message));
    }

    const [body, headers] = withCookie(
      {
        ok: true,
        created: result.created,
        user: {
          name: result.login.name,
          email: result.login.email,
          role: result.login.role,
          shopId: result.shopId,
        },
        next: result.login.role === 'super_admin' ? 'admin' : 'dashboard',
      },
      session.cookie
    );
    return { body, headers };
  });

  /* ---------------------------------------------------- sign in by password */

  router.post('/api/auth/signin/password', async (req, res) => {
    const { email, password } = req.body || {};

    const session = await auth.signInWithPassword({ email, password }, { req: req.req });

    const [body, headers] = withCookie(
      {
        ok: true,
        user: {
          name: session.login.name,
          email: session.login.email,
          role: session.login.role,
          shopId: session.shopId,
        },
        next: session.login.role === 'super_admin' ? 'admin' : 'dashboard',
      },
      session.cookie
    );
    return { body, headers };
  });

  /* ------------------------------------------------------------- sign-in */

  router.post('/api/auth/signin', async (req) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!auth.looksLikeEmail(email)) throw badRequest('That does not look like an email address.');

    const login = await db.one(
      `select l.id, l.name, l.role, l.shop_id, sh.name as shop_name
         from logins l left join shops sh on sh.id = l.shop_id
        where l.email = $1`,
      [email]
    );

    /* Same answer for an unknown address and a known one. Otherwise this
       endpoint is a directory of every shop on the platform. */
    if (!login) {
      return {
        ok: true,
        next: 'verify',
        email,
        note: 'If that address has a shop, the code is on its way.',
      };
    }

    const code = await auth.issueCode(login.id, 'signin');
    const { token } = await auth.issueLink(login.id, 'signin');

    const mail =
      login.role === 'super_admin'
        ? emails.adminSigninEmail({
            code,
            link: auth.linkUrl('/admin/link/', token),
            personName: login.name,
            minutes: env.OTP_MINUTES,
          })
        : emails.signinEmail({
            code,
            link: auth.linkUrl('/auth/link/', token),
            shopName: login.shop_name || 'your shop',
            personName: login.name,
            minutes: env.OTP_MINUTES,
          });

    await sendMail({ ...mail, to: email });

    return { ok: true, next: 'verify', email, role: login.role };
  });

  router.post('/api/auth/signin/verify', async (req, res) => {
    const { email, code, token } = req.body || {};

    let login = null;

    if (token) {
      login = await auth.redeemLink(token);
      if (!login) throw badRequest('That link has expired or was already used. Ask for a new one.');
    } else {
      const clean = String(email || '').trim().toLowerCase();
      const row = await db.one(
        `select l.id, l.name, l.role, l.shop_id, l.email_verified_at,
                sh.name as shop_name, sh.suspended_at
           from logins l left join shops sh on sh.id = l.shop_id
          where l.email = $1`,
        [clean]
      );
      if (!row) throw badRequest('That code is not right. Check the newest email.');

      const okCode = await auth.redeemCode(row.id, String(code || ''));
      if (!okCode) throw badRequest('That code is not right. Check the newest email.');

      if (row.suspended_at) {
        throw new HttpError(403, 'This shop is paused. Call Shop Yangu on 0722 000 111.');
      }
      login = row;
    }

    /* First successful sign-in verifies the address. Everything else — codes,
       links, sessions — already required the inbox, but this is the flag the
       admin screen reads. */
    if (!login.email_verified_at) {
      await db.query('update logins set email_verified_at = now() where id = $1', [login.id]);
    }

    const session = await auth.createSession(login, req.req, { shopId: login.shop_id || null });

    const [body, headers] = withCookie(
      {
        ok: true,
        user: {
          name: login.name,
          email: login.email,
          role: login.role,
          shopId: login.shop_id,
        },
        next: login.role === 'super_admin' ? 'admin' : 'dashboard',
      },
      session.cookie
    );
    return { body, headers };
  });

  /* ---------------------------------------------------------------- link */

  /* The page at /auth/link/?token=… posts the token here. A GET would be
     simpler but would fire on every email-scanner prefetch, burning the link. */
  router.post('/api/auth/link', async (req, res) => {
    const login = await auth.redeemLink(String((req.body || {}).token || ''));
    if (!login) throw badRequest('That link has expired or was already used. Ask for a new one.');
    if (login.role !== 'owner') {
      throw badRequest('That link is for the platform console. Open /admin/link/.');
    }
    const session = await auth.createSession(login, req.req, { shopId: login.shop_id || null });
    const [body, headers] = withCookie(
      { ok: true, user: { name: login.name, email: login.email, role: login.role }, next: 'dashboard' },
      session.cookie
    );
    return { body, headers };
  });

  /* ------------------------------------------------------------- password */

  /* Setting or changing the password of the signed-in account. Reached from
     Settings, and the one path that gives an account created by SQL (the demo
     shop, the platform admin) a password for the first time. */
  router.post('/api/auth/password', async (req) => {
    if (!req.session) throw unauthorized();

    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (String(newPassword || '') !== String(confirmPassword || '')) {
      throw badRequest('The two passwords are not the same. Type them again.');
    }

    return auth.setPassword({
      login: { id: req.session.login_id },
      currentPassword,
      newPassword,
    });
  });

  /* -------------------------------------------------------------- session */

  router.get('/api/session', async (req) => {
    if (!req.session) return { signedIn: false };
    return {
      signedIn: true,
      user: {
        name: req.session.name,
        email: req.session.email,
        role: req.session.role,
        shopId: req.session.shop_id,
        shopName: req.session.shop_name,
      },
      session: {
        id: req.session.session_id,
        signedInAt: req.session.signed_in_at,
        expiresAt: req.session.expires_at,
      },
    };
  });

  router.post('/api/auth/signout', async (req) => {
    if (req.session) await auth.revokeSession(req.session.session_id);
    return [{ ok: true }, { 'set-cookie': auth.clearCookie() }];
  });

  /* The "devices signed in" list on the settings screen. A shop has one login
     but may be signed in on a phone and a laptop; seeing both is how a
     shopkeeper spots a device that is not theirs. */
  router.get('/api/sessions', async (req) => {
    const s = auth.requireOwner(req);
    const rows = await db.tx({ shopId: s.shop_id }, (c) =>
      db.manyIn(
        c,
        `select session_id, email, person, role, signed_in_at, last_seen_at, expires_at, ip, user_agent
           from v_active_sessions where shop_id = $1 order by last_seen_at desc`,
        [s.shop_id]
      )
    );
    return {
      sessions: rows.map((r) => ({
        id: r.session_id,
        email: r.email,
        person: r.person,
        thisDevice: r.session_id === s.session_id,
        signedInAt: r.signed_in_at,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at,
        ip: r.ip,
        device: r.user_agent,
      })),
    };
  });

  router.post('/api/sessions/:id/revoke', async (req) => {
    const s = auth.requireOwner(req);
    const row = await db.tx({ shopId: s.shop_id }, (c) =>
      db.oneIn(c, 'select id from sessions where id = $1 and shop_id = $2', [
        req.params.id,
        s.shop_id,
      ])
    );
    if (!row) throw notFound('That device is not signed in to this shop.');
    await auth.revokeSession(row.id);
    return { ok: true };
  });

  /* "Sign out everywhere else" — the one thing to do when a phone is lost. */
  router.post('/api/sessions/revoke-all', async (req) => {
    const s = auth.requireOwner(req);
    await auth.revokeAllSessions(s.login_id, { exceptId: s.session_id });
    return { ok: true };
  });
}

export { unauthorized, tooMany };
