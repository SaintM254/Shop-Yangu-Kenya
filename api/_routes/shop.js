/* ============================================================ api/_routes/shop.js

   The writing half of the app: sales, stock, products, customers, suppliers,
   purchases, expenses and credit payments.

   Two rules hold throughout, and they are why some of these routes look
   longer than they need to:

     · money is written through a function, not assembled in JavaScript.
       record_sale() computes VAT, numbers the receipt, writes the lines,
       decrements stock and queues the eTIMS row in one transaction. This file
       decides *who* may call it, never *what* it does.

     · the shop is scoped by the session, never by the request body. A caller
       cannot post shop_id and reach another duka: the id comes from the
       cookie, and row-level security checks it again.
*/

import * as db from '../_lib/db.js';
import * as shape from '../_lib/shape.js';
import { requireOwner } from '../_lib/auth.js';
import { badRequest, notFound, conflict } from '../_lib/http.js';

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const int = (v, d = 0) => Math.trunc(num(v, d));

/* Map a database error to something a shopkeeper can act on. The functions in
   002_functions.sql already raise good messages ("not enough stock for Sugar
   2kg: 1 left, tried to take 5"); this keeps them and translates the
   constraint names nobody should have to read. */
function asFriendly(err) {
  if (err.code === '23505' || err.code === '23505') return conflict('That already exists.');
  if (err.code === '23503') return badRequest('That refers to something that no longer exists.');
  if (err.code === '23514') return badRequest(err.message);
  if (err.code === 'P0001' || err.code === 'P0002') return badRequest(err.message);
  if (err.code === 'KD002' || /not enough stock/i.test(err.message)) return conflict(err.message);
  if (err.code === 'KD001' || /credit limit|needs a named customer|must total more/i.test(err.message)) {
    return badRequest(err.message);
  }
  return err;
}

export default function (router) {
  /* ---------------------------------------------------------------- sales */

  /* POST /api/sales
     Body: { items: [{ id, name, qty, price, cost }], paid: [{ m, amt }],
             customer: 'c1' | null }
     Everything else — receipt number, VAT, totals, stock — is the database's
     job, so two tills cannot disagree. */
  router.post('/api/sales', async (req) => {
    const s = requireOwner(req);
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw badRequest('A sale needs at least one item.');

    /* `receipt` is what the till printed while it waited. The server still
       numbers the receipt itself — two tills cannot both be right — but it is
       returned so the app can show the real one on the same card instead of a
       number that was never recorded anywhere. */
    const lines = shape.saleLinesFor(items);
    const payments = shape.salePaymentsFor(body.paid || []);
    const customer = body.customer && body.customer !== 'c6' ? body.customer : null;

    try {
      const sale = await db.tx({ shopId: s.shop_id }, async (c) => {
        const row = await db.oneIn(
          c,
          /* `select (fn()).*` would re-run the function once per output
             column — thirteen times, thirteen receipts. A lateral join calls
             it once. */
          `select s.* from record_sale($1, $2, $3, $4::jsonb, $5::jsonb) s`,
          [s.shop_id, s.login_id, customer, JSON.stringify(lines), JSON.stringify(payments)]
        );

        /* Read it back through the view so the response has the same shape as
           /api/bootstrap: payments folded in, line count, eTIMS status. */
        return db.oneIn(
          c,
          `select v.*, e.status as etims_status, e.signature as etims_signature
             from v_sales v
             left join lateral (
               select t.status, t.signature from etims_transmissions t
                where t.sale_id = v.id order by t.created_at desc limit 1
             ) e on true
            where v.id = $1`,
          [row.id]
        );
      });

      const lines2 = await db.tx({ shopId: s.shop_id }, (c) =>
        db.manyIn(c, 'select * from sale_lines where sale_id = $1', [sale.id])
      );

      /* The shelf count after the sale, so the till can update without a
         reload. Read after the commit: the numbers are final now. */
      const stock = await db.tx({ shopId: s.shop_id }, (c) =>
        db.manyIn(
          c,
          'select id, qty, name from products where id = any($1::uuid[])',
          [lines.filter((l) => l.product_id).map((l) => l.product_id)]
        )
      );

      return {
        ok: true,
        sale: shape.sale(sale, lines2),
        stock: stock.map((p) => ({ id: p.id, name: p.name, qty: num(p.qty) })),
      };
    } catch (err) {
      throw asFriendly(err);
    }
  });

  /* GET /api/sales?from=&to=&limit=&offset= — the sales screen's paging. */
  router.get('/api/sales', async (req) => {
    const s = requireOwner(req);
    const q = req.query || {};
    const limit = Math.min(int(q.limit, 60), 500);
    const offset = Math.max(int(q.offset, 0), 0);

    const rows = await db.tx({ shopId: s.shop_id }, (c) =>
      db.manyIn(
        c,
        `select v.*, e.status as etims_status, e.signature as etims_signature
           from v_sales v
           left join lateral (
             select t.status, t.signature from etims_transmissions t
              where t.sale_id = v.id order by t.created_at desc limit 1
           ) e on true
          where v.shop_id = $1
            and ($2::date is null or v.sold_on >= $2::date)
            and ($3::date is null or v.sold_on <= $3::date)
          order by v.sold_at desc
          limit $4 offset $5`,
        [s.shop_id, q.from || null, q.to || null, limit, offset]
      )
    );

    const ids = rows.map((r) => r.id);
    const lines = ids.length
      ? await db.tx({ shopId: s.shop_id }, (c) =>
          db.manyIn(c, 'select * from sale_lines where sale_id = any($1::uuid[])', [ids])
        )
      : [];
    const bySale = new Map();
    for (const l of lines) {
      if (!bySale.has(l.sale_id)) bySale.set(l.sale_id, []);
      bySale.get(l.sale_id).push(l);
    }

    return {
      sales: rows.map((r) => shape.sale(r, bySale.get(r.id) || [])),
      limit,
      offset,
      more: rows.length === limit,
    };
  });

  router.get('/api/sales/:id', async (req) => {
    const s = requireOwner(req);
    const row = await db.tx({ shopId: s.shop_id }, (c) =>
      db.oneIn(c, 'select * from v_sales where id = $1 and shop_id = $2', [req.params.id, s.shop_id])
    );
    if (!row) throw notFound('That receipt is not in this shop.');
    const lines = await db.tx({ shopId: s.shop_id }, (c) =>
      db.manyIn(c, 'select * from sale_lines where sale_id = $1', [row.id])
    );
    return { sale: shape.sale(row, lines) };
  });

  /* -------------------------------------------------------------- products */

  router.post('/api/products', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    if (!String(b.name || '').trim()) throw badRequest('Give the product a name.');

    try {
      return await db.tx({ shopId: s.shop_id }, async (c) => {
        const row = await db.oneIn(
          c,
          `insert into products (shop_id, category_id, sku, name, unit, cost_price,
                                 selling_price, reorder_level, expiry_date, barcode)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           returning *`,
          [
            s.shop_id,
            b.categoryId || null,
            String(b.sku || autoSku(b)).trim().toUpperCase(),
            String(b.name).trim(),
            String(b.unit || 'piece').trim(),
            num(b.cost),
            num(b.price),
            num(b.reorder),
            b.exp ? String(b.exp).slice(0, 10) : null,
            b.barcode || null,
          ]
        );

        /* Opening stock, through the ledger, so the count can be explained. */
        const opening = num(b.qty);
        if (opening) {
          await db.noneIn(
            c,
            `select apply_stock($1,$2,$3,'import','Opening stock',$4,$5,true)`,
            [s.shop_id, row.id, opening, null, s.login_id]
          );
        }

        await db.noneIn(
          c,
          `insert into audit_entries (shop_id, login_id, action, detail)
           values ($1,$2,'product.added',$3)`,
          [s.shop_id, s.login_id, row.name]
        );

        const fresh = await db.oneIn(c, 'select * from products where id = $1', [row.id]);
        return { ok: true, product: shape.product(fresh) };
      });
    } catch (err) {
      throw asFriendly(err);
    }
  });

  router.patch('/api/products/:id', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};

    return db.tx({ shopId: s.shop_id }, async (c) => {
      const before = await db.oneIn(c, 'select * from products where id = $1 and shop_id = $2', [
        req.params.id,
        s.shop_id,
      ]);
      if (!before) throw notFound('That product is not in this shop.');

      const row = await db.oneIn(
        c,
        `update products set
           name = coalesce($3, name),
           sku  = coalesce($4, sku),
           unit = coalesce($5, unit),
           category_id = coalesce($6, category_id),
           cost_price = coalesce($7, cost_price),
           selling_price = coalesce($8, selling_price),
           reorder_level = coalesce($9, reorder_level),
           expiry_date = coalesce($10, expiry_date),
           barcode = coalesce($11, barcode)
         where id = $1 and shop_id = $2
         returning *`,
        [
          req.params.id,
          s.shop_id,
          b.name === undefined ? null : String(b.name).trim(),
          b.sku === undefined ? null : String(b.sku).trim().toUpperCase(),
          b.unit === undefined ? null : String(b.unit),
          b.categoryId === undefined ? null : b.categoryId,
          b.cost === undefined ? null : num(b.cost),
          b.price === undefined ? null : num(b.price),
          b.reorder === undefined ? null : num(b.reorder),
          b.exp === undefined ? null : b.exp ? String(b.exp).slice(0, 10) : null,
          b.barcode === undefined ? null : b.barcode,
        ]
      );

      /* A price change is a fact about the shop, not a secret: record it. */
      if (b.price !== undefined && num(b.price) !== num(before.selling_price)) {
        await db.noneIn(
          c,
          `insert into audit_entries (shop_id, login_id, action, detail)
           values ($1,$2,'product.price_changed',$3)`,
          [s.shop_id, s.login_id, `${before.name}: ${before.selling_price} → ${num(b.price)}`]
        );
      }

      return { ok: true, product: shape.product(row) };
    });
  });

  /* Deleting a product would orphan its sale lines. Deactivate instead: the
     receipt still prints the name, the till stops offering it. */
  router.delete('/api/products/:id', async (req) => {
    const s = requireOwner(req);
    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        `update products set active = false, updated_at = now()
          where id = $1 and shop_id = $2 returning id, name`,
        [req.params.id, s.shop_id]
      );
      if (!row) throw notFound('That product is not in this shop.');
      await db.noneIn(
        c,
        `insert into audit_entries (shop_id, login_id, action, detail)
         values ($1,$2,'product.retired',$3)`,
        [s.shop_id, s.login_id, row.name]
      );
      return { ok: true };
    });
  });

  /* A stock correction: +5 found, -2 broken, both with a reason. */
  router.post('/api/stock/adjust', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    const change = num(b.change);
    if (!change) throw badRequest('Enter how many to add or take away.');
    const reason = ['adjustment', 'return', 'purchase', 'import'].includes(b.reason)
      ? b.reason
      : 'adjustment';

    try {
      return await db.tx({ shopId: s.shop_id }, async (c) => {
        const qty = await db.oneIn(
          c,
          'select apply_stock($1,$2,$3,$4::stock_reason,$5,$6,$7,false) as qty',
          [s.shop_id, b.productId, change, reason, b.note || null, null, s.login_id]
        );
        return { ok: true, qty: num(qty.qty) };
      });
    } catch (err) {
      throw asFriendly(err);
    }
  });

  /* Stock movements for one product: "why is the count 14?" */
  router.get('/api/stock/movements', async (req) => {
    const s = requireOwner(req);
    const productId = (req.query || {}).productId || null;
    const rows = await db.tx({ shopId: s.shop_id }, (c) =>
      db.manyIn(
        c,
        `select m.*, p.name as product_name
           from stock_movements m join products p on p.id = m.product_id
          where m.shop_id = $1
            and ($2::uuid is null or m.product_id = $2::uuid)
          order by m.at desc limit 100`,
        [s.shop_id, productId]
      )
    );
    return {
      movements: rows.map((m) => ({
        id: m.id,
        at: m.at,
        productId: m.product_id,
        product: m.product_name,
        reason: m.reason,
        change: num(m.change),
        qtyAfter: num(m.qty_after),
        note: m.note || '',
      })),
    };
  });

  /* ------------------------------------------------------------- customers */

  router.post('/api/customers', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    if (!String(b.name || '').trim()) throw badRequest('Give the customer a name.');

    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        /* The opening balance is money the customer already owed, so it is
           also where their stored balance starts. */
        `insert into customers (shop_id, name, phone, credit_limit, notes,
                                opening_balance, balance)
         values ($1,$2,$3,$4,$5,$6,$6) returning *`,
        [s.shop_id, String(b.name).trim(), b.phone || null, num(b.limit), b.notes || null,
         num(b.openingBalance)]
      );
      await db.noneIn(
        c,
        `insert into audit_entries (shop_id, login_id, action, detail)
         values ($1,$2,'customer.added',$3)`,
        [s.shop_id, s.login_id, row.name]
      );
      return { ok: true, customer: shape.customer(row) };
    });
  });

  router.patch('/api/customers/:id', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        `update customers set
           name = coalesce($3, name),
           phone = coalesce($4, phone),
           credit_limit = coalesce($5, credit_limit),
           notes = coalesce($6, notes)
         where id = $1 and shop_id = $2 returning *`,
        [
          req.params.id,
          s.shop_id,
          b.name === undefined ? null : String(b.name).trim(),
          b.phone === undefined ? null : b.phone,
          b.limit === undefined ? null : num(b.limit),
          b.notes === undefined ? null : b.notes,
        ]
      );
      if (!row) throw notFound('That customer is not in this shop.');
      return { ok: true, customer: shape.customer(row) };
    });
  });

  /* A credit payment: money against an old receipt, not a new sale. */
  router.post('/api/credit-payments', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    const amount = num(b.amount);
    if (!(amount > 0)) throw badRequest('Enter how much was paid.');
    const method = ['cash', 'mpesa', 'card'].includes(b.method) ? b.method : 'cash';

    return db.tx({ shopId: s.shop_id }, async (c) => {
      const cust = await db.oneIn(c, 'select id, name, balance from customers where id = $1 and shop_id = $2', [
        b.customerId,
        s.shop_id,
      ]);
      if (!cust) throw notFound('That customer is not in this shop.');

      const row = await db.oneIn(
        c,
        `insert into credit_payments (shop_id, customer_id, amount, method, received_by, note)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [s.shop_id, cust.id, amount, method, s.login_id, b.note || null]
      );

      /* The trigger recalculates the balance; read it back for the screen. */
      const after = await db.oneIn(c, 'select balance from customers where id = $1', [cust.id]);
      return {
        ok: true,
        payment: shape.creditPayment({ ...row, customer_name: cust.name }),
        balance: num(after.balance),
      };
    });
  });

  /* ------------------------------------------------------------- suppliers */

  router.post('/api/suppliers', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    if (!String(b.name || '').trim()) throw badRequest('Give the supplier a name.');
    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        `insert into suppliers (shop_id, name, phone, terms, balance_owed)
         values ($1,$2,$3,$4,$5) returning *`,
        [
          s.shop_id,
          String(b.name).trim(),
          b.phone || null,
          String(b.terms || 'Cash on delivery'),
          num(b.owed),
        ]
      );
      return { ok: true, supplier: shape.supplier(row) };
    });
  });

  /* ------------------------------------------------------------- purchases */

  router.post('/api/purchases', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    const lines = Array.isArray(b.items) ? b.items : [];
    if (!lines.length) throw badRequest('A purchase order needs at least one line.');

    const total = lines.reduce((t, l) => t + num(l.qty) * num(l.cost), 0);

    return db.tx({ shopId: s.shop_id }, async (c) => {
      /* PO numbers are per shop and sequential, like receipts: PO-1042. */
      const next = await db.oneIn(
        c,
        `select coalesce(max(substring(no from 4)::int), 1041) + 1 as n
           from purchase_orders where shop_id = $1 and no ~ '^PO-[0-9]+$'`,
        [s.shop_id]
      );
      const no = 'PO-' + next.n;

      const row = await db.oneIn(
        c,
        `insert into purchase_orders (shop_id, supplier_id, no, status, ordered_on, total)
         values ($1,$2,$3,$4::po_status,$5,$6) returning *`,
        [s.shop_id, b.supplier || null, no, String(b.status || 'draft'), b.at || null, total]
      );

      for (const l of lines) {
        await db.noneIn(
          c,
          `insert into po_lines (po_id, product_id, name, qty, unit_cost)
           values ($1,$2,$3,$4,$5)`,
          [row.id, l.productId || null, String(l.name || 'Item'), num(l.qty), num(l.cost)]
        );
      }

      /* Receiving an order puts the stock on the shelf, once. The status
         check is what stops a double-receive doubling the stock. */
      if (row.status === 'received') {
        await receiveOrder(c, s, row.id, lines);
      }

      return { ok: true, purchase: shape.purchaseOrder(row, lines.map((l, i) => ({
        id: 'new-' + i, product_id: l.productId, name: l.name, qty: l.qty, unit_cost: l.cost,
      }))) };
    });
  });

  router.patch('/api/purchases/:id', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    return db.tx({ shopId: s.shop_id }, async (c) => {
      const before = await db.oneIn(c, 'select * from purchase_orders where id = $1 and shop_id = $2', [
        req.params.id,
        s.shop_id,
      ]);
      if (!before) throw notFound('That order is not in this shop.');
      if (before.status === 'received' && b.status && b.status !== 'received') {
        throw badRequest('A received order stays received. The stock is already on the shelf.');
      }

      const row = await db.oneIn(
        c,
        `update purchase_orders set
           status = coalesce($3::po_status, status),
           received_on = case when $3::po_status = 'received' and received_on is null
                              then current_date else received_on end
         where id = $1 and shop_id = $2 returning *`,
        [req.params.id, s.shop_id, b.status || null]
      );

      if (row.status === 'received' && before.status !== 'received') {
        const lines = await db.manyIn(c, 'select * from po_lines where po_id = $1', [row.id]);
        await receiveOrder(c, s, row.id, lines.map((l) => ({
          productId: l.product_id, name: l.name, qty: l.qty, cost: l.unit_cost,
        })));
      }

      return { ok: true, purchase: shape.purchaseOrder(row) };
    });
  });

  /* -------------------------------------------------------------- expenses */

  router.post('/api/expenses', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    const amount = num(b.amount);
    if (!(amount > 0)) throw badRequest('Enter how much was spent.');
    if (!String(b.what || '').trim()) throw badRequest('Say what the money was for.');

    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        `insert into expenses (shop_id, spent_on, description, amount, category)
         values ($1, coalesce($2::date, current_date), $3, $4, $5) returning *`,
        [s.shop_id, b.at || null, String(b.what).trim(), amount, String(b.cat || 'Other')]
      );
      return { ok: true, expense: shape.expense(row) };
    });
  });

  /* -------------------------------------------------------------- settings */

  router.patch('/api/settings', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};

    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        `update shop_settings set
           allow_credit = coalesce($2, allow_credit),
           ask_customer = coalesce($3, ask_customer),
           sms_receipt = coalesce($4, sms_receipt),
           offline_selling = coalesce($5, offline_selling),
           default_mpesa_till = coalesce($6, default_mpesa_till),
           updated_at = now()
         where shop_id = $1 returning *`,
        [
          s.shop_id,
          b.allowCredit === undefined ? null : Boolean(b.allowCredit),
          b.askCustomer === undefined ? null : Boolean(b.askCustomer),
          b.smsReceipt === undefined ? null : Boolean(b.smsReceipt),
          b.offline === undefined ? null : Boolean(b.offline),
          b.defaultMpesaTill === undefined ? null : b.defaultMpesaTill,
        ]
      );
      return { ok: true, settings: shape.settings(row) };
    });
  });

  /* The shop's own details: name, branch, phone, KRA PIN. */
  router.patch('/api/shop', async (req) => {
    const s = requireOwner(req);
    const b = req.body || {};
    return db.tx({ shopId: s.shop_id }, async (c) => {
      const row = await db.oneIn(
        c,
        `update shops set
           name = coalesce($2, name),
           branch = coalesce($3, branch),
           phone = coalesce($4, phone),
           kra_pin = coalesce($5, kra_pin)
         where id = $1 returning *`,
        [
          s.shop_id,
          b.name === undefined ? null : String(b.name).trim(),
          b.branch === undefined ? null : String(b.branch).trim(),
          b.phone === undefined ? null : b.phone,
          b.kra === undefined ? null : String(b.kra).trim(),
        ]
      );
      await db.noneIn(
        c,
        `insert into audit_entries (shop_id, login_id, action, detail)
         values ($1,$2,'shop.updated',null)`,
        [s.shop_id, s.login_id]
      );
      return { ok: true, shop: shape.shop(row) };
    });
  });

  /* ----------------------------------------------------------------- audit */

  router.get('/api/audit', async (req) => {
    const s = requireOwner(req);
    const rows = await db.tx({ shopId: s.shop_id }, (c) =>
      db.manyIn(
        c,
        `select a.*, coalesce(l.name, 'System') as who
           from audit_entries a left join logins l on l.id = a.login_id
          where a.shop_id = $1 order by a.at desc limit 200`,
        [s.shop_id]
      )
    );
    return { audit: rows.map(shape.auditEntry) };
  });
}

/* ------------------------------------------------------------------ helpers */

function autoSku(b) {
  const cat = String(b.cat || b.category || 'GEN').slice(0, 3).toUpperCase();
  return `${cat}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

/* Stock in, once per order. `apply_stock` writes the movement, so the shelf
   count and the ledger stay in step. */
async function receiveOrder(c, s, poId, lines) {
  for (const l of lines) {
    if (!l.productId) continue;
    await db.noneIn(
      c,
      `select apply_stock($1,$2,$3,'purchase',$4,null,$5,false)`,
      [s.shop_id, l.productId, num(l.qty), 'Received on order ' + poId.slice(0, 8), s.login_id]
    );
    /* The cost price moves to what was actually paid: the next margin is
       calculated on today's cost, not last year's. */
    await db.noneIn(c, 'update products set cost_price = $2 where id = $1 and shop_id = $3', [
      l.productId,
      num(l.cost),
      s.shop_id,
    ]);
  }
  await db.noneIn(
    c,
    `insert into audit_entries (shop_id, login_id, action, detail)
     values ($1,$2,'purchase.received',$3)`,
    [s.shop_id, s.login_id, poId.slice(0, 8)]
  );
}
