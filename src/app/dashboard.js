const GOAL = 60000;

function sparkline(vals, w = 320, h = 92) {
  const max = Math.max.apply(null, vals) * 1.12 || 1, min = Math.min.apply(null, vals) * 0.8;
  const span = max - min || 1;
  const pts = vals.map((v, i) => [
    (i / (vals.length - 1)) * w,
    h - ((v - min) / span) * (h - 12) - 6
  ]);
  /* a gentle cubic through the points, so it reads as a trend not a saw */
  let line = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
            ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  const area = line + ' L' + w + ' ' + h + ' L0 ' + h + ' Z';
  const last = pts[pts.length - 1];
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="gsyk" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#287094" stop-opacity=".22"/>' +
    '<stop offset="1" stop-color="#287094" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#gsyk)"/>' +
    '<path d="' + line + '" fill="none" stroke="#287094" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.6" fill="#fff" stroke="#287094" stroke-width="2.25"/>' +
    '</svg>';
}

function dayTotals(n) {
  const out = [];
  for (let d = n - 1; d >= 0; d--) {
    const key = ymd(addDays(today(), -d));
    out.push(sum(salesOn(key), s => s.total));
  }
  return out;
}

function renderDashboard() {
  const t = salesToday();
  const yesterday = sum(salesOn(ymd(addDays(today(), -1))), s => s.total);
  const todayTotal = sum(t, s => s.total);
  const profit = sum(t, s => s.amount || (s.total - costOf(s)));
  const yProfit = sum(salesOn(ymd(addDays(today(), -1))), s => s.total - costOf(s));
  const owed = sum(S.customers, c => c.bal);

  /* a sales user gets their own day, not the shop's profit */
  const owner = isOwner();
  ['#statProfit', '#statOwed'].forEach(sel => {
    const card = $(sel).closest('.stat');
    card.hidden = !owner;
  });
  if (!owner) {
    $('#goalAmount').closest('.goal').querySelector('h2').textContent = 'My sales today';
    $('#goalAmount').closest('.goal').querySelector('.sub').textContent = 'Your own receipts';
  }
  const pre = $('.pagehead h1');
  $('#greeting').textContent = (owner ? 'Karibu, ' : 'Habari, ') + S.me.name.split(' ')[0];
  $('#todayLine').textContent = longDate(now()) + ' · ' + S.shop.branch;
  $('#goalAmount').innerHTML = fmt2(todayTotal).replace(/\.(\d\d)$/, '<span class="cents">.$1</span>');
  $('#goalSpark').innerHTML = sparkline(dayTotals(7));

  const dSales = pct(todayTotal, yesterday);
  $('#statSales').textContent = fmt(todayTotal);
  $('#statProfit').textContent = fmt(profit);
  $('#statReceipts').textContent = t.length;
  $('#statOwed').textContent = fmt(owed);

  const salesFoot = $('#statSales').parentNode.querySelector('.f');
  salesFoot.innerHTML = deltaChip(dSales) + ' vs yesterday';
  const profFoot = $('#statProfit').parentNode.querySelector('.f');
  profFoot.innerHTML = deltaChip(pct(profit, yProfit)) + ' vs yesterday';
  $('#statReceipts').parentNode.querySelector('.f').textContent =
    'Average ' + fmt(t.length ? todayTotal / t.length : 0);
  $('#statOwed').parentNode.querySelector('.f').innerHTML =
    deltaChip(-8.2) + ' overdue';

  /* week bars, this week against last */
  const thisWeek = dayTotals(7), lastWeek = [];
  for (let d = 13; d >= 7; d--) lastWeek.push(sum(salesOn(ymd(addDays(today(), -d))), s => s.total));
  const peak = Math.max.apply(null, thisWeek.concat(lastWeek)) || 1;
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  $('#weekBars').innerHTML = thisWeek.map((v, i) => {
    const h1 = Math.max(2, (v / peak) * 100), h2 = Math.max(2, (lastWeek[i] / peak) * 100);
    return '<div class="col" title="' + labels[i] + ': ' + fmt(v) + ' this week, ' + fmt(lastWeek[i]) + ' last week">' +
      '<div class="pair">' +
      '<div class="bar prev" style="height:' + h2.toFixed(1) + '%"></div>' +
      '<div class="bar" style="height:' + h1.toFixed(1) + '%"></div>' +
      '</div><div class="x">' + labels[i] + '</div></div>';
  }).join('');

  /* needs attention */
  const low = S.products.filter(p => p.qty > 0 && p.qty <= p.reorder);
  const out = S.products.filter(p => p.qty === 0);
  const overLimit = S.customers.filter(c => c.limit && c.bal > c.limit * 0.6);
  $('#attention').innerHTML =
    rowAlert('package', low.length + ' low on stock', low.map(p => p.name).slice(0, 2).join(', ') || 'All good', 'inventory', 'low') +
    rowAlert('alert', out.length + ' out of stock', out.map(p => p.name).slice(0, 2).join(', ') || 'Nothing missing', 'inventory', 'out') +
    rowAlert('credit-card', overLimit.length + (overLimit.length === 1 ? ' customer is' : ' customers are') + ' near their limit', overLimit.map(c => c.name).slice(0, 2).join(', '), 'customers', 'low');

  /* recent receipts */
  $('#recentSales').innerHTML = S.sales.slice(0, 6).map(s => {
    const c = cust(s.customer);
    return '<div class="setrow"><div><div class="t">' + esc(s.no) + ' · ' + fmt(s.total) + '</div>' +
      '<div class="d">' + esc(c ? c.name : 'Walk-in') + ' · ' + clock(new Date(s.at)) + ' · ' + esc(s.cashier.split(' ')[0]) + '</div></div>' +
      (s.credit ? '<span class="pill low">' + fmt(s.credit) + ' credit</span>' : '<span class="pill ok">' + icon('check', 'sm') + 'Paid</span>') + '</div>';
  }).join('');

  /* top movers */
  const tallies = {};
  S.sales.forEach(s => s.items.forEach(it => {
    tallies[it.id] = tallies[it.id] || { name: it.name, qty: 0, value: 0 };
    tallies[it.id].qty += it.qty;
    tallies[it.id].value += it.qty * it.price;
  }));
  const top = Object.values(tallies).sort((a, b) => b.value - a.value).slice(0, 5);
  const topMax = top[0] ? top[0].value : 1;
  $('#topMovers').innerHTML = top.map(m =>
    '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px">' +
    '<span>' + esc(m.name) + '</span><span class="num" style="font-weight:600">' + fmt(m.value) + '</span></div>' +
    '<div class="progress" style="margin-top:5px"><span style="width:' + ((m.value / topMax) * 100).toFixed(0) + '%"></span></div>' +
    '<div class="hint">' + m.qty + ' sold</div></div>').join('');
}

function deltaChip(p) {
  const up = p >= 0;
  /* the brief's rule: red for a fall, green for a rise */
  return '<span class="delta ' + (up ? 'up' : 'down') + '">' + icon(up ? 'trending-up' : 'trending-down') +
    Math.abs(p).toFixed(1) + '%</span>';
}
function rowAlert(ic, title, sub, dest, kind) {
  return '<div class="setrow"><div style="display:flex;gap:10px;align-items:flex-start">' +
    '<span class="alerticon ' + kind + '">' + icon(ic, 'sm') + '</span>' +
    '<div><div class="t">' + esc(title) + '</div><div class="d">' + esc(sub) + '</div></div></div>' +
    '<button class="btn ghost sm" data-goto="' + dest + '">View</button></div>';
}
