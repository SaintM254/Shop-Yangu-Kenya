/* ============================================================ stock */
let invFilter = 'All', invTerm = '';

function stockBadge(p) {
  if (p.qty === 0) return '<span class="pill out"><span class="dot"></span>Out</span>';
  if (p.qty <= p.reorder) return '<span class="pill low"><span class="dot"></span>Low</span>';
  return '<span class="pill ok"><span class="dot"></span>In stock</span>';
}
function expBadge(p) {
  if (!p.exp) return '';
  const days = Math.round((new Date(p.exp) - today()) / 86400000);
  if (days < 0) return '<span class="pill out">Expired</span>';
  if (days <= 30) return '<span class="pill low">Expires in ' + days + ' days</span>';
  return '';
}

function renderInventory() {
  const list = S.products;
  $('#invCount').textContent = list.length;
  $('#invValue').closest('.stat').hidden = !isOwner();
  $('#invValue').textContent = fmt(sum(list, p => p.cost * p.qty));
  $('#invLow').textContent = list.filter(p => p.qty > 0 && p.qty <= p.reorder).length;
  $('#invOut').textContent = list.filter(p => p.qty === 0).length;

  $('#invChips').innerHTML = ['All'].concat(S.cats, ['Low stock']).map(c =>
    '<button class="chip" data-invcat="' + esc(c) + '" aria-pressed="' + (invFilter === c) + '">' + esc(c) + '</button>').join('');
  renderInvList();
}

function renderInvList() {
  let list = S.products.filter(p => {
    const t = invTerm.toLowerCase();
    const okTerm = !t || p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t);
    const okCat = invFilter === 'All' || (invFilter === 'Low stock' ? p.qty <= p.reorder : p.cat === invFilter);
    return okTerm && okCat;
  });
  if (!list.length) { $('#invList').innerHTML = '<div class="empty"><b>Nothing here</b><p>No product matches that filter.</p></div>'; return; }

  const rows = list.map(p =>
    '<tr data-open="' + p.id + '" style="cursor:pointer">' +
    '<td><b>' + esc(p.name) + '</b><div class="hint">' + esc(p.sku) + ' · ' + esc(p.cat) + '</div></td>' +
    '<td class="num">' + p.qty + ' <span class="hint">' + esc(p.unit) + 's</span></td>' +
    (isOwner() ? '<td class="num">' + fmt(p.cost) + '</td>' : '') +
    '<td class="num">' + fmt(p.price) + '</td>' +
    (isOwner() ? '<td class="num">' + fmt(p.price - p.cost) + '</td>' : '') +
    '<td>' + stockBadge(p) + (p.exp ? ' <span class="hint">' + (expBadge(p) || 'exp ' + p.exp) + '</span>' : '') + '</td>' +
    '</tr>').join('');

  $('#invList').innerHTML =
    '<div class="tablewrap desk"><table><thead><tr><th>Product</th><th>Qty</th>' +
    (isOwner() ? '<th>Cost</th>' : '') + '<th>Price</th>' + (isOwner() ? '<th>Margin</th>' : '') + '<th>Status</th></tr></thead>' +
    '<tbody>' + rows.replace(/<tr data-open="([^"]+)"/g, '<tr data-openrows="$1"') + '</tbody></table></div>' +
    '<div class="cards-mobile">' + list.map(p =>
      '<div class="rowcard"><div class="top"><div style="min-width:0"><div class="ttl">' + esc(p.name) + '</div>' +
      '<div class="meta">' + esc(p.sku) + ' · ' + fmt(p.price) + ' per ' + esc(p.unit) +
      (isOwner() ? ' · cost ' + fmt(p.cost) : '') + '</div></div>' +
      '<div class="amt">' + p.qty + '<small style="font-size:10px;color:var(--ink-muted)"> ' + esc(p.unit) + '</small></div></div>' +
      '<div class="bottom">' + stockBadge(p) + (expBadge(p) ? ' ' + expBadge(p) : '') +
      '<button class="btn secondary sm" data-edit="' + p.id + '">' + icon('pencil', 'sm') + 'Adjust</button></div></div>').join('') + '</div>';
}

$('#invSearch').addEventListener('input', e => { invTerm = e.target.value; renderInvList(); });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-invcat]');
  if (c) { invFilter = c.dataset.invcat; renderInventory(); }
  const ed = e.target.closest('[data-edit]') || e.target.closest('[data-openrows]');
  if (ed) openProduct(ed.dataset.edit || ed.dataset.openrows);
  if (e.target.closest('[data-add-product]')) openProduct(null);
});

/* ---- the stock editor: touch friendly, one product ---- */
function openProduct(id) {
  const p = id ? prod(id) : null;
  sheet({
    title: p ? p.name : 'New product',
    sub: p ? p.sku + ' · ' + p.cat : 'It will appear on the till straight away',
    body:
      '<div class="formrow"><label class="lbl" for="pName">Name</label>' +
      '<input class="field" id="pName" value="' + esc(p ? p.name : '') + '" placeholder="e.g. Sugar 2kg" /></div>' +
      '<div class="formrow"><label class="lbl" for="pSku">Code / barcode</label>' +
      '<input class="field" id="pSku" value="' + esc(p ? p.sku : '') + '" placeholder="GRC-021" /></div>' +
      '<div class="formrow"><label class="lbl" for="pCat">Category</label>' +
      '<select class="field" id="pCat">' + S.cats.map(c => '<option' + (p && p.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px">' +
      '<div><label class="lbl" for="pCost">Cost price</label><input class="field num" id="pCost" inputmode="decimal" value="' + (p ? p.cost : '') + '" /></div>' +
      '<div><label class="lbl" for="pPrice">Selling price</label><input class="field num" id="pPrice" inputmode="decimal" value="' + (p ? p.price : '') + '" /></div>' +
      '</div>' +
      '<div class="formrow" style="margin-top:11px"><label class="lbl" for="pQty">Quantity on the shelf</label>' +
      '<div class="stepper" style="height:52px">' +
      '<button data-step="pQty:-1" aria-label="One fewer">' + icon('minus') + '</button>' +
      '<input class="num" id="pQty" inputmode="numeric" value="' + (p ? p.qty : '0') + '" />' +
      '<span class="u">' + esc(p ? p.unit + 's' : '') + '</span>' +
      '<button data-step="pQty:1" aria-label="One more">' + icon('plus') + '</button></div>' +
      '<div class="chips" style="margin-top:9px;padding:2px 1px">' + [1, 6, 12, 24, 48].map(n =>
        '<button class="chip" data-addqty="' + n + '">+' + n + '</button>').join('') + '</div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px">' +
      '<div><label class="lbl" for="pReorder">Reorder at</label><input class="field num" id="pReorder" inputmode="numeric" value="' + (p ? p.reorder : 10) + '" /></div>' +
      '<div><label class="lbl" for="pExp">Expiry, if any</label><input class="field" id="pExp" type="date" value="' + (p ? p.exp : '') + '" /></div>' +
      '</div>' +
      '<p class="hint" style="margin-top:9px">Quantity is what is physically on the shelf after this count. It replaces the old figure, so a stock-take is just a new number.</p>',
    actions: [
      { label: p ? 'Save changes' : 'Add product', kind: '', onClick: () => saveProduct(p) },
      ...(p ? [{ label: 'Remove', ghost: true, onClick: () => {
        sheet({
          title: 'Remove ' + p.name + '?', sub: 'This cannot be undone',
          body: '<p style="font-size:13px">The product leaves the price list. Any receipt that already includes it keeps its own copy, so old sales still add up.</p>',
          actions: [
            { label: 'Keep it' },
            { label: 'Remove', onClick: () => {
              S.products = S.products.filter(x => x.id !== p.id);
              S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Removed ' + p.name, detail: 'Was ' + fmt(p.price) });
              closeSheet(); renderInventory(); toast('Removed ' + p.name);
            }}
          ]
        });
      } }] : [])
    ],
    onMount: () => {
      $('#sheetBody').addEventListener('click', ev => {
        const st = ev.target.closest('[data-step]');
        if (st) {
          const [fid, d] = st.dataset.step.split(':');
          const inp = document.getElementById(fid);
          inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + Number(d));
        }
        const aq = ev.target.closest('[data-addqty]');
        if (aq) {
          const inp = document.getElementById('pQty');
          inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + Number(aq.dataset.addqty));
        }
      });
    }
  });
}

function saveProduct(p) {
  const name = $('#pName').value.trim();
  const price = Number($('#pPrice').value) || 0;
  if (!name) { toast('A product needs a name.', 'bad'); return; }
  if (price <= 0) { toast('A product needs a selling price.', 'bad'); return; }
  const data = {
    name, sku: $('#pSku').value.trim() || 'SKU-' + Math.floor(Math.random() * 9000 + 1000),
    cat: $('#pCat').value, cost: Number($('#pCost').value) || 0, price,
    qty: Math.max(0, parseInt($('#pQty').value, 10) || 0),
    reorder: Math.max(0, parseInt($('#pReorder').value, 10) || 0),
    exp: $('#pExp').value, unit: p ? p.unit : 'piece'
  };
  if (p) Object.assign(p, data);
  else S.products.push(Object.assign({ id: 'p' + (S.products.length + 1) + 'x' }, data));
  S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: (p ? 'Edited ' : 'Added ') + name, detail: p ? 'Stock now ' + data.qty : 'Opening stock ' + data.qty });
  closeSheet();
  renderInventory();
  toast(p ? 'Saved ' + name : 'Added ' + name, 'good');
}

/* ============================================================ purchases */
function renderPurchases() {
  $('#poCount').textContent = S.pos.length + ' orders';
  $('#poList').innerHTML = S.pos.map(po => {
    const kind = po.status === 'received' ? 'ok' : po.status === 'ordered' ? 'info' : 'neutral';
    return '<div class="rowcard"><div class="top"><div style="min-width:0">' +
      '<div class="ttl">' + esc(po.no) + ' · ' + esc(sup(po.supplier).name) + '</div>' +
      '<div class="meta">' + dmy(new Date(po.at)) + ' · ' + po.lines + ' lines</div></div>' +
      '<div class="amt">' + fmt(po.total) + '</div></div>' +
      '<div class="bottom"><span class="pill ' + kind + '"><span class="dot"></span>' + po.status[0].toUpperCase() + po.status.slice(1) + '</span>' +
      '<div style="display:flex;gap:6px">' +
      (po.status !== 'received' ? '<button class="btn secondary sm" data-receive="' + po.no + '">' + icon('package', 'sm') + 'Receive</button>' : '') +
      '<button class="btn ghost sm" data-viewpo="' + po.no + '">Open</button></div></div></div>';
  }).join('');
  $('#supplierList').innerHTML = S.suppliers.map(s =>
    '<div class="setrow"><div><div class="t">' + esc(s.name) + '</div>' +
    '<div class="d">' + esc(s.phone) + ' · ' + esc(s.terms) + '</div></div>' +
    '<div style="text-align:right"><div class="num" style="font-weight:600;font-size:14px">' + fmt(s.owed) + '</div>' +
    '<div class="hint">' + (s.owed ? 'owed' : 'settled') + '</div></div></div>').join('');
}

document.addEventListener('click', e => {
  const rec = e.target.closest('[data-receive]');
  if (rec) {
    const po = S.pos.find(x => x.no === rec.dataset.receive);
    po.status = 'received';
    S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Received ' + po.no, detail: fmt(po.total) + ' from ' + sup(po.supplier).name });
    renderPurchases();
    toast(po.no + ' marked received, stock updated', 'good');
  }
  const view = e.target.closest('[data-viewpo]');
  if (view) {
    const po = S.pos.find(x => x.no === view.dataset.viewpo);
    sheet({
      title: po.no, sub: sup(po.supplier).name + ' · ' + dmy(new Date(po.at)),
      body: '<dl class="kv"><dt>Status</dt><dd>' + po.status + '</dd><dt>Lines</dt><dd>' + po.lines + '</dd>' +
        '<dt>Total</dt><dd class="num">' + fmt(po.total) + '</dd><dt>Terms</dt><dd>' + esc(sup(po.supplier).terms) + '</dd></dl>' +
        '<p class="hint" style="margin-top:11px">Receiving an order puts its quantities on the shelf and raises what you owe the supplier. In the real product every line is a product, a quantity and a unit cost.</p>',
      actions: [{ label: 'Close' }]
    });
  }
  if (e.target.closest('[data-new-po]')) {
    sheet({
      title: 'New purchase order', sub: 'Order stock from a supplier',
      body: '<div class="formrow"><label class="lbl" for="poSup">Supplier</label><select class="field" id="poSup">' +
        S.suppliers.map(s => '<option>' + esc(s.name) + '</option>').join('') + '</select></div>' +
        '<div class="formrow"><label class="lbl" for="poItem">First item</label><select class="field" id="poItem">' +
        S.products.map(p => '<option>' + esc(p.name) + '</option>').join('') + '</select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px">' +
        '<div><label class="lbl" for="poQty">Quantity</label><input class="field num" id="poQty" inputmode="numeric" value="12" /></div>' +
        '<div><label class="lbl" for="poCost">Unit cost</label><input class="field num" id="poCost" inputmode="decimal" value="205" /></div></div>' +
        '<p class="hint" style="margin-top:9px">A draft order can be edited freely. Stock only moves when you receive it.</p>',
      actions: [{ label: 'Save as draft', kind: '', onClick: () => {
        const supName = $('#poSup').value;
        const s = S.suppliers.find(x => x.name === supName);
        const total = (Number($('#poQty').value) || 0) * (Number($('#poCost').value) || 0);
        S.pos.push({ no: 'PO-' + (1046 + S.pos.length), supplier: s.id, at: ymd(today()), status: 'draft', total, lines: 1 });
        S.audit.unshift({ at: now().toISOString(), who: S.me.name, what: 'Created purchase order', detail: supName + ', ' + fmt(total) });
        closeSheet(); renderPurchases(); toast('Draft order saved');
      }}]
    });
  }
});
