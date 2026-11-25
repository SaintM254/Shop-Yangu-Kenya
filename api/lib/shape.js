/* ============================================================ api/lib/shape.js

   The screens were written against the sample data in src/app/data.js. That
   was deliberate: the shape `S` has is the shape the API must return, so the
   day the backend arrives no screen has to change.

   This file is that promise, in code. Postgres speaks snake_case, money as
   numeric strings and timestamps as Date objects; the screens want camelCase,
   numbers, and an ISO string. Every conversion happens here and nowhere else,
   which means there is one place to look when a number is wrong.

   Money leaves this file as a NUMBER of shillings with two decimals. Never a
   formatted string ("KES 1,200"), never integer cents: the till does the
   formatting, and the API stays arithmetic.
*/

const n = (v) => (v === null || v === undefined ? 0 : Number(v));

const iso = (v) => (v ? new Date(v).toISOString() : null);

/* A business date, not an instant: keep it as YYYY-MM-DD so it cannot shift
   by a timezone on its way to the screen. */
const dateOnly = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

/* ---------------------------------------------------------------------- shop */

export function shop(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    branch: row.branch,
    phone: row.phone || '',
    kra: row.kra_pin || '',
    plan: n(row.plan_kes),
    planStartedOn: dateOnly(row.plan_started_on),
    planRenewsOn: dateOnly(row.plan_renews_on),
    suspended: Boolean(row.suspended_at),
  };
}

export function user(row) {
  if (!row) return null;
  return {
    id: row.id || row.login_id,
    name: row.name,
    email: row.email,
    role: row.role,
    shopId: row.shop_id || null,
    shopName: row.shop_name || null,
    lastSeenAt: iso(row.last_seen_at),
  };
}

export function settings(row) {
  if (!row) return { allowCredit: true, askCustomer: false, smsReceipt: true, offline: true };
  return {
    allowCredit: row.allow_credit,
    askCustomer: row.ask_customer,
    smsReceipt: row.sms_receipt,
    offline: row.offline_selling,
    defaultMpesaTill: row.default_mpesa_till || null,
  };
}

/* ------------------------------------------------------------------ catalogue */

export function product(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    cat: row.category_name || row.cat || '',
    categoryId: row.category_id || null,
    unit: row.unit,
    cost: n(row.cost_price),
    price: n(row.selling_price),
    qty: n(row.qty),
    reorder: n(row.reorder_level),
    exp: dateOnly(row.expiry_date),
    barcode: row.barcode || '',
    active: row.active !== false,
  };
}

export function category(row) {
  return { id: row.id, name: row.name, products: row.products === undefined ? undefined : n(row.products) };
}

export function supplier(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    terms: row.terms,
    owed: n(row.balance_owed),
  };
}

export function customer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    limit: n(row.credit_limit),
    bal: n(row.balance),
    since: dateOnly(row.since),
    notes: row.notes || '',
  };
}

/* A purchase order with its lines, as the purchases screen shows it. */
export function purchaseOrder(row, lines = []) {
  return {
    id: row.id,
    no: row.no,
    supplier: row.supplier_id || '',
    supplierName: row.supplier_name || '',
    at: dateOnly(row.ordered_on || row.created_at),
    status: row.status,
    total: n(row.total),
    lines: lines.length || n(row.line_count),
    items: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      name: l.name,
      qty: n(l.qty),
      cost: n(l.unit_cost),
    })),
  };
}

/* ----------------------------------------------------------------------- sales */

/* `v_sales` folds the payments in already. The screens want:
     no, at, items[], total, paid[{m, amt}], credit, customer, etims{status}
   with the payment method spelled the way the chips filter on. */
const METHOD_LABEL = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card' };

export function sale(row, lines = []) {
  const paid = (row.payments || []).map((p) => ({
    m: METHOD_LABEL[p.m] || p.m,
    amt: n(p.amt),
  }));

  return {
    id: row.id,
    no: row.receipt_no,
    at: iso(row.sold_at),
    on: dateOnly(row.sold_on),
    items: lines.map((l) => ({
      id: l.product_id,
      name: l.name_snapshot,
      qty: n(l.qty),
      price: n(l.unit_price),
      cost: n(l.unit_cost_snapshot),
    })),
    lineCount: n(row.line_count),
    itemCount: n(row.items),
    subtotal: n(row.subtotal),
    vat: n(row.vat),
    total: n(row.total),
    paid,
    credit: n(row.credit_amount),
    customer: row.customer_id || '',
    customer_name: row.customer_name,
    etims: {
      status: row.etims_status || 'pending',
      sig: row.etims_signature || '',
    },
  };
}

/* The till screen posts a basket in the app's own shape; record_sale() wants
   product_id / qty / unit_price / unit_cost / name. One translation, here. */
export function saleLinesFor(items = []) {
  return items.map((it) => ({
    product_id: it.id || it.product_id || null,
    name: it.name,
    qty: Number(it.qty),
    unit_price: Number(it.price !== undefined ? it.price : it.unit_price),
    unit_cost: Number(it.cost !== undefined ? it.cost : it.unit_cost || 0),
  }));
}

export function salePaymentsFor(paid = []) {
  const method = { Cash: 'cash', 'M-Pesa': 'mpesa', Card: 'card', cash: 'cash', mpesa: 'mpesa', card: 'card' };
  return paid
    .filter((p) => Number(p.amt) > 0)
    .map((p) => ({
      method: method[p.m] || 'cash',
      amount: Number(p.amt),
    }));
}

/* ------------------------------------------------------------------- M-Pesa */

export function mpesaTill(row) {
  return {
    id: row.id,
    label: row.label,
    shortcode: row.shortcode,
    type: row.type,
    environment: row.environment,
    isDefault: row.is_default,
    active: row.active,
    /* Whether the secrets are in place. Never the secrets themselves: the
       API role cannot even read those columns (see 003_rls.sql). */
    configured: row.configured === undefined ? true : Boolean(row.configured),
  };
}

export function mpesaRequest(row) {
  return {
    id: row.id,
    phone: row.phone,
    amount: n(row.amount),
    accountRef: row.account_ref,
    status: row.status,
    checkoutRequestId: row.checkout_request_id,
    receipt: row.mpesa_receipt,
    resultDesc: row.result_desc,
    createdAt: iso(row.created_at),
    completedAt: iso(row.completed_at),
  };
}

/* -------------------------------------------------------------------- admin */

export function adminShop(row) {
  return {
    id: row.id,
    name: row.name,
    branch: row.branch,
    phone: row.phone || '',
    plan: n(row.plan_kes),
    createdAt: iso(row.created_at),
    suspended: Boolean(row.suspended_at),
    ownerEmail: row.owner_email || '',
    ownerName: row.owner_name || '',
    ownerLastSeen: iso(row.owner_last_seen),
    liveSessions: n(row.live_sessions),
    products: n(row.products),
    sales: n(row.sales),
    lifetimeSales: n(row.lifetime_sales),
    salesToday: n(row.sales_today),
    creditOut: n(row.credit_out),
    hasMpesa: Boolean(row.has_mpesa),
  };
}

export function adminSession(row) {
  return {
    sessionId: row.session_id,
    loginId: row.login_id,
    email: row.email,
    person: row.person,
    role: row.role,
    shopId: row.shop_id,
    shopName: row.shop_name || '',
    signedInAt: iso(row.signed_in_at),
    lastSeenAt: iso(row.last_seen_at),
    expiresAt: iso(row.expires_at),
    ip: row.ip || '',
    userAgent: row.user_agent || '',
    revokedAt: iso(row.revoked_at),
  };
}

export function adminTotals(row) {
  return {
    shops: n(row.shops),
    liveLogins: n(row.live_logins),
    salesToday: n(row.sales_today),
    salesAll: n(row.sales_all),
    creditOut: n(row.credit_out),
    newShops7d: n(row.new_shops_7d),
  };
}

export function auditEntry(row) {
  return {
    id: row.id,
    at: iso(row.at),
    who: row.who || row.email || 'System',
    what: row.action,
    detail: row.detail || '',
  };
}

export function expense(row) {
  return {
    id: row.id,
    at: dateOnly(row.spent_on),
    what: row.description,
    amt: n(row.amount),
    cat: row.category,
  };
}

export function creditPayment(row) {
  return {
    id: row.id,
    at: iso(row.received_at),
    customer: row.customer_id,
    customerName: row.customer_name || '',
    amt: n(row.amount),
    m: METHOD_LABEL[row.method] || row.method,
    note: row.note || '',
  };
}
