/* ============================================================ point of sale */
const PAY_METHODS = [['Cash', 'banknote'], ['M-Pesa', 'smartphone'], ['Card', 'credit-card']];
let basket = [];
let pay = [{ m: 'Cash', amt: '' }];

function renderPOS() {
  renderCustomer();
  $('#posChips').innerHTML = S.cats.map(c => {
    return '<button class="chip" data-poscat="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('');
  renderPOSResults('');
  renderBasket();
  renderPay();
}

function renderPOSResults(q) {
  const term = (q || '').toLowerCase().trim();
  let list = S.products.filter(p => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
  if (term) list = list.slice(0, 6);
  else list = S.products.filter(p => ['p05', 'p06', 'p01', 'p03', 'p09', 'p14'].includes(p.id));
  if (!list.length) {
    $('#posResults').innerHTML = '<div class="empty"><b>Nothing matches that</b><p>Check the spelling, or scan the barcode on the pack.</p></div>';
    return;
  }
  $('#posResults').innerHTML = list.map(p => {
    const out = p.qty === 0;
    return '<div class="setrow"><div style="min-width:0">' +
      '<div class="t">' + esc(p.name) + '</div>' +
      '<div class="d">' + esc(p.sku) + ' · ' + fmt(p.price) + ' per ' + esc(p.unit) +
      (out ? ' · <span style="color:var(--danger)">out of stock</span>' : ' · ' + p.qty + ' left') + '</div></div>' +
      '<button class="btn secondary sm" data-add="' + p.id + '"' + (out ? ' disabled' : '') + '>' +
      icon('plus', 'sm') + 'Add</button></div>';
  }).join('');
}

function renderBasket() {
  const b = $('#basket');
  if (!basket.length) {
    b.innerHTML = '<div class="empty">' + '<div class="big">' + icon('shopping-cart') + '</div>' +
      '<b>Basket is empty</b><p>Search for a product above, or tap one of the fast movers.</p></div>';
    $('#basketCount').textContent = 'Nothing in it yet';
  } else {
    const n = sum(basket, it => it.qty);
    $('#basketCount').textContent = n + (n === 1 ? ' item' : ' items') + ' · ' + fmt(basketTotal());
    b.innerHTML = basket.map((it, i) =>
      '<div class="rowcard"><div class="top"><div style="min-width:0"><div class="ttl">' + esc(it.name) + '</div>' +
      '<div class="meta">' + fmt(it.price) + ' each' + (it.cost ? '' : '') + '</div></div>' +
      '<div class="amt">' + fmt(it.price * it.qty) + '</div></div>' +
      '<div class="bottom"><div class="stepper">' +
      '<button data-qty="' + i + ':-1" aria-label="One fewer">' + icon('minus', 'sm') + '</button>' +
      '<input class="num" value="' + it.qty + '" inputmode="numeric" data-qtyinput="' + i + '" aria-label="Quantity" />' +
      '<button data-qty="' + i + ':1" aria-label="One more">' + icon('plus', 'sm') + '</button>' +
      '</div>' +
      '<div class="btns"><button class="btn danger sm" data-remove="' + i + '" aria-label="Remove from basket">' + icon('trash', 'sm') + '</button></div></div></div>'
    ).join('');
  }
  updateTotals();
}
const basketTotal = () => sum(basket, it => it.price * it.qty);

/* ---------------------------------------------------------------- customer
   One customer is chosen before the sale completes, and that name is what the
   receipt prints. Three ways in: search the customer list, add someone new at
   the till, or type a walk-in name. A walk-in keeps no balance, so it can buy
   but it cannot hold credit — the credit sheet still asks who is taking it. */
let posCustomer = { id: 'c6', name: 'Walk-in', walkin: '', open: false };

function customerLabel() {
  if (posCustomer.id === 'c6') return posCustomer.walkin.trim() || 'Walk-in';
  const c = cust(posCustomer.id);
  return c ? c.name : 'Walk-in';
}

function renderCustomer() {
  const box = $('#posCustomer');
  if (!box) return;
  const isWalk = posCustomer.id === 'c6';
  const c = isWalk ? null : cust(posCustomer.id);
  const label = customerLabel();

  box.innerHTML =
    '<div class="rowcard" style="box-shadow:inset 0 0 0 1px ' + (isWalk ? 'transparent' : 'var(--syk)') + '">' +
      '<div class="top"><div style="min-width:0">' +
        '<div class="ttl">' + esc(label) + '</div>' +
        '<div class="meta">' + (c
          ? esc(c.phone || 'no phone') + ' · limit ' + fmt(c.limit) + ' · owes ' + fmt(c.bal)
          : 'Walk-in · no balance kept, so no credit') + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="bottom" style="display:flex;gap:7px;margin-top:9px">' +
        '<button class="btn secondary sm" id="pickCustomer">' + icon('search', 'sm') + 'Change</button>' +
        (isWalk ? '<button class="btn ghost sm" id="nameWalkin">' + icon('pencil', 'sm') + (posCustomer.walkin.trim() ? 'Edit name' : 'Add a name') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="hint" style="margin-top:8px">A name here is what prints on the receipt under Customer.</div>';

  const pick = $('#pickCustomer');
  if (pick) pick.onclick = openCustomerSheet;
  const name = $('#nameWalkin');
  if (name) name.onclick = askWalkinName;
}

function openCustomerSheet() {
  const isOwn = () => isOwner();
  sheet({
    title: 'Who is buying?',
    sub: isOwn() ? 'Search the list, or add someone new' : 'Search the customer list',
    body:
      '<div class="searchbox">' + icon('search') +
        '<input class="field" id="custSearch" placeholder="Name or phone number" autocomplete="off" />' +
      '</div>' +
      '<div id="custResults" style="margin-top:10px"></div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn ghost sm" id="useWalkin">' + icon('user-round', 'sm') + 'Walk-in</button>' +
        (isOwn() ? '<button class="btn secondary sm" id="newCustomer">' + icon('plus', 'sm') + 'New customer</button>' : '') +
      '</div>' +
      (isOwn() ? '' : '<div class="hint" style="margin-top:9px">Only the owner can add a customer or keep a balance.</div>'),
    actions: [],
    onMount: () => {
      const search = $('#custSearch');
      const paint = (q) => {
        const needle = q.trim().toLowerCase();
        const list = S.customers.filter(c => c.id !== 'c6' && (!needle ||
          c.name.toLowerCase().includes(needle) || (c.phone || '').replace(/\s/g, '').includes(needle.replace(/\s/g, ''))));
        $('#custResults').innerHTML = list.length ? list.map(c =>
          '<button class="rowcard" style="width:100%;text-align:left;cursor:pointer;background:var(--paper)" data-pick="' + c.id + '">' +
            '<div class="top"><div style="min-width:0"><div class="ttl">' + esc(c.name) + '</div>' +
            '<div class="meta">' + esc(c.phone || 'no phone') + ' · limit ' + fmt(c.limit) + '</div></div>' +
            '<div class="amt">' + fmt(c.bal) + '</div></div></button>').join('')
          : '<p class="hint">No customer matches “' + esc(q) + '”.' + (isOwn() ? ' Add them with New customer.' : '') + '</p>';
      };
      paint('');
      search.oninput = () => paint(search.value);
      $('#custResults').onclick = ev => {
        const b = ev.target.closest('[data-pick]');
        if (!b) return;
        const picked = cust(b.dataset.pick);
        posCustomer = { id: picked.id, name: picked.name, walkin: '', open: false };
        renderCustomer();
        closeSheet();
        toast('Customer set to ' + picked.name, 'good');
      };
      $('#useWalkin').onclick = () => {
        posCustomer = { id: 'c6', name: 'Walk-in', walkin: '', open: false };
        renderCustomer();
        closeSheet();
      };
      const add = $('#newCustomer');
      if (add) add.onclick = () => { closeSheet(); openNewCustomerSheet(); };
      setTimeout(() => search.focus(), 40);
    }
  });
}

/* Adding a customer from the till: only what a receipt needs. */
function openNewCustomerSheet() {
  sheet({
    title: 'New customer',
    sub: 'They can take credit straight away',
    body:
      '<div class="formrow"><label class="label" for="ncName">Name</label>' +
        '<input class="field" id="ncName" placeholder="e.g. Star Mini Market" autocomplete="off" /></div>' +
      '<div class="formrow"><label class="label" for="ncPhone">Phone</label>' +
        '<input class="field" id="ncPhone" inputmode="tel" placeholder="07xx xxx xxx" autocomplete="off" /></div>' +
      '<div class="form2">' +
        '<div class="formrow"><label class="label" for="ncLimit">Credit limit (Ksh)</label>' +
          '<input class="field num" id="ncLimit" inputmode="numeric" placeholder="0" /></div>' +
        '<div class="formrow"><label class="label" for="ncBal">Opening balance (Ksh)</label>' +
          '<input class="field num" id="ncBal" inputmode="numeric" placeholder="0" /></div>' +
      '</div>' +
      '<div id="ncErr" class="errmsg" hidden></div>',
    actions: [
      { label: 'Cancel', ghost: true },
      { label: 'Add and use', kind: '', id: 'ncSave' }
    ],
    onMount: () => {
      const save = () => {
        const name = $('#ncName').value.trim();
        const err = $('#ncErr');
        if (name.length < 2) {
          err.hidden = false;
          err.innerHTML = icon('alert', 'sm') + 'A name is needed — it prints on the receipt.';
          return;
        }
        const c = {
          id: 'c' + (Date.now() % 100000),
          name,
          phone: $('#ncPhone').value.trim(),
          limit: Math.max(0, Number($('#ncLimit').value) || 0),
          bal: Math.max(0, Number($('#ncBal').value) || 0),
          since: ymd(today()),
          notes: 'Added at the till'
        };
        S.customers.push(c);
        S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Added customer ' + c.name, detail: fmt(c.bal) + ' opening balance' });
        posCustomer = { id: c.id, name: c.name, walkin: '', open: false };
        renderCustomer();
        if (route === 'customers') renderCustomers();
        closeSheet();
        toast(c.name + ' added', 'good');
      };
      $('#ncSave').onclick = save;
      $('#ncSave').className = 'btn';
      setTimeout(() => $('#ncName').focus(), 40);
    }
  });
}

/* A walk-in may still get a name on the receipt — it just keeps no balance. */
function askWalkinName() {
  sheet({
    title: 'Name on the receipt',
    sub: 'Optional. A walk-in never keeps a balance.',
    body:
      '<div class="formrow"><label class="label" for="wiName">Name</label>' +
        '<input class="field" id="wiName" value="' + esc(posCustomer.walkin || '') + '" placeholder="e.g. Mama Zawadi" autocomplete="off" /></div>' +
      '<div class="hint">Leave it blank and the receipt says Walk-in.</div>',
    actions: [
      { label: 'Clear', ghost: true, onClick: () => { posCustomer.walkin = ''; renderCustomer(); closeSheet(); } },
      { label: 'Use this name', kind: '', id: 'wiSave' }
    ],
    onMount: () => {
      const save = () => {
        posCustomer.walkin = $('#wiName').value.trim().slice(0, 60);
        renderCustomer();
        closeSheet();
      };
      $('#wiSave').onclick = save;
      $('#wiSave').className = 'btn';
      const inp = $('#wiName');
      inp.onkeydown = ev => { if (ev.key === 'Enter') save(); };
      setTimeout(() => inp.focus(), 40);
    }
  });
}


function addToBasket(id) {
  const p = prod(id);
  const line = basket.find(b => b.id === id);
  if (line) line.qty += 1;
  else basket.push({ id: p.id, name: p.name, price: p.price, cost: p.cost, unit: p.unit, qty: 1 });
  renderBasket();
  $('#posSearch').value = '';
  renderPOSResults('');
}

function updateTotals() {
  const total = basketTotal();
  const vat = total * 16 / 116;
  $('#tSub').textContent = fmt(total - vat);
  $('#tVat').textContent = fmt(vat);
  $('#tTotal').textContent = fmt(total);

  const paid = sum(pay, p => Number(p.amt) || 0);
  const diff = paid - total;
  const changeRow = $('#tChangeRow'), creditRow = $('#tCreditRow');
  changeRow.hidden = !(diff > 0.5);
  creditRow.hidden = !(diff < -0.5);
  if (diff > 0.5) $('#tChange').textContent = fmt(diff);
  if (diff < -0.5) $('#tCredit').textContent = fmt(-diff);

  $('#completeSale').disabled = !basket.length;
  const label = $('#completeSale');
  if (basket.length && diff < -0.5) {
    label.innerHTML = icon('circle-check') + 'Complete and hold ' + fmt(-diff) + ' on credit';
  } else {
    label.innerHTML = icon('circle-check') + 'Complete sale';
  }
}

function renderPay() {
  const total = basketTotal();
  const paidSoFar = sum(pay, p => Number(p.amt) || 0);
  const unpaid = total - paidSoFar;

  $('#payMethods').innerHTML = pay.map((p, i) => {
    const isLast = i === pay.length - 1;
    const rest = total - sum(pay, (x, k) => (k === i ? 0 : Number(x.amt) || 0));
    return '<div class="paypart">' +
      '<div class="prow"><span class="plabel">' + icon('wallet', 'sm') +
        (pay.length > 1 ? 'Part ' + (i + 1) + ' of ' + pay.length : 'How are they paying?') + '</span>' +
        (pay.length > 1 ? '<button class="del" style="width:30px;height:30px" data-delpay="' + i + '" aria-label="Remove this part">' + icon('x', 'sm') + '</button>' : '') +
      '</div>' +
      '<div class="segmented">' + PAY_METHODS.map(([m, ic]) =>
        '<button data-method="' + i + ':' + m + '" aria-pressed="' + (p.m === m) + '">' + icon(ic) + m + '</button>').join('') +
      '</div>' +
      '<div class="amtrow" style="margin-top:8px">' +
        '<input class="field num" inputmode="decimal" placeholder="' + (total ? fmt(Math.max(0, rest)) : 'Amount') + '" data-payamt="' + i + '" value="' + (p.amt === '' ? '' : p.amt) + '" aria-label="Amount for ' + p.m + '" />' +
        '<button class="btn secondary sm" style="flex:none" data-fill="' + i + '">' + (isLast && rest > 0 ? 'Rest' : 'Fill') + '</button>' +
      '</div>' +
      (isLast && pay.length === 1 ? '<div class="hint">Leave it blank to take the exact amount.</div>' : '') +
    '</div>';
  }).join('') + (pay.length < 3 ? '<button class="btn ghost sm" style="margin-top:9px" id="addSplit">' + icon('arrow-right-left', 'sm') + 'Split payment</button>' : '');

  const add = $('#addSplit');
  if (add) add.onclick = () => {
    const used = pay.map(p => p.m);
    const next = PAY_METHODS.map(x => x[0]).find(m => !used.includes(m)) || 'Cash';
    /* move whatever is still unpaid into the new part */
    const owed = Math.max(0, basketTotal() - sum(pay, p => Number(p.amt) || 0));
    if (pay.length === 1 && pay[0].amt === '' ) pay[0].amt = '';
    pay.push({ m: next, amt: owed ? String(Math.round(owed)) : '' });
    renderPay(); updateTotals();
  };
}

document.addEventListener('input', e => {
  const q = e.target;
  if (q.id === 'posSearch') renderPOSResults(q.value);
  if (q.dataset.payamt != null) {
    pay[Number(q.dataset.payamt)].amt = q.value.replace(/[^\d.]/g, '');
    updateTotals();
  }
  if (q.dataset.qtyinput != null) {
    const i = Number(q.dataset.qtyinput);
    let v = parseInt(q.value.replace(/[^\d]/g, ''), 10);
    if (isNaN(v)) v = 0;
    basket[i].qty = Math.max(1, Math.min(9999, v));
    updateTotals();
    $('#basketCount').textContent = sum(basket, it => it.qty) + ' items · ' + fmt(basketTotal());
    const amtEl = $('.rowcard:nth-child(' + (i + 1) + ') .amt');
    if (amtEl) amtEl.textContent = fmt(basket[i].price * basket[i].qty);
  }
});

document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-poscat]')) {
    renderPOSResults(t.closest('[data-poscat]').dataset.poscat);
    $$('#posChips .chip').forEach(c => c.setAttribute('aria-pressed', c === t.closest('[data-poscat]')));
  }
  const add = t.closest('[data-add]');
  if (add) addToBasket(add.dataset.add);

  const st = t.closest('[data-qty]');
  if (st) {
    const [i, d] = st.dataset.qty.split(':').map(Number);
    basket[i].qty += d;
    if (basket[i].qty <= 0) basket.splice(i, 1);
    renderBasket();
  }
  const rm = t.closest('[data-remove]');
  if (rm) { basket.splice(Number(rm.dataset.remove), 1); renderBasket(); }

  const md = t.closest('[data-method]');
  if (md) {
    const [i, m] = md.dataset.method.split(':');
    pay[Number(i)].m = m;
    renderPay();
  }
  const fill = t.closest('[data-fill]');
  if (fill) {
    const i = Number(fill.dataset.fill);
    const others = sum(pay, (p, k) => (k === i ? 0 : Number(p.amt) || 0));
    const rest = basketTotal() - others;
    pay[i].amt = rest > 0 ? String(Math.round(rest)) : '';
    renderPay(); updateTotals();
  }
  const dl = t.closest('[data-delpay]');
  if (dl) { pay.splice(Number(dl.dataset.delpay), 1); renderPay(); updateTotals(); }
});

$('#clearBasket').onclick = () => { basket = []; pay = [{ m: 'Cash', amt: '' }]; renderBasket(); renderPay(); };

/* ---- completing a sale, including a credit balance ---- */
function completeSale() {
  if (!basket.length) return;
  const total = basketTotal();
  /* one method with nothing typed in means "the exact amount" */
  if (pay.length === 1 && (pay[0].amt === '' || pay[0].amt == null)) pay[0].amt = String(total);
  const paidBits = pay.filter(p => Number(p.amt) > 0);
  const paid = sum(paidBits, p => Number(p.amt));
  const diff = paid - total;
  const change = diff > 0.5 ? diff : 0;
  const credit = diff < -0.5 ? -diff : 0;

  if (credit > 0 && !S.settings.allowCredit) {
    toast('Credit sales are switched off in settings.', 'bad'); return;
  }
  if (credit > 0) {
    /* A walk-in cannot hold a balance, so this is the one place the till
       insists on a named customer. The customer already picked at the top of
       the till comes first in the list, so the usual case is one tap. */
    const pick = S.customers.filter(c => c.id !== 'c6');
    const chosen = posCustomer.id !== 'c6' ? posCustomer.id : null;
    sheet({
      title: 'Who is taking the credit?',
      sub: fmt(credit) + ' will be added to their balance. A walk-in cannot hold credit.',
      body: '<div id="creditPick">' + pick.map(c =>
        '<button class="rowcard" style="width:100%;text-align:left;cursor:pointer;background:var(--paper);border:1px solid ' +
          (c.id === chosen ? 'var(--syk)' : 'var(--sand)') + '" data-credit="' + c.id + '">' +
        '<div class="top"><div><div class="ttl">' + esc(c.name) + (c.id === chosen ? ' · picked' : '') + '</div>' +
        '<div class="meta">' + esc(c.phone || 'no phone') + ' · limit ' + fmt(c.limit) + (c.bal >= c.limit && c.limit ? ' · at limit' : '') + '</div></div>' +
        '<div class="amt">' + fmt(c.bal) + '</div></div></button>').join('') + '</div>',
      actions: [{ label: 'Cancel' }]
    });
    $('#sheetBody').onclick = ev => {
      const b = ev.target.closest('[data-credit]');
      if (!b) return;
      const c = cust(b.dataset.credit);
      c.bal += credit;
      finishSale(total, paidBits, change, credit, c.id);
      closeSheet();
    };
    return;
  }
  finishSale(total, paidBits, change, 0, posCustomer.id);
}

function finishSale(total, paidBits, change, credit, customerId) {
  const no = 'R-' + (3807 + S.sales.length);
  const sale = {
    no, at: now().toISOString(),
    items: basket.map(b => ({ id: b.id, name: b.name, qty: b.qty, price: b.price, cost: b.cost, unit: b.unit })),
    total, paid: paidBits.map(p => ({ m: p.m, amt: Number(p.amt) })),
    credit, customer: customerId, cashier: S.me.name,
    etims: { status: 'sent', sig: 'KRA' + (721000 + S.sales.length) }
  };
  basket.forEach(b => { const p = prod(b.id); if (p) p.qty = Math.max(0, p.qty - b.qty); });
  S.sales.unshift(sale);
  S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Completed sale ' + no, detail: fmt(total) + (credit ? ', ' + fmt(credit) + ' on credit' : '') });
  /* the one write that must be atomic once Postgres is behind this: the
     sale, its payments and the stock decrement, in one transaction */
  persist('sales', { sale, stock: basket.map((b) => ({ id: b.id, qty: b.qty })) });

  sale.customer_name = customerLabel();
  basket = []; pay = [{ m: 'Cash', amt: '' }];
  const keepCustomer = posCustomer.id !== 'c6' || posCustomer.walkin.trim();
  if (!keepCustomer) posCustomer = { id: 'c6', name: 'Walk-in', walkin: '', open: false };
  renderBasket(); renderPay(); renderCustomer();
  showReceipt(sale, change);
  toast('Sale ' + no + ' completed' + (credit ? ', ' + fmt(credit) + ' on credit' : ''), 'good');
  if (route === 'dashboard') renderDashboard();
}

function showReceipt(sale, change) {
  shownSale = sale;
  const c = cust(sale.customer);
  $('#receiptCard').hidden = false;
  $('#receiptNo').textContent = 'No. ' + sale.no + ' · ' + dmy(new Date(sale.at)) + ' ' + clock(new Date(sale.at));
  $('#receiptBody').innerHTML =
    '<div style="text-align:center">' +
    '<div class="shopname">' + esc(S.shop.name) + '</div>' +
    '<div class="hint">' + esc(S.shop.branch) + ' · ' + esc(S.shop.phone) + '<br>PIN ' + esc(S.shop.kra) + '</div>' +
    '</div><hr>' +
    '<div class="rline" style="font-size:11.5px;color:var(--ink-muted)"><span>Receipt</span><span class="num">' + esc(sale.no) + '</span></div>' +
    '<div class="rline" style="font-size:11.5px;color:var(--ink-muted)"><span>Cashier</span><span>' + esc(sale.cashier) + '</span></div>' +
    '<div class="rline" style="font-size:11.5px;color:var(--ink-muted)"><span>Customer</span><span>' + esc(sale.customer_name || (c ? c.name : 'Walk-in')) + '</span></div>' +
    '<hr>' +
    sale.items.map(it => '<div class="rline" style="margin-bottom:4px"><span>' + esc(it.name) + '<br><span class="hint">' + it.qty + ' × ' + fmt(it.price) + '</span></span>' +
      '<span class="num">' + fmt(it.qty * it.price) + '</span></div>').join('') +
    '<hr>' +
    '<div class="rline" style="font-weight:700;font-size:15px"><span>Total</span><span class="num">' + fmt(sale.total) + '</span></div>' +
    '<div class="rline" style="font-size:12px;color:var(--ink-muted)"><span>VAT 16% included</span><span class="num">' + fmt(sale.total * 16 / 116) + '</span></div>' +
    sale.paid.map(p => '<div class="rline" style="font-size:12px"><span>Paid · ' + esc(p.m) + '</span><span class="num">' + fmt(p.amt) + '</span></div>').join('') +
    (change > 0 ? '<div class="rline" style="font-size:12px"><span>Change</span><span class="num">' + fmt(change) + '</span></div>' : '') +
    (sale.credit > 0 ? '<div class="rline" style="color:var(--danger);font-size:12px"><span>On credit</span><span class="num">' + fmt(sale.credit) + '</span></div>' : '') +
    '<div class="etims">' + icon('badge-check', 'sm') +
    '<div><b>KRA eTIMS</b><br>Signature ' + esc(sale.etims.sig) + '<br>Invoice ' + esc(sale.etims.sig) + '-' + esc(sale.no) +
    '<br><span style="opacity:.75">Verify at etims.kra.go.ke</span></div></div>' +
    '<div style="text-align:center;margin-top:9px" class="hint">Asante kwa kununua nasi.</div>';
}

$('#completeSale').onclick = completeSale;
$('#walkInBtn').onclick = () => {
  posCustomer = { id: 'c6', name: 'Walk-in', walkin: '', open: false };
  renderCustomer();
};

/* everything printable goes through the same branded sheet */
function printDoc(inner, title) {
  $('#printSheet').innerHTML = '<div class="psheet">' +
    '<div class="phead"><div><div class="pname">' + esc(S.shop.name) + '</div>' +
    '<div class="pmeta" style="text-align:left;margin-top:3px">' + esc(S.shop.branch) + ' · ' + esc(S.shop.phone) +
    ' · PIN ' + esc(S.shop.kra) + '</div></div>' +
    '<div class="pmeta">' + esc(title) + '<br>' + dmy(now()) + ' ' + clock(now()) + '<br>Printed by ' + esc(S.me.name) + '</div></div>' +
    inner +
    '<div class="pfoot"><span>' + esc(S.shop.name) + ' · Shop Yangu Kenya</span>' +
    '<span>KRA eTIMS registered · etims.kra.go.ke</span></div></div>';
  document.body.classList.add('printing');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 400);
  }, 60);
}

function receiptDoc(s) {
  const c = cust(s.customer);
  const vat = s.total * 16 / 116;
  return '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-muted);margin-bottom:10px">' +
    '<span>Receipt <b style="color:var(--ink)">' + esc(s.no) + '</b></span>' +
    '<span>' + dmy(new Date(s.at)) + ' ' + clock(new Date(s.at)) + ' · ' + esc(s.cashier) + '</span></div>' +
    '<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>' +
    s.items.map(it => '<tr><td>' + esc(it.name) + '</td><td class="n">' + it.qty + '</td>' +
      '<td class="n">' + fmt(it.price) + '</td><td class="n">' + fmt(it.qty * it.price) + '</td></tr>').join('') +
    '</tbody></table>' +
    '<div class="ptotal"><span>Total</span><span class="num">' + fmt2(s.total) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-muted);margin-top:4px">' +
    '<span>VAT 16% included</span><span class="num">' + fmt2(vat) + '</span></div>' +
    s.paid.map(p => '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:2px">' +
      '<span>Paid · ' + esc(p.m) + '</span><span class="num">' + fmt2(p.amt) + '</span></div>').join('') +
    (s.credit > 0 ? '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:2px;color:var(--danger)">' +
      '<span>On credit, ' + esc((c || {}).name || '') + '</span><span class="num">' + fmt2(s.credit) + '</span></div>' : '') +
    '<h3>KRA eTIMS</h3>' +
    '<div style="font-size:11px;color:var(--ink-muted);line-height:1.7">Invoice ' + esc(s.etims.sig) + '-' + esc(s.no) +
    ' · signature ' + esc(s.etims.sig) + '<br>Verify this receipt at etims.kra.go.ke. Asante kwa kununua nasi.</div>';
}

let shownSale = null;
/* Three ways out of a receipt: paper (the browser's print dialog), a finished
   PDF, and an Excel file — the same pair every other export offers. */
$('#printReceipt').onclick = () => { if (shownSale) printDoc(receiptDoc(shownSale), 'Sales receipt'); };
$('#pdfReceipt').onclick = () => { if (shownSale) receiptPdf(shownSale); };
$('#xlsxReceipt').onclick = () => { if (shownSale) receiptExcel(shownSale); };
