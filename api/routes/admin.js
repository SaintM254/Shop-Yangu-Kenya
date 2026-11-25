/* ============================================================ api/routes/admin.js

   The super-admin console: who is signed in, which shops exist, what they are
   selling, and the ability to pause a shop that has stopped paying.

   Three defences, because this is the one account that reads every shop:

     1. the session's role must be super_admin — checked here, on every route;
     2. the SQL functions behind these reads (admin_shops, admin_sessions,
        admin_totals in 003_rls.sql) refuse unless the transaction also set
        syk.super_admin = 'on';
     3. the role is a single row with shop_id null, enforced by a check
        constraint, and there is no route anywhere that can create one. A new
        super admin is made with db/004_seed_demo.sql, at the database.

   A super admin signs in the same way as a shop — email code or link — but
   the links point at /admin/, and no shop screen accepts the session.

     POST /api/admin/signin        email → code and link
     POST /api/admin/signin/verify code or token → session
     POST /api/admin/link          the token from /admin/link/
     GET  /api/admin/overview      totals + every shop
     GET  /api/admin/logins        who is logged in now
     GET  /api/admin/shops/:id     one shop in detail
     POST /api/admin/shops/:id/pause
     POST /api/admin/shops/:id/resume
     POST /api/admin/sessions/:id/end
     GET  /api/admin/notes         notes about a shop
     POST /api/admin/notes
*/

import * as db from '../lib/db.js';
import { env } from '../lib/config.js';
import * as auth from '../lib/auth.js';
import * as shape from '../lib/shape.js';
import * as emails from '../lib/emails.js';
import { sendMail } from '../lib/mail.js';
import { requireSuperAdmin, requireSession } from '../lib/auth.js';
import { badRequest, notFound, forbidden, unauthorized } from '../lib/http.js';

const asAdmin = (ctx) => ({ superAdmin: true, shopId: ctx ? ctx.shop_id : null });

export default function (router) {
  /* --------------------------------------------------------------- sign-in */

  router.post('/api/admin/signin', async (req) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!auth.looksLikeEmail(email)) throw badRequest('That does not look like an email address.');

    const login = await db.one(
      `select id, name, role from logins where email = $1 and role = 'super_admin'`,
      [email]
    );

    /* An owner's address is not a super admin. Answer the same way either
       way: this endpoint should not tell anyone which addresses are admins. */
    if (!login) {
      return { ok: true, next: 'verify', email, note: 'If that address is an admin, the code is on its way.' };
    }

    const code = await auth.issueCode(login.id, 'signin');
    const { token } = await auth.issueLink(login.id, 'signin');

    await sendMail({
      ...emails.adminSigninEmail({
        code,
        link: auth.linkUrl('/admin/link/', token),
        personName: login.name,
        minutes: env.OTP_MINUTES,
      }),
      to: email,
    });

    return { ok: true, next: 'verify', email };
  });

  router.post('/api/admin/signin/verify', async (req, res) => {
    const { email, code, token } = req.body || {};
    let login;

    if (token) {
      login = await auth.redeemLink(token);
      if (!login) throw badRequest('That link has expired or was already used.');
    } else {
      const clean = String(email || '').trim().toLowerCase();
      const row = await db.one(
        `select id, name, email::text as email, role, email_verified_at
           from logins where email = $1 and role = 'super_admin'`,
        [clean]
      );
      if (!row) throw badRequest('That code is not right.');
      if (!(await auth.redeemCode(row.id, String(code || '')))) {
        throw badRequest('That code is not right. Check the newest email.');
      }
      login = row;
    }

    if (login.role !== 'super_admin') throw forbidden('That account is not a super admin.');

    if (!login.email_verified_at) {
      await db.query('update logins set email_verified_at = now() where id = $1', [login.id]);
    }

    /* No shop on the session: an admin is not signed in *to* a shop. */
    const session = await auth.createSession(login, req.req, { shopId: null });

    await db.query(
      `insert into audit_entries (shop_id, login_id, action, detail)
       values (null, $1, 'admin.signed_in', null)`,
      [login.id]
    );

    return [
      { ok: true, user: { name: login.name, email: login.email, role: login.role }, next: 'admin' },
      { 'set-cookie': session.cookie },
    ];
  });

  router.post('/api/admin/link', async (req, res) => {
    const login = await auth.redeemLink(String((req.body || {}).token || ''));
    if (!login) throw badRequest('That link has expired or was already used.');
    if (login.role !== 'super_admin') throw forbidden('That link is not for the console.');

    const session = await auth.createSession(login, req.req, { shopId: null });
    return [
      { ok: true, next: 'admin' },
      { 'set-cookie': session.cookie },
    ];
  });

  /* -------------------------------------------------------------- overview */

  router.get('/api/admin/overview', async (req) => {
    const s = requireSuperAdmin(req);

    const data = await db.tx({ superAdmin: true }, async (c) => {
      const [totals, shops, sessions] = await Promise.all([
        db.oneIn(c, 'select * from admin_totals()'),
        db.manyIn(c, 'select * from admin_shops()'),
        db.manyIn(c, 'select * from admin_sessions(true)'),
      ]);
      return { totals, shops, sessions };
    });

    return {
      admin: { name: s.name, email: s.email },
      totals: shape.adminTotals(data.totals),
      shops: data.shops.map(shape.adminShop),
      sessions: data.sessions.map(shape.adminSession),
      generatedAt: new Date().toISOString(),
    };
  });

  /* "Who is logged in" on its own, for the auto-refresh. */
  router.get('/api/admin/logins', async (req) => {
    requireSuperAdmin(req);
    const liveOnly = String((req.query || {}).all || '') !== '1';
    const rows = await db.tx({ superAdmin: true }, (c) =>
      db.manyIn(c, 'select * from admin_sessions($1)', [liveOnly])
    );
    return { sessions: rows.map(shape.adminSession), liveOnly };
  });

  /* ------------------------------------------------------------------ shops */

  router.get('/api/admin/shops/:id', async (req) => {
    requireSuperAdmin(req);

    const data = await db.tx({ superAdmin: true }, async (c) => {
      const shop = await db.oneIn(c, 'select * from shops where id = $1', [req.params.id]);
      if (!shop) return null;

      const owner = await db.oneIn(
        c,
        `select id, email::text as email, name, role, last_seen_at, created_at
           from logins where shop_id = $1 and role = 'owner'`,
        [shop.id]
      );
      const sessions = await db.manyIn(
        c,
        `select * from admin_sessions(true) where shop_id = $1`,
        [shop.id]
      );
      const tills = await db.manyIn(c, 'select * from v_mpesa_tills where shop_id = $1', [shop.id]);
      const days = await db.manyIn(
        c,
        `select * from v_daily_takings where shop_id = $1 order by sold_on desc limit 30`,
        [shop.id]
      );
      const products = await db.oneIn(
        c,
        'select count(*)::int as n, coalesce(sum(qty * cost_price), 0) as value from products where shop_id = $1 and active',
        [shop.id]
      );
      const notes = await db.manyIn(
        c,
        `select n.*, l.name as author from admin_notes n
           left join logins l on l.id = n.created_by
          where n.shop_id = $1 order by n.created_at desc`,
        [shop.id]
      );

      return { shop, owner, sessions, tills, days, products, notes };
    });

    if (!data) throw notFound('No such shop.');

    return {
      shop: {
        ...shape.shop(data.shop),
        ownerEmail: data.owner ? data.owner.email : '',
        ownerName: data.owner ? data.owner.name : '',
        ownerSince: data.owner ? data.owner.created_at : null,
        suspendedReason: data.shop.suspended_reason || '',
      },
      sessions: data.sessions.map(shape.adminSession),
      tills: data.tills.map(shape.mpesaTill),
      products: { count: data.products.n, stockValue: Number(data.products.value) },
      takings: data.days.map((d) => ({
        on: String(d.sold_on).slice(0, 10),
        receipts: Number(d.receipts),
        gross: Number(d.gross),
        vat: Number(d.vat),
        credit: Number(d.credit),
      })),
      notes: data.notes.map((n) => ({
        id: n.id,
        note: n.note,
        author: n.author || 'Admin',
        at: n.created_at,
      })),
    };
  });

  router.post('/api/admin/shops/:id/pause', async (req) => {
    const s = requireSuperAdmin(req);
    const reason = String((req.body || {}).reason || 'Paused by the platform admin');

    const row = await db.tx({ superAdmin: true }, (c) =>
      db.oneIn(
        c,
        `update shops set suspended_at = now(), suspended_reason = $2
          where id = $1 and suspended_at is null
          returning id, name`,
        [req.params.id, reason]
      )
    );
    if (!row) throw notFound('No such shop, or it is already paused.');

    /* Every session out, immediately. A pause that leaves the till open is not
       a pause. */
    await db.query('update sessions set revoked_at = now() where shop_id = $1 and revoked_at is null', [
      row.id,
    ]);
    await db.query(
      `insert into audit_entries (shop_id, login_id, action, detail)
       values ($1, $2, 'admin.shop_paused', $3)`,
      [row.id, s.login_id, reason]
    );

    return { ok: true, shop: { id: row.id, name: row.name, suspended: true } };
  });

  router.post('/api/admin/shops/:id/resume', async (req) => {
    const s = requireSuperAdmin(req);
    const row = await db.tx({ superAdmin: true }, (c) =>
      db.oneIn(
        c,
        `update shops set suspended_at = null, suspended_reason = null
          where id = $1 and suspended_at is not null
          returning id, name`,
        [req.params.id]
      )
    );
    if (!row) throw notFound('No such shop, or it is not paused.');

    await db.query(
      `insert into audit_entries (shop_id, login_id, action, detail)
       values ($1, $2, 'admin.shop_resumed', null)`,
      [row.id, s.login_id]
    );
    return { ok: true, shop: { id: row.id, name: row.name, suspended: false } };
  });

  /* --------------------------------------------------------------- sessions */

  router.post('/api/admin/sessions/:id/end', async (req) => {
    const s = requireSuperAdmin(req);
    const row = await db.tx({ superAdmin: true }, (c) =>
      db.oneIn(c, 'select id, login_id, shop_id from sessions where id = $1', [req.params.id])
    );
    if (!row) throw notFound('No such session.');

    await auth.revokeSession(row.id);
    await db.query(
      `insert into audit_entries (shop_id, login_id, action, detail)
       values ($1, $2, 'admin.session_ended', $3)`,
      [row.shop_id, s.login_id, String(row.id).slice(0, 8)]
    );
    return { ok: true };
  });

  /* ------------------------------------------------------------------ notes */

  router.post('/api/admin/notes', async (req) => {
    const s = requireSuperAdmin(req);
    const b = req.body || {};
    if (!String(b.note || '').trim()) throw badRequest('Write the note first.');

    const row = await db.tx({ superAdmin: true }, (c) =>
      db.oneIn(
        c,
        `insert into admin_notes (shop_id, login_id, note, created_by)
         values ($1, $2, $3, $4) returning *`,
        [b.shopId || null, b.loginId || null, String(b.note).trim(), s.login_id]
      )
    );
    return { ok: true, note: { id: row.id, note: row.note, at: row.created_at } };
  });
}
