/**
 * The site, served the way GitHub Pages serves it — from folder addresses,
 * with /404.html on a miss. `node build.js && node tools/serve.mjs` gives you
 * exactly what the live site is, at http://localhost:8080.
 *
 * No dependencies: this is a preview server, not part of the site.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
/* Pages serves the site from /Shop-Yangu-Kenya/, not the domain root. Set
   SUBPATH=/Shop-Yangu-Kenya to reproduce that exactly; every link is relative,
   so both mounts must work. */
const base = (process.env.SUBPATH || '').replace(/\/$/, '');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  let rel = decodeURIComponent(url.pathname);
  if (base) {
    if (!rel.startsWith(base + '/')) {
      res.writeHead(302, { location: base + '/' });
      return res.end();
    }
    rel = rel.slice(base.length);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);

  const send = (status, body, type) => {
    res.writeHead(status, {
      'content-type': type,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  };

  if (!file.startsWith(root)) return send(403, 'nope', 'text/plain');

  fs.readFile(file, (err, data) => {
    if (!err) return send(200, data, TYPES[path.extname(file)] || 'application/octet-stream');
    /* A folder without a trailing slash redirects, as Pages does. */
    fs.stat(file, (e2, st) => {
      if (!e2 && st.isDirectory() && !url.pathname.endsWith('/')) {
        res.writeHead(301, { location: url.pathname + '/' + url.search });
        return res.end();
      }
      /* /dashboard (no slash) is the same page as /dashboard/ — send it,
         which is how Pages behaves too. */
      fs.readFile(file + '.html', (e4, page) => {
        if (!e4) return send(200, page, 'text/html; charset=utf-8');
        fs.readFile(path.join(root, '404.html'), (e3, notFound) =>
          send(404, e3 ? 'Not found' : notFound, 'text/html; charset=utf-8')
        );
      });
    });
  });
});

server.listen(port, host, () => console.log(`serving dist/ on http://${host}:${port}`));
