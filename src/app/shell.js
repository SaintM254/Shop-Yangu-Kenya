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
  /* The last folder in the address is this screen's own folder — /stock,
     /sales — and everything before it is where the site is mounted. At a
     domain root that leaves '/', under GitHub Pages '/Shop-Yangu-Kenya/'. */
  const dir = location.pathname.replace(/\/[^/]*$/, '/');
  const parts = dir.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/') + (parts.length ? '/' : '');
})();

/* The folder name of the screen we opened — the fallback when the mount
   point cannot be worked out (a single folder, e.g. /stock/ on its own). */
const HERE = (location.pathname.replace(/\/+$/, '').split('/').pop() || '').toLowerCase();
const routeFromFolder = (folder) => ROUTE_IDS.find((id) => ROUTES[id] === '/' + folder) || null;

const idForPath = (p) => {
  let clean = String(p || '').replace(/\/+$/, '').replace(/\/index\.html$/, '');
  if (SITE_ROOT !== '/' && clean.indexOf(SITE_ROOT) === 0) clean = clean.slice(SITE_ROOT.length - 1);
  clean = clean.toLowerCase();
  const hit = ROUTE_IDS.find((id) => ROUTES[id] === clean);
  if (hit) return hit;
  /* An address the mount point cannot explain: read the last folder. A
     screen's own folder is named after its route, so it is the same answer. */
  const folder = clean.split('/').filter(Boolean).pop();
  return routeFromFolder(folder);
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

/* One login per shop: every screen is available to it, so the menu is the
   whole list and there is no role to filter by. */
function navGroups() {
  return NAV.filter((g) => g.items.length);
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
  const groups = navGroups();

  const links = $('#railLinks');
  links.innerHTML = '';
  groups.forEach((g) => {
    links.appendChild(el('div', 'navgroup', esc(g.group)));
    g.items.forEach((item) => links.appendChild(navButton(item, () => {})));
  });

  const foot = $('#railFoot');
  foot.innerHTML = '';
  const me = el('div', 'railme');
  me.innerHTML = '<b>' + esc(S.user.name) + '</b>Shop owner' +
    '<br>' + fmt(S.shop.plan) + ' / month';
  foot.appendChild(me);
  const out = el('button', 'railout');
  out.type = 'button';
  out.innerHTML = icon('log-out', 'sm') + '<span>Sign out</span>';
  out.onclick = signOut;
  foot.appendChild(out);

  /* Phones use the drawer and the tab bar. */
  const tabs = TABS;
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
  $('#topRole').textContent = 'Shop owner';
  $('#drawerShopName').textContent = S.shop.name;
  $('#drawerWho').textContent = S.user.name;
}

/* The mark in the rail and the phone bar is the way home inside the app.
   It navigates to the dashboard without leaving the app or touching the
   session — signing out is the button in the rail foot, and only that. */
document.addEventListener('click', (e) => {
  const home = e.target.closest('[data-home]');
  if (!home) return;
  e.preventDefault();
  go('dashboard');
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
