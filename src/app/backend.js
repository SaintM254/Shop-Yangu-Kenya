/* ============================================================ backend

   Where the data comes from, and where it will come from.

   Today: `S` is filled from the sample shop in data.js, in memory. Nothing
   leaves the browser.

   Next: a Postgres database (Neon or Supabase) behind a small HTTP API. The
   app already talks to the data through this file and nowhere else, so
   switching over means pointing `BACKEND.base` at the API and setting
   `BACKEND.live = true`. No screen, no export and no router changes:

     · `load()`   fills `S` before the first paint
     · `save()`   writes a change back (a sale, a product, the shop details)
     · `session()` who is signed in, from a cookie the API sets

   The shape `S` has today is the shape the API should return — it is the
   same shape the SQL in the spec creates:

     S.shop       one row             shops
     S.products   many rows           products
     S.customers  many rows           customers
     S.sales      many rows, nested   sales + sale_items + sale_payments
     S.pos        many rows, nested   purchase_orders + purchase_order_items
     S.audit      many rows           audit_log

   Rules the API has to keep, because the screen already assumes them:
     · money arrives as whole shillings (integers), never formatted strings
     · timestamps are ISO 8601 in UTC; the app formats them DD/MM/YY
     · `sale.total` includes VAT; `sale.credit` is what is still owed
     · a stock level is `product.qty` — the sale endpoint decrements it in
       the same transaction, so two tills cannot oversell the last packet

   Until then every write is local: `draft()` keeps the demo honest and the
   app never pretends a change was saved to a server it does not have. */

const BACKEND = {
  base: '', /* e.g. 'https://api.shopyangu.co.ke' */
  live: false,

  async request(pathname, opts) {
    const res = await fetch(this.base + pathname, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...opts,
    });
    if (!res.ok) throw new Error(pathname + ' → ' + res.status);
    return res.json();
  },

  /* Everything the app needs for its first paint, in one round trip. */
  async load() {
    if (!this.live) return null;
    return this.request('/api/bootstrap');
  },

  async session() {
    if (!this.live) return null;
    return this.request('/api/session');
  },

  /* A write. `kind` is the table the change belongs to. */
  async save(kind, payload) {
    if (!this.live) return { local: true };
    return this.request('/api/' + kind, { method: 'POST', body: JSON.stringify(payload) });
  },
};

/* Each write in the app calls this, so the day BACKEND.live turns true the
   data starts persisting without touching the screens. */
function persist(kind, payload) {
  BACKEND.save(kind, payload).catch(() => {
    toast('Saved on this device only — the server did not answer.', 'bad');
  });
}
