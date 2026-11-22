/* ============================================================ toasts */
function toast(msg, kind) {
  const t = el('div', 'toast ' + (kind || ''));
  t.innerHTML = (kind === 'bad' ? icon('alert') : icon('circle-check')) + '<span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

/* ============================================================ sheets */
function sheet(opts) {
  $('#sheetTitle').textContent = opts.title || '';
  $('#sheetSub').textContent = opts.sub || '';
  $('#sheetSub').hidden = !opts.sub;
  $('#sheetBody').innerHTML = opts.body || '';
  const foot = $('#sheetFoot');
  foot.innerHTML = '';
  (opts.actions || []).forEach(a => {
    const b = el('button', 'btn ' + (a.kind === undefined ? 'secondary' : a.kind), a.label);
    if (a.id) b.id = a.id;
    if (a.ghost) b.className = 'btn ghost';
    b.onclick = () => a.onClick && a.onClick();
    foot.appendChild(b);
  });
  foot.hidden = !(opts.actions || []).length;
  const panel = $('.sheet .panel');
  if (opts.wide) panel.setAttribute('data-wide', ''); else panel.removeAttribute('data-wide');
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (opts.onMount) setTimeout(() => opts.onMount(), 0);
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheet').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-close-sheet]')) closeSheet();
  if (e.target.closest('[data-close-drawer]')) closeDrawer();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeDrawer(); } });

function openDrawer() {
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
$('#menuBtn').onclick = openDrawer;
$('#bellBtn').onclick = () => {
  sheet({
    title: 'Notifications', sub: '3 things worth a look',
    body: `<div class="setrow"><div><div class="t">${icon('alert', 'sm')} Maize flour 2kg is low</div><div class="d">12 left, reorder level is 30.</div></div><button class="btn secondary sm" data-goto="inventory">Stock</button></div>
      <div class="setrow"><div><div class="t">${icon('calendar-days', 'sm')} KRA filing due 20 Dec</div><div class="d">One month of sales is ready to file.</div></div><button class="btn secondary sm" data-goto="etims">eTIMS</button></div>
      <div class="setrow"><div><div class="t">${icon('credit-card', 'sm')} Hotel Bahari is over 60% of its limit</div><div class="d">Ksh 21,400 of 40,000 used.</div></div><button class="btn secondary sm" data-goto="customers">Open</button></div>`
  });
};
