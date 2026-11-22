/* ============================================================ reports */
let reportRange = 'This month';
function renderReports() {
  $('#reportChips').innerHTML = ['Today', 'This week', 'This month', 'This quarter'].map(r =>
    '<button class="chip" data-range="' + r + '" aria-pressed="' + (reportRange === r) + '">' + r + '</button>').join('');

  const days = { 'Today': 0, 'This week': 6, 'This month': 29, 'This quarter': 89 }[reportRange];
  const from = addDays(today(), -days);
  const sel = S.sales.filter(s => new Date(s.at) >= from);
  const gross = sum(sel, s => s.total);
  const cogs = sum(sel, costOf);
  const vat = gross * 16 / 116;
  const exp = S.expenses.filter(x => new Date(x.at) >= from);
  const expTotal = sum(exp, x => x.amt);
  const credit = sum(sel, s => s.credit);

  $('#reportTable').innerHTML =
    '<dl class="kv" style="margin-bottom:6px">' +
    '<dt>Receipts</dt><dd class="num">' + sel.length + '</dd>' +
    '<dt>Gross sales</dt><dd class="num">' + fmt2(gross) + '</dd>' +
    '<dt>VAT included</dt><dd class="num">' + fmt2(vat) + '</dd>' +
    '<dt>Cost of goods sold</dt><dd class="num">' + fmt2(cogs) + '</dd>' +
    '<dt>Gross profit</dt><dd class="num" style="font-weight:700">' + fmt2(gross - cogs) + '</dd>' +
    '<dt>Expenses</dt><dd class="num">' + fmt2(expTotal) + '</dd>' +
    '<dt style="font-weight:600;color:var(--ink)">Net profit</dt><dd class="num" style="font-weight:700;color:' + (gross - cogs - expTotal >= 0 ? 'var(--forest)' : 'var(--danger)') + '">' + fmt2(gross - cogs - expTotal) + '</dd>' +
    '<dt>Sold on credit</dt><dd class="num">' + fmt2(credit) + '</dd></dl>' +
    '<div class="progress" style="margin:12px 0"><span style="width:' + (sel.length ? Math.min(100, (gross - cogs) / gross * 100) : 0).toFixed(0) + '%"></span></div>' +
    '<div class="hint" style="margin-bottom:12px">Gross margin ' + (gross ? ((gross - cogs) / gross * 100).toFixed(1) : '0.0') + '% over ' + reportRange.toLowerCase() + '.</div>';

  const byCat = {};
  sel.forEach(s => s.items.forEach(it => {
    const p = prod(it.id);
    const cat = p ? p.cat : 'Other';
    byCat[cat] = byCat[cat] || { qty: 0, value: 0, profit: 0 };
    byCat[cat].qty += it.qty;
    byCat[cat].value += it.qty * it.price;
    byCat[cat].profit += it.qty * (it.price - (it.cost || 0));
  }));
  const maxV = Math.max.apply(null, Object.values(byCat).map(x => x.value).concat([1]));
  $('#reportTable').innerHTML += '<h3 style="font-size:14px;font-weight:600;margin:14px 0 8px">By category</h3>' +
    Object.keys(byCat).sort((a, b) => byCat[b].value - byCat[a].value).map(k =>
      '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:13px">' +
      '<span>' + esc(k) + ' <span class="hint">(' + byCat[k].qty + ' items)</span></span>' +
      '<span class="num" style="font-weight:600">' + fmt(byCat[k].value) + '</span></div>' +
      '<div class="progress" style="margin-top:4px"><span style="width:' + ((byCat[k].value / maxV) * 100).toFixed(0) + '%"></span></div></div>').join('') +
    '<h3 style="font-size:14px;font-weight:600;margin:16px 0 8px">Expenses</h3>' +
    (exp.length
      ? '<div class="cards-mobile">' + exp.map(x =>
          '<div class="rowcard"><div class="top"><div style="min-width:0"><div class="ttl">' + esc(x.what) + '</div>' +
          '<div class="meta">' + dmy(new Date(x.at)) + ' · ' + esc(x.cat) + '</div></div>' +
          '<div class="amt">' + fmt(x.amt) + '</div></div></div>').join('') + '</div>' +
        '<div class="tablewrap desk"><table><thead><tr><th>Date</th><th>What</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>' +
        exp.map(x => '<tr><td class="num">' + dmy(new Date(x.at)) + '</td><td>' + esc(x.what) + '</td><td>' + esc(x.cat) + '</td>' +
          '<td class="num">' + fmt(x.amt) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty"><b>No expenses in this range</b><p>Expenses you record come off net profit.</p></div>');
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-range]');
  if (r) { reportRange = r.dataset.range; renderReports(); }
});/* ============================================================ eTIMS */
function renderEtims() {
  $('#etimsShop').textContent = S.shop.name;
  const recent = S.sales.slice(0, 8);
  /* every figure here is read from the same sales the rest of the app uses */
  const todayRows = salesToday();
  const monthFrom = addDays(today(), -29);
  const monthRows = S.sales.filter(x => new Date(x.at) >= monthFrom);
  const monthVat = sum(monthRows, x => x.total) * 16 / 116;
  $('#etimsSent').textContent = todayRows.length;
  $('#etimsSent').parentNode.querySelector('.f').textContent = 'Of ' + todayRows.length + ' receipts';
  $('#etimsVat').textContent = fmt(monthVat);
  $('#etimsVat').parentNode.querySelector('.f').textContent =
    '16% on ' + monthRows.length + ' sales this month';
  $('#etimsQueue').textContent = todayRows.filter(x => x.etims.status !== 'sent').length;
  const last = S.sales[0];
  $('#etimsLast').textContent = last
    ? dmy(new Date(last.at)) + ', ' + clock(new Date(last.at))
    : 'Nothing sent yet';
  $('#etimsList').innerHTML = recent.map(s => {
    const c = cust(s.customer);
    return '<div class="setrow"><div><div class="t">' + esc(s.no) + ' · ' + fmt(s.total) + '</div>' +
      '<div class="d">' + dmy(new Date(s.at)) + ' ' + clock(new Date(s.at)) + ' · ' + esc(s.customer_name || (c ? c.name : 'Walk-in')) + '</div></div>' +
      '<div style="text-align:right"><span class="pill ok"><span class="dot"></span>Signed</span>' +
      '<div class="hint num">' + esc(s.etims.sig) + '</div></div></div>';
  }).join('');
}
$('#etimsTest').onclick = () => {
  const b = $('#etimsTest');
  b.disabled = true; b.innerHTML = icon('scan-line', 'sm') + 'Sending…';
  setTimeout(() => {
    b.disabled = false; b.innerHTML = icon('scan-line', 'sm') + 'Send a test transmission';
    $('#etimsLast').textContent = 'Today, ' + clock(now());
    toast('Test accepted by eTIMS. Signature returned.', 'good');
    S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Sent eTIMS test', detail: 'Accepted' });
  }, 1100);
};

/* ============================================================ settings */
function renderSettings() {
  $('#userList').innerHTML = S.users.map(u =>
    '<div class="setrow"><div><div class="t">' + esc(u.name) + (u.id === 'u1' ? ' <span class="pill info">You</span>' : '') + '</div>' +
    '<div class="d">' + esc(u.phone) + ' · ' + (u.role === 'owner' ? 'Owner' : 'Sales') + ' · last seen ' + esc(u.last) + '</div></div>' +
    '<div style="display:flex;gap:6px;align-items:center">' +
    (u.active ? '<span class="pill ok">Active</span>' : '<span class="pill neutral">Off</span>') +
    (u.id === 'u1' ? '' : '<button class="btn ghost sm" data-toggleuser="' + u.id + '">' + (u.active ? 'Disable' : 'Enable') + '</button>') +
    '</div></div>').join('');
  $$('.toggle').forEach(t => {
    const k = t.dataset.toggle;
    t.setAttribute('aria-checked', String(!!S.settings[k]));
  });
  $$('[data-plan-price]').forEach(n => { n.textContent = fmt(S.shop.plan); });
  $$('[data-plan-line]').forEach(n => { n.textContent = fmt(S.shop.plan) + ' / month'; });
  $('#setShop').value = S.shop.name;
  $('#setBranch').value = S.shop.branch;
  $('#setPhone').value = S.shop.phone;
  $('#setKra').value = S.shop.kra;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const k = t.dataset.toggle;
    S.settings[k] = !S.settings[k];
    t.setAttribute('aria-checked', String(S.settings[k]));
    toast(k === 'allowCredit' && !S.settings[k] ? 'Credit sales are off — the till will refuse a shortfall.' : 'Saved');
  }
  const tu = e.target.closest('[data-toggleuser]');
  if (tu) {
    const u = S.users.find(x => x.id === tu.dataset.toggleuser);
    u.active = !u.active;
    renderSettings(); toast(u.name + (u.active ? ' can sign in again.' : ' can no longer sign in.'));
  }
  if (e.target.closest('[data-save-settings]')) {
    S.shop.name = $('#setShop').value.trim() || 'Shop Yangu Kenya';
    S.shop.branch = $('#setBranch').value.trim();
    S.shop.phone = $('#setPhone').value.trim();
    S.shop.kra = $('#setKra').value.trim();
    paintNav(); toast('Shop profile saved. It is now on every receipt.', 'good');
  }
  if (e.target.closest('[data-add-user]')) {
    sheet({
      title: 'Add a user', sub: 'Sales are limited on purpose',
      body: '<div class="formrow"><label class="lbl" for="uN">Name</label><input class="field" id="uN" /></div>' +
        '<div class="formrow"><label class="lbl" for="uP">Phone, used to sign in</label><input class="field" id="uP" inputmode="tel" /></div>' +
        '<div class="formrow"><label class="lbl" for="uR">Role</label><select class="field" id="uR"><option value="sales">Sales — till, stock, buying</option><option value="owner">Owner — everything</option></select></div>' +
        '<p class="hint" style="margin-top:9px">A sales user sees the till, the stock list and purchase orders. Costs, profit, reports, users and eTIMS settings stay with the owner.</p>',
      actions: [{ label: 'Send invite', kind: '', onClick: () => {
        const n = $('#uN').value.trim();
        if (!n) { toast('A name is needed.', 'bad'); return; }
        S.users.push({ id: 'u' + (S.users.length + 1) + 'x', name: n, phone: $('#uP').value.trim(), role: $('#uR').value, active: true, last: 'Never' });
        closeSheet(); renderSettings(); toast('Invite sent to ' + n);
      }}]
    });
  }
});

/* ============================================================ audit */
let auditFilter = 'Everything';
function renderAudit() {
  const kinds = ['Everything', 'Sales', 'Stock', 'Credit'];
  $('#auditChips').innerHTML = kinds.map(k => '<button class="chip" data-audit="' + k + '" aria-pressed="' + (auditFilter === k) + '">' + k + '</button>').join('');
  if (!S.audit.length) {
    S.audit.push({ at: now().toISOString(), who: 'Wanjiku Kamau', what: 'Signed in', detail: 'Owner, Mombasa Branch' });
    S.audit.push({ at: addDays(now(), 0).toISOString(), who: 'Otieno Were', what: 'Completed sale R-3804', detail: 'Ksh 1,240, M-Pesa' });
    S.audit.push({ at: now().toISOString(), who: 'Fatuma Ali', what: 'Adjusted stock', detail: 'Fresh milk 500ml, 12 → 8' });
  }
  const rows = S.audit.filter(a => {
    if (auditFilter === 'Everything') return true;
    if (auditFilter === 'Sales') return /sale|receipt/i.test(a.what);
    if (auditFilter === 'Stock') return /stock|product|received/i.test(a.what);
    return /credit|payment/i.test(a.what);
  });
  $('#auditList').innerHTML = rows.map(a =>
    '<div class="setrow"><div style="display:flex;gap:10px;align-items:flex-start">' +
    '<span class="pill info" style="padding:5px">' + icon('landmark', 'sm') + '</span>' +
    '<div><div class="t">' + esc(a.what) + '</div>' +
    '<div class="d">' + esc(a.who) + ' · ' + dmy(new Date(a.at)) + ' ' + clock(new Date(a.at)) + ' · ' + esc(a.detail) + '</div></div></div></div>').join('');
  if (!rows.length) $('#auditList').innerHTML = '<div class="empty"><b>Nothing of that kind yet</b><p>Actions appear the moment they happen, and cannot be edited afterwards.</p></div>';
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-audit]');
  if (a) { auditFilter = a.dataset.audit; renderAudit(); }
});
