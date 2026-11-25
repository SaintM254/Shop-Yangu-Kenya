/* ============================================================ api/lib/http.js

   The HTTP plumbing: JSON in, JSON out, cookies, and errors that carry a
   message the shop can actually read.

   No framework. Three hundred lines of Express would do the same thing and
   add a dependency to audit.
*/

import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Please sign in again.') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have access to that.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
export const conflict = (msg, extra) => new HttpError(409, msg, extra);
export const tooMany = (msg, extra) => new HttpError(429, msg, extra);

/* ------------------------------------------------------------------ body */

const MAX_BODY = 2 * 1024 * 1024; /* 2 MB: an import file goes through its own route */

export function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
    const ctype = String(req.headers['content-type'] || '');
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'That request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      if (ctype.includes('application/json')) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(badRequest('That request was not valid JSON.'));
        }
      } else {
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}

/* ---------------------------------------------------------------- output */

export function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    /* The API is never a page: no sniffing, no framing. */
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
    ...headers,
  });
  res.end(payload);
}

/* ------------------------------------------------------------------ cookies */

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function cookie(name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) bits.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  bits.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure) bits.push('Secure');
  if (opts.domain) bits.push(`Domain=${opts.domain}`);
  return bits.join('; ');
}

/* ---------------------------------------------------------------- secrets */

/* A random URL-safe token. 32 bytes is plenty for a magic link. */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/* Six digits, uniformly distributed. `%` on a random 32-bit number would be
   slightly biased; reading bytes as a big integer is not. */
export function randomCode(digits = 6) {
  const max = 10 ** digits;
  let n;
  do {
    n = crypto.randomInt(0, max);
  } while (n < max / 10); /* no leading zero: easier to type back */
  return String(n);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');

/* Constant-time compare of two hex strings. */
export function sameHash(a, b) {
  const A = Buffer.from(String(a || ''), 'utf8');
  const B = Buffer.from(String(b || ''), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/* ------------------------------------------------------------- client info */

export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || '';
}

export const userAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 300);

/* "Chrome on Android", not the whole UA string — the super-admin screen is
   read by a human. */
export function shortDevice(ua) {
  const s = String(ua || '');
  if (!s) return 'Unknown device';
  const browser = /Edg\//.test(s) ? 'Edge'
    : /OPR\//.test(s) ? 'Opera'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : 'Browser';
  const os = /Android/.test(s) ? 'Android'
    : /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Windows/.test(s) ? 'Windows'
    : /Mac OS X/.test(s) ? 'macOS'
    : /Linux/.test(s) ? 'Linux'
    : 'device';
  return `${browser} on ${os}`;
}

/* --------------------------------------------------------------- routing */

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    /* '/api/sales/:id' becomes a regex with named groups. */
    const names = [];
    const rx = new RegExp(
      '^' +
        pattern
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/:(\w+)/g, (_, n) => {
            names.push(n);
            return '([^/]+)';
          }) +
        '/?$'
    );
    this.routes.push({ method, pattern, rx, names, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.rx.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(r.method === 'GET' && method === 'HEAD')) continue;
      const params = {};
      r.names.forEach((n, i) => {
        params[n] = decodeURIComponent(m[i + 1]);
      });
      return { route: r, params };
    }
    return { route: null, pathMatched };
  }
}
