/* ============================================================ point of sale */
const PAY_METHODS = [['Cash', 'banknote'], ['M-Pesa', 'smartphone'], ['Card', 'credit-card']];
let basket = [];
let pay = [{ m: 'Cash', amt: '' }];
/* '' is "everything", otherwise a category from S.cats */
let posCat = '';

function renderPOS() {
  renderCustomer();
  $('#posChips').innerHTML = '<button class="chip" data-poscat="" aria-pressed="true">All</button>' +
    S.cats.map(c => '<button class="chip" data-poscat="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>').join('');
  renderPOSResults($('#posSearch').value || '');
  renderBasket();
  renderPay();
}

/* Fast movers, for the empty search box. A shop with a queue does not want to
   type; it wants the six things it sold most. */
const FAST_MOVERS = ['p05', 'p06', 'p01', 'p03', 'p09', 'p14'];

function posList(term) {
  const q = (term || '').toLowerCase().trim();
  let list = S.products.filter(p =>
    (!posCat || p.cat === posCat) &&
    (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
  );
  if (!q && !posCat) {
    /* fast movers first, then the rest of the shelf, so a tap is nearly always
       quicker than a search */
    const fast = FAST_MOVERS.map(id => prod(id)).filter(Boolean);
    return fast.concat(list.filter(p => !FAST_MOVERS.includes(p.id)));
  }
  return list;
}

/* One tile per product: name, price, and how many are on the shelf. The whole
   tile is the button — a thumb hits a 96px square far more reliably than a
   40px "Add" at the end of a row, and nothing has to be scrolled to reach it. */
function renderPOSResults(q) {
  const list = posList(q);
  const box = $('#posResults');
  if (!list.length) {
    box.className = 'pos-grid pos-grid--empty';
    box.innerHTML = '<div class="empty"><b>Nothing matches that</b>' +
      '<p>Check the spelling, or scan the barcode on the pack.</p></div>';
    return;
  }
  box.className = 'pos-grid';
  box.innerHTML = list.map(p => {
    const out = p.qty === 0;
    const inBasket = basket.find(b => b.id === p.id);
    return '<button class="ptile' + (out ? ' ptile--out' : '') + (inBasket ? ' ptile--in' : '') + '"' +
      ' type="button" data-add="' + p.id + '"' + (out ? ' disabled aria-disabled="true"' : '') + '>' +
      '<span class="ptile__name">' + esc(p.name) + '</span>' +
      '<span class="ptile__price">' + fmt(p.price) + '</span>' +
      '<span class="ptile__meta">' + (out ? 'Out of stock' : p.qty + ' ' + esc(p.unit) + 's' +
        (posCat && !inBasket ? '' : '') ) + '</span>' +
      (inBasket ? '<span class="ptile__qty" aria-hidden="true">' + inBasket.qty + '</span>' : '') +
      '</button>';
  }).join('');
}

function renderBasket() {
  const b = $('#basket');
  if (!basket.length) {
    b.innerHTML = '<div class="pos-empty">' + icon('shopping-cart') +
      '<b>No items yet</b><span>Tap a product to start the sale.</span></div>';
    $('#basketCount').textContent = 'Nothing in it yet';
  } else {
    const n = sum(basket, it => it.qty);
    $('#basketCount').textContent = n + (n === 1 ? ' item' : ' items') + ' · ' + fmt(basketTotal());
    b.innerHTML = basket.map((it, i) =>
      '<div class="pl">' +
        '<div class="pl__top">' +
          '<span class="pl__name">' + esc(it.name) + '</span>' +
          '<span class="pl__amt num">' + fmt(it.price * it.qty) + '</span>' +
        '</div>' +
        '<div class="pl__bot">' +
          '<span class="pl__each">' + fmt(it.price) + ' each</span>' +
          '<div class="pstepper">' +
            '<button type="button" data-qty="' + i + ':-1" aria-label="One fewer ' + esc(it.name) + '">' + icon('minus', 'sm') + '</button>' +
            '<input class="num" value="' + it.qty + '" inputmode="numeric" data-qtyinput="' + i + '" aria-label="Quantity of ' + esc(it.name) + '" />' +
            '<button type="button" data-qty="' + i + ':1" aria-label="One more ' + esc(it.name) + '">' + icon('plus', 'sm') + '</button>' +
          '</div>' +
          '<button class="pl__del" type="button" data-remove="' + i + '" aria-label="Remove ' + esc(it.name) + '">' + icon('trash', 'sm') + '</button>' +
        '</div>' +
      '</div>').join('');
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

/* The customer is a pill beside the search box. It shows who the receipt will
   name and opens the picker; it costs no vertical space in the till. */
function renderCustomer() {
  const name = $('#posCustName');
  if (!name) return;
  const isWalk = posCustomer.id === 'c6';
  const c = isWalk ? null : cust(posCustomer.id);
  const label = customerLabel();
  name.textContent = label;
  const btn = $('#posCustomer');
  if (btn) {
    btn.classList.toggle('pos-cust--named', !isWalk);
    btn.setAttribute('aria-label', 'Customer: ' + label + '. Change it');
    btn.title = c ? c.phone + ' · owes ' + fmt(c.bal) : 'Walk-in — no account kept';
  }
}

function openCustomerSheet() {
  sheet({
    title: 'Who is buying?',
    sub: 'Search the list, or add someone new',
    body:
      '<div class="searchbox">' + icon('search') +
        '<input class="field" id="custSearch" placeholder="Name or phone number" autocomplete="off" />' +
      '</div>' +
      '<div id="custResults" style="margin-top:10px"></div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn secondary sm" id="useWalkin">' + icon('user-round', 'sm') + 'Walk-in</button>' +
        '<button class="btn ghost sm" id="nameWalkin">' + icon('pencil', 'sm') +
          (posCustomer.walkin.trim() ? 'Edit walk-in name' : 'Name the walk-in') + '</button>' +
        '<button class="btn secondary sm" id="newCustomer">' + icon('plus', 'sm') + 'New customer</button>' +
      '</div>',
    actions: [],
    onMount: () => {
      const search = $('#custSearch');
      const paint = (q) => {
        const needle = q.trim().toLowerCase();
        const list = S.customers.filter(c => c.id !== 'c6' && (!needle ||
          c.name.toLowerCase().includes(needle) || (c.phone || '').replace(/\s/g, '').includes(needle.replace(/\s/g, ''))));
        $('#custResults').innerHTML = list.length ? list.map(c =>
          '<button type="button" class="rowcard pickrow" data-pick="' + c.id + '">' +
            '<div class="top"><div style="min-width:0"><div class="ttl">' + esc(c.name) + '</div>' +
            '<div class="meta">' + esc(c.phone || 'no phone') + ' · limit ' + fmt(c.limit) + '</div></div>' +
            '<div class="amt">' + fmt(c.bal) + '</div></div></button>').join('')
          : '<p class="hint">No customer matches “' + esc(q) + '”. Add them with New customer.</p>';
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
      $('#nameWalkin').onclick = () => { closeSheet(); askWalkinName(); };
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
        S.audit.unshift({ at: now().toISOString(), who: S.user.name, what: 'Added customer ' + c.name, detail: fmt(c.bal) + ' opening balance' });
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
  /* the grid stays as it is — clearing the search on every tap made a cashier
     re-search for the second item on every sale */
  renderPOSResults($('#posSearch').value || '');
}

/* Focus goes to the search box when the till opens, so a barcode scanner and
   the keyboard both work without touching the screen first. */
function focusTill() {
  const q = $('#posSearch');
  if (q && !matchMedia('(max-width: 899px)').matches) q.focus({ preventScroll: true });
}

function updateTotals() {
  const total = basketTotal();
  const vat = total * 16 / 116;
  $('#tSub').textContent = fmt(total - vat);
  $('#tVat').textContent = fmt(vat);
  $('#tTotal').textContent = fmt(total);

  const paid = sum(pay, p => Number(p.amt) || 0);
  const diff = paid - total;
  /* What the customer holds out can be more than the bill (change) or less
     than it (the shortfall goes on their account). A part that is not filled
     in at all is not a decision yet, so it claims neither. */
  const typed = pay.some(p => String(p.amt).trim() !== '');
  const changeRow = $('#tChangeRow'), creditRow = $('#tCreditRow');
  changeRow.hidden = !(typed && diff > 0.5);
  creditRow.hidden = !(typed && diff < -0.5);
  if (typed && diff > 0.5) $('#tChange').textContent = fmt(diff);
  if (typed && diff < -0.5) $('#tCredit').textContent = fmt(-diff);

  $('#completeSale').disabled = !basket.length;
  const label = $('#completeSale');
  if (basket.length && typed && diff < -0.5) {
    label.innerHTML = icon('circle-check') + 'Complete and hold ' + fmt(-diff) + ' on credit';
  } else {
    label.innerHTML = icon('circle-check') + 'Complete sale';
  }
}

/* Payment is three method buttons and one amount field — not a card per
   method with its own header. A split adds a second amount under the first,
   which is the only extra row the cashier should ever see. */
function renderPay() {
  const total = basketTotal();
  const paidSoFar = sum(pay, p => Number(p.amt) || 0);
  const unpaid = total - paidSoFar;

  /* The method buttons act on the part the cashier is on: the only part, or
     the newest one when a split is open. */
  const active = pay[pay.length - 1];
  $('#payMethods').innerHTML = PAY_METHODS.map(([m, ic]) =>
    '<button type="button" class="paybtn" data-method="' + m + '" aria-pressed="' +
      (active.m === m) + '">' + icon(ic) + '<span>' + m + '</span></button>').join('');

  const parts = pay.map((p, i) => {
    const rest = total - sum(pay, (x, k) => (k === i ? 0 : Number(x.amt) || 0));
    return '<div class="payline">' +
      (pay.length > 1
        ? '<span class="payline__tag">' + esc(p.m) + '</span>'
        : '') +
      '<input class="field num" inputmode="decimal" placeholder="' +
        (total ? fmt(Math.max(0, rest)) : 'Amount') + '" data-payamt="' + i + '" value="' +
        (p.amt === '' ? '' : p.amt) + '" aria-label="Amount paid by ' + esc(p.m) + '" />' +
      '<button class="btn secondary sm" type="button" style="flex:none" data-fill="' + i + '">' +
        (pay.length === 1 ? 'Exact' : 'Rest') + '</button>' +
      (pay.length > 1
        ? '<button class="pl__del" type="button" data-delpay="' + i + '" aria-label="Remove this part">' + icon('x', 'sm') + '</button>'
        : '') +
      '</div>';
  }).join('');

  $('#payDetail').innerHTML = parts +
    (pay.length < 3
      ? '<button class="btn ghost sm paysplit" type="button" id="addSplit">' +
        icon('arrow-right-left', 'sm') + 'Split across methods</button>'
      : '<p class="hint" style="margin-top:8px">Three methods is the maximum on one sale.</p>');

  const add = $('#addSplit');
  if (add) add.onclick = () => {
    const used = pay.map(p => p.m);
    const next = PAY_METHODS.map(x => x[0]).find(m => !used.includes(m)) || 'Cash';
    const owed = Math.max(0, basketTotal() - sum(pay, p => Number(p.amt) || 0));
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
    /* repaint just the line's money and the running total, so the input the
       cashier is typing in never loses focus */
    const line = $('#basket .pl:nth-child(' + (i + 1) + ')');
    const amtEl = line && line.querySelector('.pl__amt');
    if (amtEl) amtEl.textContent = fmt(basket[i].price * basket[i].qty);
    updateTotals();
    $('#basketCount').textContent = sum(basket, it => it.qty) +
      (sum(basket, it => it.qty) === 1 ? ' item' : ' items') + ' · ' + fmt(basketTotal());
  }
});

document.addEventListener('click', e => {
  const t = e.target;
  const cat = t.closest('[data-poscat]');
  if (cat) {
    posCat = cat.dataset.poscat;
    $$('#posChips .chip').forEach(c =>
      c.setAttribute('aria-pressed', String(c === cat)));
    renderPOSResults($('#posSearch').value || '');
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
    pay[pay.length - 1].m = md.dataset.method;
    renderPay(); updateTotals();
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

/* On a phone the basket is one summary line; tapping it slides the lines out
   over the grid so the Charge button never leaves the screen. */
$('#foldBasket').onclick = () => {
  const ticket = $('.pos-ticket');
  const open = ticket.classList.toggle('pos-ticket--open');
  $('#foldBasket').setAttribute('aria-expanded', String(open));
  $('#foldBasket').querySelector('.sr-only').textContent = open ? 'Hide the basket' : 'Show the basket';
};

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
        '<button type="button" class="rowcard creditpick' + (c.id === chosen ? ' creditpick--on' : '') +
          '" data-credit="' + c.id + '">' +
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
  /* The receipt number is provisional. The server numbers receipts, in the
     same transaction that writes the sale, because two tills numbering their
     own would collide on the one number a customer might bring back. The
     provisional one is replaced the moment the API answers — see
     replaceLocalSale() in backend.js — and `pending` is what tells the
     receipt card to say "saving". */
  const provisional = 'S-' + String(S.sales.length + 1).padStart(4, '0');
  const sale = {
    no: provisional,
    pending: BACKEND.live,
    at: now().toISOString(),
    items: basket.map(b => ({ id: b.id, name: b.name, qty: b.qty, price: b.price, cost: b.cost, unit: b.unit })),
    total, paid: paidBits.map(p => ({ m: p.m, amt: Number(p.amt) })),
    credit,
    customer: customerId === 'c6' ? '' : customerId,
    etims: { status: 'pending', sig: '' }
  };
  basket.forEach(b => { const p = prod(b.id); if (p) p.qty = Math.max(0, p.qty - b.qty); });
  S.sales.unshift(sale);
  S.audit.unshift({ at: now().toISOString(), who: S.user.name, what: 'Completed sale ' + provisional, detail: fmt(total) + (credit ? ', ' + fmt(credit) + ' on credit' : '') });

  /* One request, one transaction on the server: the sale, its lines, its
     payments and the stock decrement either all happen or none of them do. */
  persist('sales', {
    items: sale.items,
    paid: sale.paid,
    customer: sale.customer || null,
    receipt: sale.no,
  }).then((result) => {
    if (!result || !result.sale) return;
    /* The server's number is the real one: update the receipt on screen if it
       is still the one being looked at. */
    sale.no = result.sale.no;
    if (shownSale === sale) {
      $('#receiptNo').textContent = 'No. ' + sale.no + ' · ' + dmy(new Date(sale.at)) + ' ' + clock(new Date(sale.at)) +
    (sale.pending ? ' · saving' : '');
    }
  });

  sale.customer_name = customerLabel();
  basket = []; pay = [{ m: 'Cash', amt: '' }];
  const keepCustomer = posCustomer.id !== 'c6' || posCustomer.walkin.trim();
  if (!keepCustomer) posCustomer = { id: 'c6', name: 'Walk-in', walkin: '', open: false };
  renderBasket(); renderPay(); renderCustomer();
  showReceipt(sale, change);
  toast('Sale recorded' + (credit ? ', ' + fmt(credit) + ' on credit' : ''), 'good');
  if (route === 'dashboard') renderDashboard();
}

function showReceipt(sale, change) {
  shownSale = sale;
  const c = cust(sale.customer);
  $('#receiptCard').hidden = false;
  $('#receiptNo').textContent = 'No. ' + sale.no + ' · ' + dmy(new Date(sale.at)) + ' ' + clock(new Date(sale.at)) +
    (sale.pending ? ' · saving' : '');
  $('#receiptBody').innerHTML =
    '<div class="rcptmark" aria-hidden="true"><svg viewBox="0 0 636 722"><use href="#i-logo"/></svg></div>' +
    '<div style="text-align:center">' +
    '<div class="shopname">' + esc(S.shop.name) + '</div>' +
    '<div class="hint">' + esc(S.shop.branch) + ' · ' + esc(S.shop.phone) + '<br>PIN ' + esc(S.shop.kra) + '</div>' +
    '</div><hr>' +
    '<div class="rline" style="font-size:11.5px;color:var(--ink-muted)"><span>Receipt</span><span class="num">' + esc(sale.no) + '</span></div>' +

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

/* After a receipt, the till is ready for the next customer in the queue:
   the ticket clears, the print block folds away, and the cursor is back in
   the search box. Nothing to scroll, nothing to dismiss. */
$('#closeReceipt').onclick = () => {
  $('#receiptCard').hidden = true;
  basket = []; pay = [{ m: 'Cash', amt: '' }];
  posCustomer = { id: 'c6', name: 'Walk-in', walkin: '', open: false };
  renderBasket(); renderPay(); renderCustomer();
  renderPOSResults($('#posSearch').value || '');
  focusTill();
};

/* everything printable goes through the same branded sheet */
function printDoc(inner, title) {
  /* The mark goes on the paper too. It is drawn as vector, in the shop's
     navy, at the size a thermal printer can hold: 14mm tall on an 80mm roll. */
  const mark = '<svg class="pmark" viewBox="0 0 636 722" aria-hidden="true"><use href="#i-logo"/></svg>';
  $('#printSheet').innerHTML = '<div class="psheet">' +
    '<div class="pmarkwrap">' + mark + '</div>' +
    '<div class="phead"><div><div class="pname">' + esc(S.shop.name) + '</div>' +
    '<div class="pmeta" style="text-align:left;margin-top:3px">' + esc(S.shop.branch) + ' · ' + esc(S.shop.phone) +
    ' · PIN ' + esc(S.shop.kra) + '</div></div>' +
    '<div class="pmeta">' + esc(title) + '<br>' + dmy(now()) + ' ' + clock(now()) + '</div></div>' +
    inner +
    '<div class="pfoot"><span>' + esc(S.shop.name) + ' · Shop Yangu Kenya</span>' +
    '<span>KRA eTIMS registered · etims.kra.go.ke</span></div></div>';
  /* A receipt is a till slip, so the paper is the roll: 80mm wide, no
     forced page height (the slip is as long as the sale). Everything else
     prints to A4 through the same sheet. */
  const isReceipt = /receipt/i.test(title);
  document.body.classList.add('printing');
  document.body.dataset.print = isReceipt ? 'receipt' : 'page';
  /* An 80mm roll is 72mm of ink. The browser is told the paper size, so the
     dialog comes up already on the till printer's roll rather than on A4. */
  let page = document.getElementById('printPage');
  if (isReceipt) {
    if (!page) {
      page = document.createElement('style');
      page.id = 'printPage';
      document.head.appendChild(page);
    }
    page.textContent = '@page{size:80mm auto;margin:3mm}';
  } else if (page) {
    page.remove();
  }
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing');
      delete document.body.dataset.print;
    }, 400);
  }, 60);
}

function receiptDoc(s) {
  const c = cust(s.customer);
  const vat = s.total * 16 / 116;
  return '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-muted);margin-bottom:10px">' +
    '<span>Receipt <b style="color:var(--ink)">' + esc(s.no) + '</b></span>' +
    '<span>' + dmy(new Date(s.at)) + ' ' + clock(new Date(s.at)) + '</span></div>' +
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
