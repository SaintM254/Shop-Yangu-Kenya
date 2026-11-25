/* ============================================================ api/routes/auth.js

   The door.

   POST /api/auth/signup          shop name, person, email → an email with a
                                 code and a link. No account exists yet.
   POST /api/auth/signup/verify   the code, or the link's token → the shop
                                 exists, and the session cookie is set
   POST /api/auth/signin          email → a code and a link, if the address is
                                 known (same response either way)
   POST /api/auth/signin/verify   the code, or the token → signed in
   POST /api/auth/link            GET /auth/link?token=… on the site posts here
   POST /api/auth/signout         ends this session
   GET  /api/session              who am I
   GET  /api/sessions             this shop's other signed-in devices
   POST /api/sessions/:id/revoke  end one of them

   No passwords. The brief asks for email codes and sign-in links, and a
   password is a second thing to forget, reset and leak.
*/

import * as db from '../lib/db.js';
import { env } from '../lib/config.js';
import * as auth from '../lib/auth.js';
import { sendMail } from '../lib/mail.js';
import * as emails from '../lib/emails.js';
import { badRequest, notFound, unauthorized, send, tooMany, HttpError } from '../lib/http.js';

/* The cookie is set by the handler, which is why these routes get `res`. */
const withCookie = (body, cookieLine) => [body, { 'set-cookie': cookieLine }];

export default function (router) {
  /* ------------------------------------------------------------- sign-up */

  router.post('/api/auth/signup', async (req) => {
    const { shop, name, email } = req.body || {};

    const result = await auth.startSignup({ email, shopName: shop, personName: name });

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

    const mail = emails.signupEmail({
      code: result.code,
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
