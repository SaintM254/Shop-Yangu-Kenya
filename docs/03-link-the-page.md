# 3 · How the published page finds the API

This is the step that trips people up, because GitHub Pages is **static**.
There is no server on `saintm254.github.io` that can run `api/server.js`. The
page and the API are two different things on two different hosts, and something
has to tell the page where the other one is.

## The one line

At build time, `build.js` writes the API's address into every page:

```bash
API_URL=https://your-api-host.example.com node build.js
```

which produces, in each page:

```html
<script>window.SYK_API = "https://your-api-host.example.com";</script>
```

`src/app/backend.js` reads it once:

```js
base: window.SYK_API || ''
```

Empty means **same origin** — which is what you get in development, when the
API serves `dist/` itself. So the code is identical in both worlds, and there
is no build-time branch to forget.

## Three ways to arrange it

### A. The API serves the site (simplest, and what development uses)

```
https://shop.yourdomain.co.ke/        ← the API, serving dist/
https://shop.yourdomain.co.ke/api/*   ← the same process
```

`SERVE_SITE=true`, `API_URL` blank. Same origin, so cookies are ordinary
first-party cookies and there is nothing to configure. You lose GitHub Pages,
but you gain a single deploy and no CORS.

### B. Pages for the site, API on its own host (what this repo does)

```
https://saintm254.github.io/Shop-Yangu-Kenya/   ← Pages, static
https://your-api-host.example.com/api/*         ← the Node API
```

Two things must be right:

1. **Build with `API_URL` set.** Otherwise the page looks for `/api/` on
   github.io and gets a 404 — the app will say the server is not answering.
2. **The API must allow that origin.** In `api/.env`:

   ```ini
   CORS_ORIGINS=https://saintm254.github.io
   ```

   and because the cookie now travels cross-site, it needs the third-party
   cookie rules to be satisfied: `SameSite=None; Secure` and a hostname the
   browser treats as the same *site* is the only reliable way. On
   `github.io` you cannot set that, so **cookies will not persist for A-the-
   subdomain-style cross-site setups** in Safari and increasingly in Chrome.

   In practice: use option **A**, or option **C**.

### C. Pages for the site, API behind the same domain (best of both)

Put a small proxy in front so the browser only ever sees one origin:

```
https://shop.yourdomain.co.ke/            → proxies to GitHub Pages
https://shop.yourdomain.co.ke/api/*       → proxies to the Node API
```

Cloudflare, nginx and Caddy all do this in a few lines. Then `API_URL` stays
blank, cookies are first-party again, and Pages still does the publishing.

A Caddy example:

```
shop.yourdomain.co.ke {
  handle /api/* {
    reverse_proxy http://127.0.0.1:8787
  }
  handle {
    reverse_proxy https://saintm254.github.io {
      header_up Host saintm254.github.io
    }
  }
}
```

## Why `window.SYK_API` and not a config file?

A `config.json` has to be fetched before the first request, which means two
round trips and a failure mode where the first paint has no idea where the
server is. One inline variable is available to the very first line of
`app.js`.

It also means the address is visible in the HTML, which is fine: an API
address is not a secret. The secrets are the pepper, the M-Pesa passkey and the
SMTP password, and none of those ever reach the browser.

## Verifying the link

Open the published page and, in the browser console:

```js
window.SYK_API          // "" for same-origin, or the host you built with
fetch((window.SYK_API||'') + '/api/health').then(r => r.json())
```

A JSON blob with `"ok": true` means the page can reach the API. A CORS error in
the console means `CORS_ORIGINS` does not list the exact origin — including
the scheme, and no trailing slash.

The app itself says which of these is wrong. If it cannot reach the API it
shows:

> The shop server is not answering. Showing the copy saved on this device.

and the till keeps working, queuing sales. That fallback is deliberate: a shop
loses money every minute it cannot sell.
