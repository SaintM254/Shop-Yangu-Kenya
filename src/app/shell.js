/* ============================================================ routing

   Every screen is an address: /sales, /till, /reports. No .html anywhere, no
   # inside a link a customer can see, no page reload. The address bar is the
   state, so Back and Forward do what people expect.

   GitHub Pages serves static files, so /sales is a folder holding an empty
   index.html that 404s nothing and loads this app (build.js writes them all).
   Opening the file straight from disk still works: the boot script turns the
   path into a hash and the hash router below takes over. */

/* ============================================================ the menu

   One list, painted three ways: the rail on a laptop, a drawer and a tab bar
   on a phone. A route's key is its folder on the site (/dashboard, /till). */

const NAV = [
  { group: 'Overview', items: [['dashboard', 'layout-dashboard', 'Dashboard']] },
  { group: 'Selling', items: [
    ['pos', 'shopping-cart', 'Point of sale'],
    ['sales', 'receipt', 'Sales'],
  ] },
  { group: 'Stock', items: [
    ['inventory', 'package', 'Stock'],
    ['purchases', 'truck', 'Purchases'],
  ] },
  { group: 'Money', items: [
    ['customers', 'users', 'Customers'],
    ['reports', 'chart-column', 'Reports'],
  ] },
  { group: 'System', items: [
    ['etims', 'badge-check', 'KRA eTIMS'],
    ['migration', 'file-spreadsheet', 'Import records'],
    ['settings', 'settings', 'Settings'],
    ['audit', 'landmark', 'Audit log'],
  ] },
];

const TABS = [
  ['dashboard', 'layout-dashboard', 'Home'],
  ['pos', 'shopping-cart', 'Sell'],
  ['inventory', 'package', 'Stock'],
  ['customers', 'users', 'Customers'],
  ['reports', 'chart-column', 'Reports'],
];

const ROUTES = {
  dashboard: '/dashboard',
  pos: '/till',
  inventory: '/stock',
  purchases: '/purchases',
  sales: '/sales',
  customers: '/customers',
  migration: '/import',
  reports: '/reports',
  etims: '/etims',
  settings: '/settings',
  audit: '/audit',
};
const ROUTE_IDS = Object.keys(ROUTES);

/* Where does this site start? Pages serves it from /Shop-Yangu-Kenya/, so the
   app must not assume the domain root. Everything below is built from this. */
const SITE_ROOT = (() => {
  if (location.protocol === 'file:') return '';
  /* the folder the app is in is <root><route>/, so take the route off */
  const parts = location.pathname.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.slice(0, -1).concat(['']).join('/');
})();

const idForPath = (p) => {
  let clean = String(p || '').replace(/\/+$/, '').replace(/\/index\.html$/, '');
  if (SITE_ROOT && clean.indexOf(SITE_ROOT) === 0) clean = clean.slice(SITE_ROOT.length - 1);
  clean = clean.toLowerCase();
  const hit = ROUTE_IDS.find((id) => ROUTES[id] === clean);
  return hit || null;
};

/* A hash link is still an address, just a shorter one; accept both. */
function idFromHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!raw) return null;
  if (ROUTES[raw]) return raw;
  const byPath = idForPath('/' + raw);
  return byPath || null;
}

function pathFor(id) {
  /* When the app is opened from disk there is no server to answer /sales, so
     stay on a hash address rather than a 404. */
  if (location.protocol === 'file:') return '#/' + id;
  /* A relative URL from a page at <root><route>/: ../sales/ */
  return '..' + ROUTES[id] + '/';
}

let route = 'dashboard';

function go(id, opts) {
  if (!ROUTE_IDS.includes(id)) id = 'dashboard';
  if (!$('#s-' + id)) return;
  const allowed = navFor(S.me.role).some((g) => g.items.some((i) => i[0] === id));
  if (!allowed) {
    toast('That section is for the owner.', 'bad');
    return;
  }
  route = id;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-' + id));
  paintNav();
  const url = pathFor(id);
  if (opts && opts.replace) history.replaceState({ route: id }, '', url);
  else if (!(opts && opts.silent)) history.pushState({ route: id }, '', url);
  document.title = titleFor(id);
  if (!(opts && opts.keepScroll)) window.scrollTo({ top: 0 });
  RENDER[id] && RENDER[id]();
}

function titleFor(id) {
  const el2 = $('#s-' + id);
  const name = (el2 && el2.dataset.title) || 'Shop Yangu Kenya';
  return name + ' — Shop Yangu Kenya';
}

addEventListener('popstate', () => {
  const id = idForPath(location.pathname) || idFromHash(location.hash) || 'dashboard';
  go(id, { silent: true });
});

addEventListener('hashchange', () => {
  const id = idFromHash(location.hash);
  if (id && id !== route) go(id, { silent: true });
});

/* Clicks on any in-app link or button that names a screen. */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (a) {
    const href = a.getAttribute('href');
    const id = href && (idForPath(href) || idFromHash(href));
    const sameSite = a.target !== '_blank' && !/^(https?:|mailto:|tel:)/.test(href || '');
    if (id && sameSite) {
      e.preventDefault();
      go(id);
      return;
    }
  }
  const b = e.target.closest('[data-goto]');
  if (b) {
    go(b.dataset.goto);
    closeDrawer();
    closeSheet();
  }
});

/* ============================================================ the rail */

const RAIL_KEY = 'syk-rail';

function railIsClosed() {
  try {
    return localStorage.getItem(RAIL_KEY) === 'closed';
  } catch (err) {
    return false;
  }
}

function setRail(closed) {
  const app = $('#app');
  app.setAttribute('data-rail', closed ? 'closed' : 'open');
  const btn = $('#railToggle');
  const label = closed ? 'Expand the menu' : 'Collapse the menu';
  btn.setAttribute('aria-expanded', String(!closed));
  btn.setAttribute('aria-label', label);
  btn.title = label;
  try {
    localStorage.setItem(RAIL_KEY, closed ? 'closed' : 'open');
  } catch (err) {}
  /* The collapse state is remembered between visits and between screens. */
}

function initRail() {
  setRail(railIsClosed());
  $('#railToggle').addEventListener('click', () => {
    setRail($('#app').getAttribute('data-rail') !== 'closed');
  });
}

/* ============================================================ nav paint */

function navFor(role) {
  const allow = role === 'owner'
    ? ['dashboard', 'pos', 'sales', 'inventory', 'purchases', 'customers', 'reports', 'etims', 'migration', 'settings', 'audit']
    : ['dashboard', 'pos', 'sales', 'inventory', 'purchases'];
  return NAV.map((g) => ({ group: g.group, items: g.items.filter((i) => allow.includes(i[0])) })).filter((g) => g.items.length);
}

function navButton([id, ic, label], onPick, extraClass) {
  const a = el('button', 'navlink' + (extraClass ? ' ' + extraClass : ''));
  a.type = 'button';
  a.dataset.label = label;
  a.innerHTML = icon(ic) + '<span>' + esc(label) + '</span>';
  if (id === route) a.setAttribute('aria-current', 'page');
  a.onclick = () => {
    onPick();
    go(id);
  };
  return a;
}

function paintNav() {
  const groups = navFor(S.me.role);

  const links = $('#railLinks');
  links.innerHTML = '';
  groups.forEach((g) => {
    links.appendChild(el('div', 'navgroup', esc(g.group)));
    g.items.forEach((item) => links.appendChild(navButton(item, () => {})));
  });

  const foot = $('#railFoot');
  foot.innerHTML = '';
  const me = el('div', 'railme');
  me.innerHTML = '<b>' + esc(S.me.name) + '</b>' +
    (isOwner() ? 'Owner · everything' : 'Sales · till and stock') +
    '<br>' + fmt(S.shop.plan) + ' / month';
  foot.appendChild(me);
  const out = el('button', 'railout');
  out.type = 'button';
  out.innerHTML = icon('log-out', 'sm') + '<span>Sign out</span>';
  out.onclick = signOut;
  foot.appendChild(out);

  /* Phones use the drawer and the tab bar. */
  const tabs = TABS.filter((t) => navFor(S.me.role).some((g) => g.items.some((i) => i[0] === t[0])));
  const tabbar = $('#tabbar');
  tabbar.innerHTML = '';
  tabs.forEach(([id, ic, label]) => {
    const b = el('button');
    b.type = 'button';
    b.innerHTML = icon(ic) + '<span>' + label + '</span>';
    if (id === route) b.setAttribute('aria-current', 'page');
    b.onclick = () => go(id);
    tabbar.appendChild(b);
  });

  const drawerLinks = $('#drawerLinks');
  drawerLinks.innerHTML = '';
  groups.forEach((g) => {
    drawerLinks.appendChild(el('div', 'navgroup', esc(g.group)));
    g.items.forEach((item) => drawerLinks.appendChild(navButton(item, closeDrawer)));
  });

  $('#topShopName').textContent = S.shop.name;
  $('#topRole').textContent = isOwner() ? 'Owner' : 'Sales';
  $('#drawerShopName').textContent = S.shop.name;
  $('#drawerWho').textContent = S.me.name + ' · ' + (isOwner() ? 'Owner' : 'Sales');
  $('#roleSwitchLabel').textContent = 'Viewing as ' + (isOwner() ? 'Owner' : 'Sales');
}

/* switching role, so the shop can see both sides */
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-role-switch]')) return;
  if (S.me.role === 'owner') {
    S.me.role = 'sales';
    S.me.name = 'Otieno Were';
    toast('Now viewing as sales. Reports, costs and settings are hidden.');
  } else {
    S.me.role = 'owner';
    S.me.name = 'Wanjiku Kamau';
    toast('Back to the owner view.');
  }
  paintNav();
  go(navFor(S.me.role).some((g) => g.items.some((i) => i[0] === route)) ? route : 'pos', { silent: true });
});

/* ============================================================ session

   The demo signs in on the login page and stores who it is in sessionStorage.
   This is a demonstration: there is no server and no password is checked
   here. When Postgres is connected, `boot` becomes a call to
   GET /api/session and S is filled from the database — nothing else in the
   app needs to change. */

const SIGNED_IN_KEY = 'syk-signed-in';

function sessionUser() {
  try {
    return JSON.parse(sessionStorage.getItem(SIGNED_IN_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function requireSession() {
  const user = sessionUser();
  if (user) return user;
  /* Straight to the till without signing in: send them to the door, and bring
     them back to the screen they asked for. */
  if (location.protocol !== 'file:') {
    location.replace('../login/?next=' + encodeURIComponent(location.pathname.split('/').filter(Boolean).pop()));
  } else {
    location.replace('../../login/index.html');
  }
  return null;
}

function signOut() {
  try {
    sessionStorage.removeItem(SIGNED_IN_KEY);
  } catch (err) {}
  location.href = location.protocol === 'file:' ? '../../login/index.html' : '../login/';
}
