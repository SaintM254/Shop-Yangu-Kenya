/* ============================================================ backend

   Where the data comes from.

   It comes from the API: Neon Postgres behind a small Node server (see api/
   and docs/). This file is the only place in the app that knows that.

   Two modes:

     LIVE    the API answered. `S` is filled from /api/bootstrap before the
             first paint, and every write goes to the server.
     LOCAL   the API is not reachable. `S` stays as the sample shop from
             data.js, the till still works, and every write says so plainly
             instead of pretending it was saved.

   LOCAL is not a demo mode any more — it is what a shop sees when the
   connection drops mid-afternoon. That is why the screens all still render:
   the shopkeeper can keep selling and the changes are held in the browser
   until the connection comes back (see queue()).

   The shape `S` has is the shape the API returns, which is the shape data.js
   has always had. That was the point of building it this way: switching from
   local data to a real backend changed this file and nothing on screen.

     S.shop       { name, branch, phone, kra, plan }
     S.user       { name, email, role }
     S.settings   { allowCredit, askCustomer, smsReceipt, offline }
     S.cats       ['Drinks', …]
     S.products   [{ id, sku, name, cat, unit, cost, price, qty, reorder, exp }]
     S.customers  [{ id, name, phone, limit, bal, since }]
     S.sales      [{ no, at, items[], total, paid[{m,amt}], credit, etims{status} }]
     S.pos        [{ no, supplier, at, status, total, lines }]
     S.expenses   [{ id, at, what, amt, cat }]
     S.ledger     [{ at, customer, amt, m }]
     S.audit      [{ at, who, what, detail }]

   Rules the API keeps, because the screens assume them:
     · money arrives as a number of shillings, never a formatted string
     · timestamps are ISO 8601 in UTC; the app formats them DD/MM/YY
     · `sale.total` includes VAT; `sale.credit` is what is still owed
     · a stock level is `product.qty` — the API decrements it in the same
       transaction as the sale, so two tills cannot oversell the last packet */

const BACKEND = {
  /* Empty means same origin, which is how it runs in development (the API
     serves the built site) and how it runs behind a proxy. On GitHub Pages the
     site has no API of its own, so build.js writes the host in here from
     API_URL — see docs/03-link-the-page.md. */
  base: typeof window !== 'undefined' && window.SYK_API ? window.SYK_API : '',

  /* Set by load(): true when the API answered. */
  live: false,

  /* Why it is not live, for the banner. */
  problem: '',

  async request(pathname, opts = {}) {
    const res = await fetch(this.base + pathname, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...opts,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || pathname + ' → ' + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  /* Everything the app needs for its first paint, in one round trip. */
  async load() {
    try {
      const data = await this.request('/api/bootstrap');
      this.live = true;
      this.problem = '';
      return data;
    } catch (err) {
      this.live = false;
      this.problem = err.status === 401
        ? 'signed-out'
        : 'The shop server is not answering. Showing the copy saved on this device.';
      return null;
    }
  },

  async session() {
    try {
      return await this.request('/api/session');
    } catch (err) {
      return { signedIn: false };
    }
  },

  async signOut() {
    try {
      await this.request('/api/auth/signout', { method: 'POST' });
    } catch (err) {
      /* Signing out locally is still correct: the cookie may already be gone. */
    }
  },

  async save(kind, payload) {
    if (!this.live) throw new Error('offline');
    return this.request('/api/' + kind, { method: 'POST', body: JSON.stringify(payload) });
  },

  async patch(pathname, payload) {
    return this.request(pathname, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async get(pathname) {
    return this.request(pathname);
  },
};

/* Fill `S` (declared in data.js) from the API's answer. Anything the API did
   not send keeps its sample value, so a half-filled response cannot blank a
   screen. */
function applyBootstrap(data) {
  if (!data) return;
  const set = (key, value) => {
    if (value !== undefined && value !== null) S[key] = value;
  };
  set('shop', data.shop);
  set('user', data.user);
  set('settings', data.settings);
  set('cats', data.cats && data.cats.length ? data.cats : S.cats);
  /* The ids behind those names: a product is saved with its category id, and
     the form only ever shows the name. */
  if (Array.isArray(data.categories)) {
    S.categories = data.categories;
    S.catIds = Object.fromEntries(data.categories.map((c) => [c.name, c.id]));
  }
  set('products', data.products);
  set('customers', data.customers);
  set('suppliers', data.suppliers);
  set('sales', data.sales);
  set('pos', data.pos);
  set('expenses', data.expenses);
  set('ledger', data.ledger);
  set('audit', data.audit);
  /* Kept for the dashboard's "today" card and the reports. */
  S.takings = data.takings || [];
  S.tills = data.tills || [];
  S.fresh = Boolean(data.fresh);
}

/* ------------------------------------------------------------------ writes

   Every write in the app goes through here, so the day the API is behind this
   there is exactly one place that knows what to do when it does not answer.

   A sale is the one that matters. It is written optimistically to `S` (so the
   till never waits for a network round trip to show a receipt), then posted.
   If the post fails, it is queued and the shop is told. The queue is replayed
   when the connection returns.

   What the queue cannot do is fix a sale the server refused — overselling the
   last packet, or a credit limit. In those cases the sale is in `S` but not on
   the server, and the toast says so. That is honest, and it is the only
   behaviour that does not lose the shop's money.

   Nothing here retries a sale with a *new* receipt number: the API numbers
   receipts itself, so a replayed sale is the same sale. */

const QUEUE_KEY = 'syk-outbox-v1';

function queueRead() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch (err) {
    return [];
  }
}

function queueWrite(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (err) {
    /* A full quota must not lose the sale that is on screen. */
  }
  paintOutbox();
}

/* `__id` rides along when the write was an update rather than an insert, so a
   queued edit replays as a PATCH against the same row. */
function queueAdd(kind, payload) {
  const items = queueRead();
  items.push({ kind, payload, at: new Date().toISOString() });
  queueWrite(items);
}

/* The badge in the rail's foot, so "not saved yet" is visible without a toast
   nobody read. */
function paintOutbox() {
  const n = queueRead().length;
  const badge = document.querySelector('[data-outbox]');
  if (!badge) return;
  badge.hidden = n === 0;
  badge.textContent = n === 1 ? '1 change not sent' : n + ' changes not sent';
}

async function queueFlush() {
  const items = queueRead();
  if (!items.length || !BACKEND.live) return { sent: 0, left: items.length };

  const left = [];
  let sent = 0;

  for (const item of items) {
    try {
      const id = item.payload && item.payload.__id;
      await (id !== undefined
        ? BACKEND.patch('/api/' + item.kind + '/' + encodeURIComponent(id), item.payload)
        : item.kind === 'settings' || item.kind === 'shop'
        ? BACKEND.patch('/api/' + item.kind, item.payload)
        : BACKEND.save(item.kind, item.payload));
      sent++;
    } catch (err) {
      /* A 4xx is a refusal, not a connection problem: replaying it forever
         would loop on a sale the server will never accept. Drop it and say
         what was dropped. */
      if (err.status && err.status >= 400 && err.status < 500) {
        toast(
          'A saved change was refused by the server and could not be sent: ' +
            (err.message || 'unknown reason'),
          'bad'
        );
      } else {
        left.push(item);
      }
    }
  }

  queueWrite(left);
  return { sent, left: left.length };
}

/* Every write in the app funnels through here.

   `kind` is the API path after /api/ — 'sales', 'products', 'customers',
   'expenses', 'settings', 'shop' — so the route and the call cannot drift
   apart. An update passes the id as the third argument and becomes a PATCH;
   everything else is a POST.

   Returns the server's answer, or null when it did not happen. A null is not
   an error for the caller to handle: the screens have already shown the
   change optimistically and the toast has told the truth about where it went. */
function persist(kind, payload, id) {
  const send = () => {
    if (id !== undefined) return BACKEND.patch('/api/' + kind + '/' + encodeURIComponent(id), payload);
    /* These have no collection to post to: a shop has one set of settings and
       one profile, so they are edited in place. */
    if (kind === 'settings' || kind === 'shop') return BACKEND.patch('/api/' + kind, payload);
    return BACKEND.save(kind, payload);
  };

  return send().then(
    (result) => {
      /* A sale is the only write with something to hand back: the server's
         receipt number is the one that goes on the paper. */
      if (result && result.sale) replaceLocalSale(payload, result.sale, result.stock);
      /* A new product or customer gets the server's id, so the next write
         about it — a stock adjustment, a credit payment — refers to a row that
         exists. Without this the local id is invented and every follow-up
         write 404s. */
      if (result && result.product && payload.__local) adoptId(payload.__local, result.product, 'products');
      if (result && result.customer && payload.__local) adoptId(payload.__local, result.customer, 'customers');
      return result;
    },
    (err) => {
      if (err.status && err.status >= 400 && err.status < 500) {
        /* The server said no, and said why. Put the change back? No: the
           goods have already left the counter, the customer is standing there.
           Keep it local, tell the truth, and let the outbox badge show it as
           unsent. */
        queueAdd(kind, { ...payload, __id: id });
        toast('Not saved on the server: ' + err.message, 'bad');
        paintOutbox();
        return null;
      }
      queueAdd(kind, { ...payload, __id: id });
      toast('Saved on this device only — the server did not answer. It will send when it can.', 'bad');
      paintOutbox();
      return null;
    }
  );
}

/* The local row was created with a made-up id ('p8x'); the server has the real
   one. Swap it in place so the row on screen keeps its position. */
function adoptId(localId, serverRow, key) {
  const list = S[key];
  if (!Array.isArray(list) || !serverRow || !serverRow.id) return;
  const at = list.findIndex((x) => x.id === localId);
  if (at < 0) return;
  list[at] = { ...list[at], ...serverRow, id: serverRow.id };
}

/* The API numbered the receipt and moved the stock. Swap the optimistic local
   sale for the server's, so the receipt the customer is holding has the right
   number on it. */
function replaceLocalSale(payload, sale, stock) {
  if (!S.sales) return;
  const local = S.sales.find(
    (s) => s.no === (payload.sale && payload.sale.no) || s.pending
  );
  if (local) {
    Object.assign(local, sale, { pending: false });
  }
  if (Array.isArray(stock)) {
    stock.forEach((row) => {
      const p = S.products.find((x) => x.id === row.id);
      if (p) p.qty = row.qty;
    });
  }
}

/* Try the queue whenever the app comes back to life. */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    queueFlush().then((r) => {
      if (r.sent) toast(r.sent === 1 ? 'Saved sale sent.' : r.sent + ' saved sales sent.', 'good');
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    paintOutbox();
    /* Ten seconds after the first paint: the bootstrap request has had its
       chance, and a shop that opened the app while offline should not wait. */
    setTimeout(() => {
      if (BACKEND.live && queueRead().length) {
        queueFlush().then((r) => {
          if (r.sent) toast(r.sent + ' saved sales sent.', 'good');
        });
      }
    }, 10000);
  });
}
