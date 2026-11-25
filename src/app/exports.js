/* ============================================================ export

   Every export button offers the same two answers:

     PDF    a finished, designed document with the logo — no print dialog
     Excel  a real .xlsx workbook, one sheet, styled header

   Both read the same `payload(kind)` object, and `payload` reads `S` — the
   app's data. While the demo is in memory that is the sample shop; once
   Postgres is connected, `S` is filled from the database and these files are
   unchanged. That is the whole point of the split.

   Nothing here is a screenshot of the screen: the PDF lays out its own page,
   so a long list breaks across pages properly and the columns do not wrap. */

/* ---- the shop, once, for every document -------------------------------- */

function exportShop() {
  return {
    shop: S.shop.name,
    branch: S.shop.branch,
    phone: S.shop.phone,
    kra: S.shop.kra,
  };
}

/* The logo, rasterised once per page load from the inline symbol, so the PDF
   carries the real mark and not a placeholder. Cream-on-navy so it reads on
   the header tile. */
/* The logo is the same path the rail and the favicon use, handed to the PDF as
   a vector form. No canvas, no image decoding, nothing that can fail quietly. */
function logoSource() {
  const sym = document.getElementById('i-logo');
  const path = sym && sym.querySelector('path');
  const d = path ? path.getAttribute('d') : '';
  if (!d) return null;
  return { name: 'Logo', w: 636, h: 722, d };
}

/* Money as a plain string, always whole shillings: Ksh 12,345. */
function kes(n) {
  return 'Ksh ' + Math.round(Number(n) || 0).toLocaleString('en-KE');
}

function stampNow() {
  return dmy(now()) + ' ' + clock(now());
}

/* ---- what each export contains ----------------------------------------- */

const EXPORT_DEFS = {
  products: {
    title: 'Stock on hand',
    file: 'stock',
    sheet: 'Stock',
    columns: [
      { label: 'Product', max: 200, type: 'strong' },
      { label: 'SKU', max: 74 },
      { label: 'Category', max: 84 },
      { label: 'On hand', max: 54, align: 'right', type: 'number' },
      { label: 'Reorder', max: 54, align: 'right', type: 'number' },
      { label: 'Cost', max: 48, align: 'right', type: 'money' },
      { label: 'Selling', max: 52, align: 'right', type: 'money' },
      { label: 'Stock value', max: 72, align: 'right', type: 'money' },
      { label: 'Status', max: 76 },
    ],
    meta() {
      const cost = sum(S.products, (p) => p.cost * p.qty);
      const retail = sum(S.products, (p) => p.price * p.qty);
      const low = S.products.filter((p) => p.qty > 0 && p.qty <= p.reorder).length;
      const out = S.products.filter((p) => p.qty === 0).length;
      return [
        ['Products', num(S.products.length)],
        ['Value at cost', kes(cost)],
        ['At retail', kes(retail)],
        ['Low / out', low + ' / ' + out],
      ];
    },
    note() {
      const expiring = S.products.filter((p) => p.exp && Math.round((new Date(p.exp) - today()) / 86400000) <= 30);
      return expiring.length
        ? expiring.length + ' product(s) expire within 30 days — marked in the status column.'
        : 'Nothing on the shelf expires within the next 30 days.';
    },
    rows() {
      return S.products.map((p) => [
        p.name, p.sku, p.cat, p.qty, p.reorder, p.cost, p.price, p.cost * p.qty,
        p.qty === 0 ? 'Out of stock' : p.qty <= p.reorder ? 'Running low' : p.exp && Math.round((new Date(p.exp) - today()) / 86400000) <= 30 ? 'Expires soon' : 'In stock',
      ]);
    },
    totals() {
      return [['Value at cost', kes(sum(S.products, (p) => p.cost * p.qty)), true]];
    },
  },

  sales: {
    title: 'Sales',
    file: 'sales',
    sheet: 'Sales',
    columns: [
      { label: 'Receipt', w: 92, type: 'strong' },
      { label: 'Date', w: 84 },
      { label: 'Customer', w: 150 },
      { label: 'Paid by', w: 108 },
      { label: 'Total', w: 88, align: 'right', type: 'money' },
      { label: 'Credit', w: 84, align: 'right', type: 'money' },
      { label: 'eTIMS', w: 78 },
    ],
    meta() {
      const mine = S.sales;
      const gross = sum(mine, (s) => s.total);
      const credit = sum(mine, (s) => s.credit || 0);
      return [
        ['Receipts', num(mine.length)],
        ['Gross sales', kes(gross)],
        ['On credit', kes(credit)],
        ['Average sale', kes(mine.length ? gross / mine.length : 0)],
      ];
    },
    note() {
      return 'Every receipt is signed by KRA eTIMS. Verify any signature at etims.kra.go.ke.';
    },
    rows() {
      const mine = S.sales;
      return mine.map((s) => [
        s.no, dmy(new Date(s.at)),
        s.customer_name || (cust(s.customer) || {}).name || 'Walk-in',
        s.paid.map((p) => p.m).join(' + ') || '-',
        s.total, s.credit || 0, s.etims.status === 'sent' ? 'Signed' : 'Queued',
      ]);
    },
    totals() {
      const mine = S.sales;
      return [
        ['Receipts', num(mine.length)],
        ['Gross sales', kes(sum(mine, (s) => s.total)), true],
      ];
    },
  },

  customers: {
    title: 'Customers and credit',
    file: 'customers',
    sheet: 'Customers',
    columns: [
      { label: 'Customer', w: 170, type: 'strong' },
      { label: 'Phone', w: 100 },
      { label: 'Credit limit', w: 96, align: 'right', type: 'money' },
      { label: 'Owes now', w: 96, align: 'right', type: 'money' },
      { label: 'Room left', w: 96, align: 'right', type: 'money' },
      { label: 'Since', w: 74 },
      { label: 'Standing', w: 96 },
    ],
    meta() {
      const list = S.customers.filter((c) => c.id !== 'c6');
      const owed = sum(list, (c) => c.bal);
      const over = list.filter((c) => c.limit > 0 && c.bal / c.limit > 0.8).length;
      return [
        ['Customers', num(list.length)],
        ['Owed to the shop', kes(owed)],
        ['Near their limit', num(over)],
        ['Walk-in sales', kes(sum(S.sales.filter((s) => !s.customer), (s) => s.total))],
      ];
    },
    note() {
      return 'Credit is given by the shop, not by the system. A customer near the limit is flagged, never blocked.';
    },
    rows() {
      return S.customers.filter((c) => c.id !== 'c6').map((c) => [
        c.name, c.phone, c.limit || 0, c.bal, Math.max(0, (c.limit || 0) - c.bal), c.since,
        !c.limit ? 'Cash only' : c.bal > c.limit ? 'Over the limit' : c.bal / c.limit > 0.8 ? 'Near the limit' : 'Good standing',
      ]);
    },
    totals() {
      const list = S.customers.filter((c) => c.id !== 'c6');
      return [['Total owed', kes(sum(list, (c) => c.bal)), true]];
    },
  },

  purchases: {
    title: 'Purchase orders',
    file: 'purchases',
    sheet: 'Purchases',
    columns: [
      { label: 'Order', w: 96, type: 'strong' },
      { label: 'Supplier', w: 160 },
      { label: 'Ordered', w: 78 },
      { label: 'Expected', w: 80 },
      { label: 'Lines', w: 56, align: 'right', type: 'number' },
      { label: 'Value', w: 96, align: 'right', type: 'money' },
      { label: 'Status', w: 96 },
    ],
    meta() {
      const list = S.pos;
      const open = list.filter((p) => p.status !== 'received');
      return [
        ['Orders', num(list.length)],
        ['Still open', num(open.length)],
        ['Value still to come', kes(sum(open, (p) => p.total || 0))],
        ['Received', num(list.length - open.length)],
      ];
    },
    rows() {
      return S.pos.map((p) => [
        p.no || p.id, (sup(p.supplier) || {}).name || p.supplier_name || '-',
        dmy(new Date(p.at)), p.due ? dmy(new Date(p.due)) : '-',
        (p.items || []).length, p.total || 0,
        p.status === 'received' ? 'Received' : p.status === 'ordered' ? 'On the road' : 'Draft',
      ]);
    },
    totals() {
      return [['Value of open orders', kes(sum(S.pos.filter((p) => p.status !== 'received'), (p) => p.total || 0)), true]];
    },
  },

  report: {
    title: 'Sales report',
    file: 'sales-report',
    sheet: 'Report',
    columns: [
      { label: 'Receipt', w: 96, type: 'strong' },
      { label: 'Date', w: 78 },
      { label: 'Customer', w: 168 },
      { label: 'Items', w: 58, align: 'right', type: 'number' },
      { label: 'Total', w: 92, align: 'right', type: 'money' },
      { label: 'VAT included', w: 96, align: 'right', type: 'money' },
      { label: 'Profit', w: 92, align: 'right', type: 'money' },
    ],
    range() {
      const days = { 'Today': 0, 'This week': 6, 'This month': 29, 'This quarter': 89 }[reportRange] || 29;
      const from = addDays(today(), -days);
      return { from, sel: S.sales.filter((s) => new Date(s.at) >= from) };
    },
    meta() {
      const { sel } = EXPORT_DEFS.report.range();
      const gross = sum(sel, (s) => s.total);
      const cogs = sum(sel, costOf);
      return [
        ['Period', reportRange],
        ['Receipts', num(sel.length)],
        ['Gross sales', kes(gross)],
        ['Gross profit', kes(gross - cogs)],
      ];
    },
    note() {
      const { sel } = EXPORT_DEFS.report.range();
      const gross = sum(sel, (s) => s.total);
      return 'VAT at 16% is included in the prices: ' + kes(gross * 16 / 116) + ' of the sales above is VAT.';
    },
    rows() {
      const { sel } = EXPORT_DEFS.report.range();
      return sel.map((s) => [
        s.no, dmy(new Date(s.at)),
        s.customer_name || (cust(s.customer) || {}).name || 'Walk-in',
        s.items.reduce((t, i) => t + i.qty, 0),
        s.total, Math.round(s.total * 16 / 116), Math.round(s.total - costOf(s)),
      ]);
    },
    totals() {
      const { sel } = EXPORT_DEFS.report.range();
      const gross = sum(sel, (s) => s.total);
      const cogs = sum(sel, costOf);
      return [
        ['Gross sales', kes(gross)],
        ['Cost of goods sold', kes(cogs)],
        ['Gross profit', kes(gross - cogs), true],
      ];
    },
  },

  audit: {
    title: 'Audit trail',
    file: 'audit-log',
    sheet: 'Audit',
    columns: [
      { label: 'When', w: 118, type: 'strong' },
      { label: 'Who', w: 128 },
      { label: 'What', w: 190 },
      { label: 'Detail', w: 220 },
    ],
    meta() {
      const todayMs = today().getTime();
      const todayEntries = S.audit.filter((a) => new Date(a.at) >= todayMs).length;
      return [
        ['Entries', num(S.audit.length)],
        ['Today', num(todayEntries)],
        ['Signed in as', S.user.name],
      ];
    },
    note() {
      return 'Newest first. Nothing is ever deleted from this log — a correction is another entry.';
    },
    rows() {
      return S.audit.map((a) => [
        dmy(new Date(a.at)) + ' ' + clock(new Date(a.at)), a.who, a.what, a.detail || '',
      ]);
    },
    totals() {
      return [['Entries', num(S.audit.length), true]];
    },
  },

  all: {
    title: 'Everything in this shop',
    file: 'shop-yangu-everything',
    sheet: 'Everything',
    columns: [
      { label: 'Sheet', w: 130, type: 'strong' },
      { label: 'Rows', w: 70, align: 'right', type: 'number' },
      { label: 'What it is', w: 340 },
    ],
    meta() {
      return [
        ['Products', num(S.products.length)],
        ['Customers', num(S.customers.length)],
        ['Sales', num(S.sales.length)],
        ['Orders', num(S.pos.length)],
      ];
    },
    note() {
      return 'The Excel file puts each of these on its own sheet; the PDF is a one-page inventory of the shop.';
    },
    rows() {
      return [
        ['Products', S.products.length, 'Every product, its cost, price and stock'],
        ['Customers', S.customers.length, 'Names, phones, credit limits and balances'],
        ['Sales', S.sales.length, 'Every receipt and how it was paid'],
        ['Purchase orders', S.pos.length, 'Supplier orders and their status'],
        ['Suppliers', S.suppliers.length, 'Who the shop buys from'],
        ['Audit log', S.audit.length, 'What happened, and when'],
      ];
    },
    totals() {
      const rows = S.products.length + S.customers.length + S.sales.length + S.pos.length;
      return [['Records in total', num(rows), true]];
    },
  },
};

/* ---- PDF --------------------------------------------------------------- */

function pdfPayload(kind) {
  const def = EXPORT_DEFS[kind];
  if (!def) return null;
  const rows = def.rows();
  return {
    kind,
    title: def.title,
    subtitle: def.meta().map(([k, v]) => k + ': ' + v).slice(0, 2).join('  ·  '),
    stamp: 'Printed ' + stampNow(),
    columns: def.columns,
    rows: rows.map((r) => r.map((v) => (typeof v === 'number' ? String(Math.round(v)) : v))),
    meta: def.meta(),
    note: def.note ? def.note() : '',
    totals: def.totals ? def.totals() : null,
    ...exportShop(),
  };
}

function exportPDF(kind) {
  const payload = pdfPayload(kind);
  if (!payload) return;
  if (!payload.rows.length) {
    toast('Nothing to export yet — that list is empty.', 'bad');
    return;
  }
  const doc = { ...payload, logo: logoSource(), rows: payload.rows.map((r) => r.slice(0, payload.columns.length)) };
  const file = PDF.build(doc);
  downloadBytes('shop-yangu-' + EXPORT_DEFS[kind].file + '-' + ymd(today()) + '.pdf', file, 'application/pdf');
  recordExport(kind, 'PDF');
}

/* ---- Excel ------------------------------------------------------------- */

function excelSheetFor(def) {
  const rows = def.rows();
  return {
    name: def.sheet,
    title: def.title,
    subtitle: S.shop.name + ' · ' + S.shop.branch,
    note: 'Exported ' + stampNow(),
    columns: def.columns.map((c) => ({ label: c.label, width: Math.max(9, Math.round(c.w / 7)), type: c.type })),
    rows: rows.map((r) => r.map((v, i) => (typeof v === 'number' && def.columns[i].type === 'money' ? Math.round(v) : v))),
  };
}

function exportExcel(kind) {
  const def = EXPORT_DEFS[kind];
  if (!def) return;
  let sheets;
  if (kind === 'all') {
    sheets = ['products', 'customers', 'sales', 'purchases'].map((k) => excelSheetFor(EXPORT_DEFS[k]));
    sheets.push({
      name: 'Shop',
      title: 'The shop',
      subtitle: S.shop.name,
      note: 'What is in this workbook',
      columns: [{ label: 'Item', width: 22 }, { label: 'Value', width: 42 }],
      rows: [
        ['Shop', S.shop.name], ['Branch', S.shop.branch], ['Phone', S.shop.phone],
        ['KRA PIN', S.shop.kra], ['Plan', kes(S.shop.plan) + ' / month'],
        ['Products', S.products.length], ['Customers', S.customers.length],
        ['Sales', S.sales.length], ['Purchase orders', S.pos.length],
        ['Exported', stampNow()],
      ],
    });
  } else {
    sheets = [excelSheetFor(def)];
  }
  const file = buildXlsx(sheets);
  downloadBytes('shop-yangu-' + def.file + '-' + ymd(today()) + '.xlsx', file,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  recordExport(kind, 'Excel');
}

/* ---- one receipt ------------------------------------------------------- */

/* A receipt as a till slip: 80mm wide, as long as the sale needs, so it
   prints on the thermal printer at the counter and reads top-down. The
   report writer is a different designer on purpose — a table scaled to a
   roll is unreadable, so this hands `PDF` a receipt-shaped document. */
function receiptPdf(sale) {
  const c = cust(sale.customer);
  const who = sale.customer_name || (c ? c.name : 'Walk-in customer');
  const vat = Math.round(sale.total * 16 / 116);
  const paid = sale.paid.reduce((a, p) => a + p.amt, 0);
  const paidLines = sale.paid.map((p) => ({ label: 'Paid by ' + p.m, value: kes(p.amt) }));
  if (sale.credit) paidLines.push({ label: 'On credit', value: kes(sale.credit), tone: 'credit' });

  const file = PDF.build({
    sheet: 'receipt',
    shop: S.shop.name,
    branch: S.shop.branch,
    phone: S.shop.phone,
    kra: S.shop.kra,
    receiptNo: sale.no,
    dateLine: dmy(new Date(sale.at)) + '  ·  ' + clock(new Date(sale.at)),
    customer: who,
    lines: sale.items.map((it) => ({
      name: it.name,
      qty: it.qty,
      price: kes(it.price),
      amount: kes(it.qty * it.price),
    })),
    amounts: [
      { label: 'Subtotal', value: kes(sale.total) },
      { label: 'VAT 16% included', value: kes(vat) },
      { label: 'TOTAL', value: kes(sale.total), strong: true, rule: true },
      ...paidLines,
      ...(paid !== sale.total && !sale.credit ? [{ label: 'Change', value: kes(paid - sale.total) }] : []),
    ],
    credit: sale.credit ? kes(sale.credit) : '',
    sig: sale.etims.sig + '-' + sale.no,
    verify: 'Verify at etims.kra.go.ke',
    thanks: 'Asante. Karibu tena.',
    logo: logoSource(),
  });
  downloadBytes('receipt-' + sale.no + '.pdf', file, 'application/pdf');
}

function receiptExcel(sale) {
  const c = cust(sale.customer);
  const sheet = {
    name: 'Receipt',
    title: 'Sales receipt ' + sale.no,
    subtitle: S.shop.name + ' · ' + dmy(new Date(sale.at)) + ' ' + clock(new Date(sale.at)),
    note: 'Customer: ' + (sale.customer_name || (c ? c.name : 'Walk-in')),
    columns: [
      { label: 'Item', width: 34 }, { label: 'Qty', width: 8, type: 'number' },
      { label: 'Price', width: 12, type: 'money' }, { label: 'Amount', width: 14, type: 'money' },
    ],
    rows: sale.items.map((it) => [it.name, it.qty, Math.round(it.price), Math.round(it.qty * it.price)])
      .concat([['Total', '', '', Math.round(sale.total)]]),
  };
  downloadBytes('receipt-' + sale.no + '.xlsx', buildXlsx([sheet]),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---- the plumbing ------------------------------------------------------ */

function downloadBytes(name, data, type) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    toast('Downloaded ' + name, 'good');
  } catch (err) {
    toast('This browser blocked the download. Try again, or print instead.', 'bad');
  }
}

function recordExport(kind, format) {
  S.audit.unshift({
    at: now().toISOString(),
    who: S.user.name,
    what: 'Exported ' + (EXPORT_DEFS[kind] ? EXPORT_DEFS[kind].title : kind),
    detail: format + ' file, with the shop name and KRA PIN',
  });
}

/* One handler for every menu in the app. */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-export]');
  if (!btn) return;
  e.preventDefault();
  const kind = btn.dataset.export;
  const format = btn.dataset.format || 'pdf';
  closeMenus();
  if (format === 'xlsx') exportExcel(kind);
  else exportPDF(kind);
});

/* ---- the menu itself --------------------------------------------------- */

function closeMenus(except) {
  $$('[data-menu]').forEach((m) => {
    if (m === except) return;
    m.querySelector('[data-menu-pop]').hidden = true;
    m.querySelector('[data-menu-btn]').setAttribute('aria-expanded', 'false');
    m.classList.remove('is-open');
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu-btn]');
  if (btn) {
    const menu = btn.closest('[data-menu]');
    const pop = menu.querySelector('[data-menu-pop]');
    const open = pop.hidden;
    closeMenus(menu);
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    return;
  }
  if (!e.target.closest('[data-menu-pop]')) closeMenus();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenus();
});
