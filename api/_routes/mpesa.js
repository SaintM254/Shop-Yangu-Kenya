/* ============================================================ api/_routes/mpesa.js

   M-Pesa, one till per shop.

   The thing that makes this per-shop rather than per-platform:

     · the shortcode, passkey, consumer key and consumer secret live in
       mpesa_tills, one row per shop (db/001_schema.sql, docs/05-mpesa.md);
     · each row has its own callback_secret, and the callback URL contains it:
       https://api.example.com/pay/<32 hex characters>
       so a callback that arrives proves which shop it belongs to;
     · the OAuth token is fetched with *that shop's* consumer key, and cached
       per shop, never globally. A shared token would send one shop's money
       prompts out under another shop's name.

   The URL avoids the words "mpesa", "m-pesa" and "safaricom": Safaricom's
   portal rejects callback URLs containing them. /pay/<secret> is the whole
   trick, and docs/05-mpesa.md explains it for whoever is registering the shortcode.

     POST /api/mpesa/prompt      owner asks for a prompt on a phone
     POST /pay/:secret           Safaricom's callback (no auth: it is Safaricom)
     GET  /api/mpesa/status/:id  the till polls this until the PIN is entered
     GET  /api/mpesa/tills       the shop's tills, without secrets
     POST /api/mpesa/tills       add a till
     PATCH /api/mpesa/tills/:id  change it / make it the default
     POST /api/mpesa/tills/:id/test  prove the credentials work
*/

import * as db from '../_lib/db.js';
import { env } from '../_lib/config.js';
import * as shape from '../_lib/shape.js';
import { requireOwner } from '../_lib/auth.js';
import { badRequest, notFound, forbidden, send, HttpError } from '../_lib/http.js';

/* Sandbox and production are different hosts with different rules. */
const BASE =
  env.MPESA_BASE_URL ||
  (env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke');

/* ------------------------------------------------------------------ tokens */

/* One cached Daraja token per shop. Safaricom's tokens last an hour; asking
   for a fresh one on every prompt is slow and gets rate-limited. */
const tokens = new Map(); /* tillId -> { token, expires } */

async function shopToken(tillId) {
  const cached = tokens.get(tillId);
  if (cached && cached.expires > Date.now() + 30_000) return cached.token;

  /* The credentials are read by a security-definer function, so the API role
     never sees them (see 003_rls.sql). */
  const creds = await db.one('select * from mpesa_credentials($1)', [tillId]);
  if (!creds) throw notFound('That till is not set up. Add it in Settings.');

  const basic = Buffer.from(`${creds.consumer_key}:${creds.consumer_secret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    /* No route to Safaricom: a wrong base URL, no internet, or a blocked
       outbound host. Say so, in words the shop can act on, rather than
       letting a fetch error reach them as "something went wrong". */
    throw new HttpError(
      502,
      'Could not reach Safaricom to start the payment (' +
        (err.cause?.code || err.message) +
        '). Check MPESA_ENV and the API host\'s internet connection.'
    );
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw badRequest(
      'Safaricom refused the shop\'s Daraja credentials (' +
        (body.errorMessage || body.error || res.status) +
        '). Check the consumer key and secret in Settings.'
    );
  }

  const ttl = Number(body.expires_in || 3599) * 1000;
  tokens.set(tillId, { token: body.access_token, expires: Date.now() + ttl });
  return body.access_token;
}

/* The timestamp Safaricom wants is Kenya time, not UTC, and not the server's
   timezone. Africa/Nairobi is UTC+3 with no daylight saving, so it is written
   out here rather than trusted to the host. */
export function kenyaTimestamp(d = new Date()) {
  const kenya = new Date(d.getTime() + 3 * 3600_000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    kenya.getUTCFullYear() +
    p(kenya.getUTCMonth() + 1) +
    p(kenya.getUTCDate()) +
    p(kenya.getUTCHours()) +
    p(kenya.getUTCMinutes()) +
    p(kenya.getUTCSeconds())
  );
}

/* 0712 345 678 and +254712345678 both become 254712345678. Safaricom accepts
   nothing else. */
export function normalizePhone(input) {
  let s = String(input || '').replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0')) s = '254' + s.slice(1);
  else if (s.startsWith('7') || s.startsWith('1')) s = '254' + s;
  return /^254(7|1)\d{8}$/.test(s) ? s : null;
}

/* ------------------------------------------------------------------ routes */

export default function (router) {
  /* --------------------------------------------------------- start a prompt */

  router.post('/api/mpesa/prompt', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};

    const phone = normalizePhone(b.phone);
    if (!phone) throw badRequest('Enter a Safaricom number like 0712 345 678.');

    const amount = Math.round(Number(b.amount));
    if (!(amount > 0)) throw badRequest('Enter the amount to collect.');
    if (amount > 250000) throw badRequest('Safaricom caps a single prompt at Ksh 250,000.');

    /* The till is the shop's own. Either the one asked for, or the default. */
    const till = await db.tx({ shopId: s.shop_id }, (c) =>
      b.tillId
        ? db.oneIn(c, 'select * from v_mpesa_tills where id = $1 and shop_id = $2 and active', [b.tillId, s.shop_id])
        : db.oneIn(
            c,
            `select * from v_mpesa_tills where shop_id = $1 and active
              order by is_default desc, created_at limit 1`,
            [s.shop_id]
          )
    );
    if (!till) throw badRequest('This shop has no M-Pesa till yet. Add one in Settings.');
    if (!till.configured) throw badRequest('That till is missing its Daraja credentials. Check Settings.');

    /* The account reference is what appears on the customer's message and on
       the shop's statement: the receipt number is the useful one. */
    const accountRef = String(b.ref || b.receipt || 'Shop Yangu').slice(0, 12);

    const start = await db.tx({ shopId: s.shop_id }, (c) =>
      /* One lateral call, not `select (fn()).*` — see the note in shop.js. */
      db.oneIn(c, `select s.* from mpesa_start($1,$2,$3,$4,$5) s`, [
        till.id,
        phone,
        amount,
        accountRef,
        b.saleId || null,
      ])
    );

    /* From here on the request row exists. If anything below fails — Safaricom
       refuses the credentials, the phone number is wrong, the network is down —
       it must not be left 'pending' forever: the till screen would poll a
       prompt that was never sent. */
    let token;
    try {
      token = await shopToken(till.id);
    } catch (err) {
      await db.query(
        `update mpesa_requests set status = 'failed', result_desc = $2 where id = $1`,
        [start.id, err.message]
      );
      throw err;
    }

    const timestamp = kenyaTimestamp();
    /* Base64(shortcode + passkey + timestamp), computed in the database so the
       passkey never leaves it. */
    const password = (
      await db.one('select mpesa_stk_password($1,$2) as p', [till.id, timestamp])
    ).p;

    const callback = `${(env.MPESA_CALLBACK_BASE || env.API_URL || '').replace(/\/$/, '')}/pay/${await callbackSecret(till.id)}`;

    const stk = {
      BusinessShortCode: Number(till.shortcode),
      /* "CustomerBuyGoodsOnline" for a Till (Buy Goods) number,
         "CustomerPayBillOnline" for a Paybill. Choosing the wrong one is the
         single most common reason a prompt does not arrive. */
      TransactionType: till.type === 'paybill' ? 'CustomerPayBillOnline' : 'CustomerBuyGoodsOnline',
      Amount: amount,
      PartyA: Number(phone),
      PartyB: Number(till.shortcode),
      PhoneNumber: Number(phone),
      CallBackURL: callback,
      AccountReference: accountRef,
      TransactionDesc: `Payment to ${s.shop_name || 'the shop'}`.slice(0, 60),
      Password: password,
      Timestamp: timestamp,
    };

    let res;
    try {
      res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(stk),
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      await db.query(
        `update mpesa_requests set status = 'failed', result_desc = $2 where id = $1`,
        [start.id, 'Could not reach Safaricom: ' + (err.cause?.code || err.message)]
      );
      throw new HttpError(502, 'Safaricom did not answer. The prompt was not sent — try again.');
    }

    const body = await res.json().catch(() => ({}));

    if (!res.ok || body.ResponseCode !== '0') {
      await db.query(
        `update mpesa_requests set status = 'failed', result_code = $2, result_desc = $3, raw = $4::jsonb
          where id = $1`,
        [start.id, Number(body.errorCode || res.status) || null, body.errorMessage || 'Rejected', JSON.stringify(body)]
      );
      throw badRequest(
        'Safaricom did not send the prompt: ' + (body.errorMessage || body.ResponseDescription || res.status)
      );
    }

    const updated = await db.query(
      `update mpesa_requests
          set checkout_request_id = $2, merchant_request_id = $3, raw = $4::jsonb
        where id = $1
        returning *`,
      [start.id, body.CheckoutRequestID, body.MerchantRequestID, JSON.stringify(body)]
    );

    return {
      ok: true,
      request: shape.mpesaRequest(updated.rows[0]),
      /* The till screen says "check the phone" and polls the status route. */
      message: `A prompt has gone to ${b.phone}. Enter the M-Pesa PIN to pay.`,
      customerMessage: body.CustomerMessage || '',
    };
  });

  /* -------------------------------------------------------------- callback */

  /* POST /pay/:secret
     Unauthenticated by design: this is Safaricom. The secret in the path is
     what identifies the shop, and the callback is only trusted for a request
     that exists, matches its amount, and has not already been settled. */
  router.post('/pay/:secret', async (req, res) => {
    const found = await db.one('select * from mpesa_till_by_secret($1)', [req.params.secret]);
    if (!found) {
      /* A wrong secret is either a scan or a misconfigured till. Either way,
         say nothing useful. */
      return [{ ResultCode: 1, ResultDesc: 'Unknown till' }, {}, 404];
    }

    /* Accept both the Daraja shape and a bare Body, so a test harness and the
       real thing both work. */
    const root = req.body || {};
    const stk = root.Body && root.Body.stkCallback ? root.Body.stkCallback : root;

    const checkoutId = stk.CheckoutRequestID || stk.checkoutRequestId;
    if (!checkoutId) return [{ ResultCode: 1, ResultDesc: 'Missing CheckoutRequestID' }, {}, 400];

    const resultCode = Number(stk.ResultCode);
    const meta = {};
    for (const item of (stk.CallbackMetadata && stk.CallbackMetadata.Item) || []) {
      meta[item.Name] = item.Value;
    }

    const receipt = meta.MpesaReceiptNumber || null;
    const paid = meta.Amount !== undefined ? Number(meta.Amount) : null;

    try {
      await db.query('select mpesa_complete($1,$2,$3,$4,$5,$6,$7::jsonb)', [
        checkoutId,
        Number.isFinite(resultCode) ? resultCode : -1,
        stk.ResultDesc || '',
        receipt,
        paid,
        meta.PhoneNumber ? String(meta.PhoneNumber) : null,
        JSON.stringify(root),
      ]);
    } catch (err) {
      /* Still answer 200: Safaricom retries a non-200, and a retry storm on a
         malformed callback helps nobody. The failure is in the log and in the
         audit table. */
      console.error('[mpesa] callback failed:', err.message);
    }

    /* Safaricom wants this exact body. Anything else and it counts as a
       failure and retries. */
    return [{ ResultCode: 0, ResultDesc: 'Accepted' }];
  });

  /* ---------------------------------------------------------------- status */

  router.get('/api/mpesa/status/:checkoutId', async (req) => {
    const s = requireOwner(req);
    const row = await db.tx({ shopId: s.shop_id }, (c) =>
      db.oneIn(c, 'select * from mpesa_requests where checkout_request_id = $1 and shop_id = $2', [
        req.params.checkoutId,
        s.shop_id,
      ])
    );
    if (!row) throw notFound('No such prompt.');
    return { request: shape.mpesaRequest(row) };
  });

  /* ----------------------------------------------------------------- tills */

  router.get('/api/mpesa/tills', async (req) => {
    const s = requireOwner(req);
    const rows = await db.tx({ shopId: s.shop_id }, (c) =>
      db.manyIn(c, 'select * from v_mpesa_tills where shop_id = $1 order by is_default desc, created_at', [
        s.shop_id,
      ])
    );
    return { tills: rows.map(shape.mpesaTill) };
  });

  router.post('/api/mpesa/tills', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};

    const shortcode = String(b.shortcode || '').replace(/\s/g, '');
    if (!/^\d{5,7}$/.test(shortcode)) {
      throw badRequest('The shortcode is 5 to 7 digits: the till or paybill number.');
    }
    if (!b.passkey || !b.consumerKey || !b.consumerSecret) {
      throw badRequest('A till needs its passkey, consumer key and consumer secret from Daraja.');
    }

    /* 32 hex characters of randomness. This is the only thing in an
       unauthenticated callback that proves which shop it belongs to. */
    const secret = await db.one(
      `select encode(sha256((random()::text || clock_timestamp()::text || gen_random_uuid()::text)::bytea), 'hex') as s`
    );

    try {
      const row = await db.query(
        `insert into mpesa_tills (shop_id, label, shortcode, type, passkey, consumer_key,
                                  consumer_secret, callback_secret, environment, is_default)
         values ($1,$2,$3,$4::mpesa_till_type,$5,$6,$7,$8,$9,$10)
         returning id`,
        [
          s.shop_id,
          String(b.label || 'Main till').trim(),
          shortcode,
          b.type === 'paybill' ? 'paybill' : 'till',
          String(b.passkey).trim(),
          String(b.consumerKey).trim(),
          String(b.consumerSecret).trim(),
          secret.s,
          b.environment === 'production' ? 'production' : 'sandbox',
          Boolean(b.isDefault),
        ]
      );

      const till = await db.tx({ shopId: s.shop_id }, (c) =>
        db.oneIn(c, 'select * from v_mpesa_tills where id = $1', [row.rows[0].id])
      );

      await db.query(
        `insert into audit_entries (shop_id, login_id, action, detail)
         values ($1,$2,'mpesa.till_added',$3)`,
        [s.shop_id, s.login_id, shortcode]
      );

      return {
        ok: true,
        till: shape.mpesaTill(till),
        /* Shown once, on screen, with a copy button: this is the URL to paste
           into the Daraja portal. It cannot be shown again — the API cannot
           read the secrets back. */
        callbackPath: '/pay/' + secret.s,
        callbackUrl: (env.MPESA_CALLBACK_BASE || env.API_URL || '').replace(/\/$/, '') + '/pay/' + secret.s,
      };
    } catch (err) {
      if (err.code === '23505') {
        throw badRequest('That shortcode is already set up for this shop.');
      }
      throw err;
    }
  });

  router.patch('/api/mpesa/tills/:id', async (req, res) => {
    const s = requireOwner(req);
    const b = req.body || {};

    return db.tx({ shopId: s.shop_id }, async (c) => {
      const before = await db.oneIn(c, 'select * from v_mpesa_tills where id = $1 and shop_id = $2', [
        req.params.id,
        s.shop_id,
      ]);
      if (!before) throw notFound('That till is not in this shop.');

      /* One default per shop: the partial unique index enforces it, so the old
         default has to step down in the same transaction. */
      if (b.isDefault) {
        await db.noneIn(c, 'update mpesa_tills set is_default = false where shop_id = $1', [s.shop_id]);
      }

      await db.noneIn(
        c,
        `update mpesa_tills set
           label = coalesce($3, label),
           active = coalesce($4, active),
           is_default = coalesce($5, is_default),
           environment = coalesce($6, environment),
           updated_at = now()
         where id = $1 and shop_id = $2`,
        [
          req.params.id,
          s.shop_id,
          b.label === undefined ? null : String(b.label),
          b.active === undefined ? null : Boolean(b.active),
          b.isDefault === undefined ? null : Boolean(b.isDefault),
          b.environment === undefined ? null : b.environment,
        ]
      );

      if (b.passkey || b.consumerKey || b.consumerSecret) {
        await db.noneIn(
          c,
          `update mpesa_tills set
             passkey = coalesce($3, passkey),
             consumer_key = coalesce($4, consumer_key),
             consumer_secret = coalesce($5, consumer_secret),
             updated_at = now()
           where id = $1 and shop_id = $2`,
          [req.params.id, s.shop_id, b.passkey || null, b.consumerKey || null, b.consumerSecret || null]
        );
        /* The old token was minted with the old key. */
        tokens.delete(req.params.id);
      }

      const row = await db.oneIn(c, 'select * from v_mpesa_tills where id = $1', [req.params.id]);
      return { ok: true, till: shape.mpesaTill(row) };
    });
  });

  /* Prove the credentials work without taking any money: fetch a token. */
  router.post('/api/mpesa/tills/:id/test', async (req) => {
    const s = requireOwner(req);
    const till = await db.tx({ shopId: s.shop_id }, (c) =>
      db.oneIn(c, 'select * from v_mpesa_tills where id = $1 and shop_id = $2', [req.params.id, s.shop_id])
    );
    if (!till) throw notFound('That till is not in this shop.');

    try {
      await shopToken(till.id);
      return { ok: true, message: 'Daraja accepted the credentials. Prompts will send normally.' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });
}

/* The callback path is the only place the secret is read, and the API cannot
   read the column directly: this function answers for one till at a time. */
async function callbackSecret(tillId) {
  const row = await db.one('select callback_secret($1) as s', [tillId]);
  return row.s;
}
