/* ============================================================ boot */
const RENDER = {
  dashboard: renderDashboard, pos: renderPOS, inventory: renderInventory,
  purchases: renderPurchases, sales: renderSales, customers: renderCustomers,
  migration: () => {}, reports: renderReports, etims: renderEtims,
  settings: renderSettings, audit: renderAudit
};

let saleFilter = 'All';
function renderSales() {
  /* one login per shop, so every receipt in the shop is in view */
  const mine = S.sales;
  const list = mine.filter(s => {
    if (saleFilter === 'All') return true;
    if (saleFilter === 'On credit') return s.credit > 0;
    return s.paid.some(p => p.m === saleFilter);
  }).slice(0, 40);

  const counts = { 'All': mine.length, 'Cash': 0, 'M-Pesa': 0, 'On credit': 0 };
  mine.forEach(s => { s.paid.forEach(p => { if (counts[p.m] != null) counts[p.m]++; }); if (s.credit) counts['On credit']++; });
  $('#salesChips').innerHTML = Object.keys(counts).map(k =>
    '<button class="chip" data-salefilter="' + k + '" aria-pressed="' + (saleFilter === k) + '">' + k +
    ' <span style="opacity:.6">' + counts[k] + '</span></button>').join('');

  if (!list.length) {
    $('#salesList').innerHTML = '<div class="empty"><div class="big">' + icon('receipt') + '</div>' +
      '<b>No receipts like that</b><p>Nothing matches this filter. The till is where new ones come from.</p>' +
      '<button class="btn secondary sm" data-goto="pos">Open the till</button></div>';
    return;
  }

  $('#salesList').innerHTML = list.map(s => {
    const c = cust(s.customer);
    return '<div class="rowcard"><div class="top"><div style="min-width:0">' +
      '<div class="ttl">' + esc(s.no) + ' <span class="hint">' + clock(new Date(s.at)) + '</span></div>' +
      '<div class="meta">' + dmy(new Date(s.at)) + ' · ' + esc(s.customer_name || (c ? c.name : 'Walk-in')) + '</div></div>' +
      '<div class="amt">' + fmt(s.total) + '</div></div>' +
      '<div class="bottom"><div style="display:flex;gap:5px;flex-wrap:wrap;min-width:0">' +
      s.paid.map(p => '<span class="pill info">' + esc(p.m) + '</span>').join('') +
      (s.credit ? '<span class="pill low">' + fmt(s.credit) + ' credit</span>' : '') +
      (s.etims.status === 'sent' ? '<span class="pill ok">Signed</span>' : '<span class="pill neutral">Imported</span>') +
      '</div><div style="display:flex;gap:4px">' +
      '<button class="btn ghost sm" data-printsale="' + esc(s.no) + '" title="Print this receipt">' + icon('printer', 'sm') + '</button>' +
      '<button class="btn ghost sm" data-receipt="' + esc(s.no) + '">Receipt</button></div></div></div>';
  }).join('');
}

document.addEventListener('click', e => {
  const p = e.target.closest('[data-printsale]');
  if (p) {
    const s = S.sales.find(x => x.no === p.dataset.printsale);
    if (s) printDoc(receiptDoc(s), 'Sales receipt');
    return;
  }
  const r = e.target.closest('[data-receipt]');
  if (r) {
    const s = S.sales.find(x => x.no === r.dataset.receipt);
    if (!s) return;
    go('pos');
    showReceipt(s, 0);
    setTimeout(() => $('#receiptCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return;
  }
  const f = e.target.closest('[data-salefilter]');
  if (f) { saleFilter = f.dataset.salefilter; renderSales(); }
});

/* ============================================================ start

   1. no session, no till
   2. the rail remembers whether it was collapsed
   3. the address decides the screen
   4. and from here on, the address follows the screen */

function start() {
  if (!requireSession()) return;
  initRail();
  paintNav();
  renderInventory();
  renderDashboard();
  renderSales();

  /* The screen named by the address. Opening the built folder from disk gives
     .../dashboard/index.html, which the router understands just as well as
     /dashboard on a server. */
  const fromPath = idForPath(location.pathname);
  const fromHash = idFromHash(location.hash);
  const first = fromPath || fromHash || 'dashboard';
  go(first, { replace: true, keepScroll: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
