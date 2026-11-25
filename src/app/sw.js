/* ============================================================ service worker

   What this does, and what it deliberately does not.

   It caches the shop's own shell — the app page, its two stylesheets, its one
   script, the icons, the manifest — so that opening the installed app on a
   duka's flaky connection shows the till immediately instead of a blank screen
   and a spinner. It never caches anything else: no receipts, no customer data,
   no stock numbers. Those are written in the browser's own storage by the app
   and are not network requests at all.

   Strategy, in one line each:

   - Navigations: network first, then the cache, then the offline page. A shop
     that is online always gets fresh numbers; a shop that is not still gets a
     till it can open.
   - Same-origin GETs (CSS, JS, icons): stale-while-revalidate. Instant, and it
     updates itself in the background for next time.
   - Anything cross-origin (there is nothing today): untouched, straight to the
     network.

   Bump CACHE_VERSION when the shell changes shape. The old cache is deleted on
   activate, so a shop is never served a stale stylesheet after a deploy.
   ========================================================================= */

const CACHE_VERSION = 'syk-shell-v1';

/* The shell, as paths relative to this worker at the site root. The build
   writes every route folder with the same CSS and JS, so one copy of each
   asset is all the cache needs. */
const SHELL = [
  './',
  './dashboard/',
  './till/',
  './styles.css',
  './app/app.css',
  './app/app.js',
  './favicon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './manifest.json',
  './offline/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      /* addAll rejects the whole install if one file 404s, and a worker that
         failed to install is a worker that never runs — so each file is added
         on its own and a miss is tolerated. */
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  /* the page can ask a waiting worker to take over after an update */
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* A page: the network's answer if it arrives, otherwise the cache, so an
     offline tap on the home-screen icon still opens the app. */
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = (await caches.match(req)) || (await caches.match('./offline/'));
          if (cached) return cached;
          return new Response('You are offline. Reconnect and open Shop Yangu again.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  /* Everything else same-origin: serve from the cache at once, refresh it in
     the background. */
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })()
  );
});
