/* ============================================================ api/routes/bootstrap.js

   GET /api/bootstrap — everything the app needs for its first paint.

   One round trip, not eight. A phone on a 3G connection in Mombasa should not
   make a dozen requests before the dashboard shows a number, so this returns
   the shop, the settings, the catalogue, the customers, the last sales and the
   purchase orders together.

   Everything is read inside one transaction with syk.shop_id set, so the
   row-level security policies in 003_rls.sql apply to every query at once.
*/

import * as db from '../lib/db.js';
import * as shape from '../lib/shape.js';
import { requireOwner } from '../lib/auth.js';

/* How much history the first paint carries. The lists scroll; anything older
   is paged in by /api/sales when the screen asks. */
const RECENT_SALES = 60;
const RECENT_AUDIT = 40;

export default function (router) {
  router.get('/api/bootstrap', async (req) => {
    const s = requireOwner(req);

    const data = await db.tx({ shopId: s.shop_id }, async (c) => {
      const [shop, settings, user, products, categories, suppliers, customers] =
        await Promise.all([
          db.oneIn(c, 'select * from shops where id = $1', [s.shop_id]),
          db.oneIn(c, 'select * from shop_settings where shop_id = $1', [s.shop_id]),
          db.oneIn(
            c,
            `select l.id, l.name, l.email::text as email, l.role, l.shop_id,
                    l.last_seen_at, sh.name as shop_name
               from logins l left join shops sh on sh.id = l.shop_id
              where l.id = $1`,
            [s.login_id]
          ),
          db.manyIn(
            c,
            `select p.*, cat.name as category_name
               from products p
               left join categories cat on cat.id = p.category_id
              where p.shop_id = $1 and p.active
              order by cat.name nulls last, p.name`,
            [s.shop_id]
          ),
          db.manyIn(c, 'select * from categories where shop_id = $1 order by name', [s.shop_id]),
          db.manyIn(c, 'select * from suppliers where shop_id = $1 order by name', [s.shop_id]),
          db.manyIn(c, 'select * from customers where shop_id = $1 order by name', [s.shop_id]),
        ]);

      /* Sales with their lines in one query per table rather than N+1: the
         receipt card needs the lines, the list only needs the totals. */
      const sales = await db.manyIn(
        c,
        `select v.*, e.status as etims_status, e.signature as etims_signature
           from v_sales v
           left join lateral (
             select t.status, t.signature from etims_transmissions t
              where t.sale_id = v.id order by t.created_at desc limit 1
           ) e on true
          where v.shop_id = $1
          order by v.sold_at desc
          limit $2`,
        [s.shop_id, RECENT_SALES]
      );

      const saleIds = sales.map((r) => r.id);
      const lines = saleIds.length
        ? await db.manyIn(
            c,
            `select * from sale_lines where sale_id = any($1::uuid[]) order by sale_id, name_snapshot`,
            [saleIds]
          )
        : [];
      const linesBySale = new Map();
      for (const l of lines) {
        if (!linesBySale.has(l.sale_id)) linesBySale.set(l.sale_id, []);
        linesBySale.get(l.sale_id).push(l);
      }

      const pos = await db.manyIn(
        c,
        `select po.*, sup.name as supplier_name,
                (select count(*) from po_lines pl where pl.po_id = po.id) as line_count
           from purchase_orders po
           left join suppliers sup on sup.id = po.supplier_id
          where po.shop_id = $1
          order by coalesce(po.ordered_on, po.created_at::date) desc
          limit 40`,
        [s.shop_id]
      );

      const poLines = pos.length
        ? await db.manyIn(
            c,
            `select * from po_lines where po_id = any($1::uuid[])`,
            [pos.map((p) => p.id)]
          )
        : [];
      const poByOrder = new Map();
      for (const l of poLines) {
        if (!poByOrder.has(l.po_id)) poByOrder.set(l.po_id, []);
        poByOrder.get(l.po_id).push(l);
      }

      const expenses = await db.manyIn(
        c,
        'select * from expenses where shop_id = $1 order by spent_on desc limit 40',
        [s.shop_id]
      );

      const ledger = await db.manyIn(
        c,
        `select cp.*, cu.name as customer_name
           from credit_payments cp join customers cu on cu.id = cp.customer_id
          where cp.shop_id = $1
          order by cp.received_at desc limit 40`,
        [s.shop_id]
      );

      const audit = await db.manyIn(
        c,
        `select a.*, coalesce(l.name, 'System') as who
           from audit_entries a left join logins l on l.id = a.login_id
          where a.shop_id = $1
          order by a.at desc limit $2`,
        [s.shop_id, RECENT_AUDIT]
      );

      const takings = await db.manyIn(
        c,
        `select * from v_daily_takings where shop_id = $1 order by sold_on desc limit 31`,
        [s.shop_id]
      );

      const tills = await db.manyIn(
        c,
        'select * from v_mpesa_tills where shop_id = $1 and active order by is_default desc, label',
        [s.shop_id]
      );

      return { shop, settings, user, products, categories, suppliers, customers,
               sales, linesBySale, pos, poByOrder, expenses, ledger, audit, takings, tills };
    });

    return {
      shop: shape.shop(data.shop),
      user: shape.user(data.user),
      settings: shape.settings(data.settings),
      cats: data.categories.map((c) => c.name),
      categories: data.categories.map(shape.category),
      products: data.products.map(shape.product),
      suppliers: data.suppliers.map(shape.supplier),
      customers: data.customers.map(shape.customer),
      sales: data.sales.map((r) => shape.sale(r, data.linesBySale.get(r.id) || [])),
      pos: data.pos.map((r) => shape.purchaseOrder(r, data.poByOrder.get(r.id) || [])),
      expenses: data.expenses.map(shape.expense),
      ledger: data.ledger.map(shape.creditPayment),
      audit: data.audit.map(shape.auditEntry),
      takings: data.takings.map((r) => ({
        on: String(r.sold_on).slice(0, 10),
        receipts: Number(r.receipts),
        gross: Number(r.gross),
        vat: Number(r.vat),
        credit: Number(r.credit),
        profit: Number(r.gross_profit),
      })),
      tills: data.tills.map(shape.mpesaTill),
      /* The screens use this to decide whether to show the "demo data" hint. */
      fresh: data.sales.length === 0,
      generatedAt: new Date().toISOString(),
    };
  });
}
