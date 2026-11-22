/* ============================================================ customers */
let custTerm = '';
$('#custSearch').addEventListener('input', e => { custTerm = e.target.value; renderCustomers(); });

function renderCustomers() {
  const t = custTerm.toLowerCase();
  const list = S.customers.filter(c => c.id !== 'c6' && (!t || c.name.toLowerCase().includes(t) || c.phone.includes(t)));
  if (!list.length) { $('#custList').innerHTML = '<div class="empty"><b>No customer matches</b><p>Add them with the button above.</p></div>'; return; }
  $('#custList').innerHTML = list.map(c => {
    const used = c.limit ? Math.min(100, (c.bal / c.limit) * 100) : 0;
    return '<div class="rowcard"><div class="top"><div style="min-width:0">' +
      '<div class="ttl">' + esc(c.name) + '</div>' +
      '<div class="meta">' + esc(c.phone) + ' · limit ' + fmt(c.limit) + ' · since ' + dmy(new Date(c.since)) + '</div></div>' +
      '<div class="amt" style="color:' + (c.bal > c.limit * 0.6 ? 'var(--danger)' : 'var(--ink)') + '">' + fmt(c.bal) + '</div></div>' +
      '<div class="progress" style="margin-top:8px"><span style="width:' + used.toFixed(0) + '%;background:' + (used > 60 ? 'var(--danger)' : 'var(--syk)') + '"></span></div>' +
      '<div class="hint" style="margin-top:5px">' + used.toFixed(0) + '% of the credit limit used</div>' +
      '<div style="display:flex;gap:6px;margin-top:8px">' +
      (c.bal > 0 ? '<button class="btn secondary sm" data-paycust="' + c.id + '">' + icon('banknote', 'sm') + 'Take payment</button>' : '') +
      '<button class="btn ghost sm" style="margin-left:auto" data-ledger="' + c.id + '">Ledger</button></div></div>';
  }).join('');
}

document.addEventListener('click', e => {
  const p = e.target.closest('[data-paycust]');
  if (p) {
    const c = cust(p.dataset.paycust);
    sheet({
      title: 'Payment from ' + c.name, sub: 'Balance ' + fmt(c.bal),
      body: '<div class="formrow"><label class="lbl" for="payAmt">Amount received</label>' +
        '<input class="field big num" id="payAmt" inputmode="decimal" value="' + Math.round(c.bal) + '" /></div>' +
        '<div class="chips" style="margin-top:9px">' + [500, 1000, 2000].map(n => '<button class="chip" data-payquick="' + n + '">+' + fmt(n) + '</button>').join('') +
        '<button class="chip" data-payquick="' + Math.round(c.bal) + '">Full balance</button></div>' +
        '<div class="formrow" style="margin-top:11px"><label class="lbl" for="payHow">Method</label>' +
        '<select class="field" id="payHow"><option>M-Pesa</option><option>Cash</option><option>Bank transfer</option></select></div>' +
        '<p class="hint" style="margin-top:9px">A payment over the balance leaves the customer in credit, which comes off their next sale.</p>',
      actions: [{ label: 'Record payment', kind: '', onClick: () => {
        const amt = Number($('#payAmt').value) || 0;
        if (amt <= 0) { toast('Enter an amount.', 'bad'); return; }
        c.bal = Math.round((c.bal - amt) * 100) / 100;
        S.ledger.unshift({ at: now().toISOString(), customer: c.id, amt, how: $('#payHow').value, who: S.me.name });
        S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Recorded payment', detail: c.name + ', ' + fmt(amt) });
        closeSheet(); renderCustomers();
        toast('Payment recorded. ' + c.name + ' now owes ' + fmt(c.bal), 'good');
      }}],
      onMount: () => { $('#sheetBody').onclick = ev => { const q = ev.target.closest('[data-payquick]'); if (q) $('#payAmt').value = q.dataset.payquick; }; }
    });
  }
  const l = e.target.closest('[data-ledger]');
  if (l) {
    const c = cust(l.dataset.ledger);
    const mine = S.sales.filter(s => s.customer === c.id);
    const pays = S.ledger.filter(x => x.customer === c.id);
    const rows = mine.map(s => ({ at: s.at, what: 'Sale ' + s.no, dr: s.total, cr: 0 }))
      .concat(pays.map(p => ({ at: p.at, what: 'Payment · ' + p.how, dr: 0, cr: p.amt })))
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    sheet({
      title: c.name, sub: 'Ledger · balance ' + fmt(c.bal), wide: true,
      body: rows.length ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>What</th><th>Sale</th><th>Paid</th></tr></thead><tbody>' +
        rows.map(r => '<tr><td class="num">' + dmy(new Date(r.at)) + '</td><td>' + esc(r.what) + '</td>' +
          '<td class="num">' + (r.dr ? fmt(r.dr) : '—') + '</td><td class="num">' + (r.cr ? fmt(r.cr) : '—') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty"><b>Nothing on the ledger yet</b><p>Sales on credit and payments received will appear here.</p></div>',
      actions: [{ label: 'Close' }]
    });
  }
  if (e.target.closest('[data-add-customer]')) {
    sheet({
      title: 'New customer', sub: 'A person or a business buying on account',
      body: '<div class="formrow"><label class="lbl" for="cN">Name</label><input class="field" id="cN" placeholder="e.g. Mama Zawadi Kiosk" /></div>' +
        '<div class="formrow"><label class="lbl" for="cP">Phone</label><input class="field" id="cP" inputmode="tel" placeholder="07.. ... ..." /></div>' +
        '<div class="formrow"><label class="lbl" for="cL">Credit limit</label><input class="field num" id="cL" inputmode="decimal" value="10000" /></div>' +
        '<div class="formrow"><label class="lbl" for="cB">Opening balance owed</label><input class="field num" id="cB" inputmode="decimal" value="0" /></div>',
      actions: [{ label: 'Add customer', kind: '', onClick: () => {
        const n = $('#cN').value.trim();
        if (!n) { toast('A customer needs a name.', 'bad'); return; }
        S.customers.push({ id: 'c' + (S.customers.length + 1) + 'x', name: n, phone: $('#cP').value.trim(), limit: Number($('#cL').value) || 0, bal: Number($('#cB').value) || 0, since: ymd(today()) });
        closeSheet(); renderCustomers(); toast('Added ' + n, 'good');
      }}]
    });
  }
});
