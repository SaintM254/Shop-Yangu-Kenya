/* ============================================================ api/index.js

   The file Vercel runs.

   Vercel turns every JavaScript file in this folder into its own little
   server — one function per file. This project has one router and about forty
   routes, so it gets exactly one file, and a rule in vercel.json sends every
   address to it:

     /api/sales         →  this file
     /api/auth/signin   →  this file
     /pay/<secret>      →  this file   (Safaricom's callback)

   Vercel does not hand a function quite the same objects Node's http module
   does, and which ones you get depends on the runtime. The code below
   translates, so api/server.js never has to know where it is running:

     in    whatever Vercel passes  →  a Node request with a readable body
     out   Node's writeHead/end    →  whatever Vercel expects back

   Nothing about a route changes here. This is the same handler that runs under
   `node server.js` on a laptop, and the same one the tests drive.

   Why one function and not one per route: Vercel's free plan allows twelve
   functions and every file in api/ counts towards that. It also means a shop's
   first sale of the morning warms one function instead of forty. The shared
   code lives in api/_lib and api/_routes, and the tests in api/_test —
   folders starting with an underscore are the documented way to keep them out
   of that count. */

import { Readable } from 'node:stream';

import { handleRequest } from './server.js';

/* --------------------------------------------------------------- the request

   Two things have to be true of what we hand the router:

     · it is a Readable stream, because readJson() listens for data and end;
     · req.url is the address the person asked for, not /api/index.

   Vercel usually parses the JSON body for you and leaves `req.body` full, with
   the stream already drained. When that has happened we rebuild the stream
   from the parsed value, so the existing code reads it exactly as it always
   did. When it has not, the real stream is passed through. */

/* --------------------------------------------------------- the real address

   A rewrite in vercel.json sends /api/sales and /api/auth/signin to this one
   file. What the function then sees in req.url is not guaranteed to be the
   address the person asked for: depending on the runtime it may be the
   destination (/api/index.js, or /api), or the original path.

   So the rewrite also carries the real path in a query parameter:

       { "source": "/api/:path*", "destination": "/api/index.js?__path=/:path*" }

   This function puts it back, before the router looks at anything. If it is
   missing — because the platform passed the original URL through untouched,
   which some runtimes do — the URL is already right and nothing happens.

   Everything else the caller sent stays in the query string, which routes do
   read (`?all=1`, `?productId=...`). */
const PATH_PARAM = '__path';

function realUrl(rawUrl) {
  const u = new URL(rawUrl, 'https://placeholder.invalid');
  const carried = u.searchParams.get(PATH_PARAM);

  if (carried !== null) {
    u.searchParams.delete(PATH_PARAM);
    /* Only paths we route. A value that tried to leave /api or /pay is
       discarded and the request 404s normally rather than being redirected
       somewhere else. */
    if (/^\/(api|pay)(\/|$)/.test(carried) && !carried.includes('..')) {
      u.pathname = carried;
    }
  } else if (u.pathname === '/api/index.js' || u.pathname === '/api/index') {
    /* The destination arrived without the parameter. Nothing can be restored,
       but at least do not 404 on a URL that is our own address. */
    u.pathname = '/api';
  }

  const rest = u.searchParams.toString();
  return u.pathname + (rest ? '?' + rest : '');
}

function nodeRequest(req) {
  const raw =
    req.body === undefined || req.body === null
      ? null
      : Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
          ? Buffer.from(req.body, 'utf8')
          : Buffer.from(JSON.stringify(req.body), 'utf8');

  const stream =
    raw !== null
      ? Readable.from([raw])
      : typeof req.pipe === 'function' || typeof req.on === 'function'
        ? req
        : Readable.from([]);

  /* A Readable from Readable.from() is not an IncomingMessage, so the few
     properties the app reaches for are attached directly. */
  stream.method = (req.method || 'GET').toUpperCase();
  stream.url = realUrl(req.url || '/');
  stream.headers = req.headers || {};
  if (!stream.socket) {
    /* clientIp() and the session log read this. Behind Vercel's proxy the
       real caller is in x-forwarded-for, which clientIp() checks first. */
    stream.socket = { remoteAddress: '' };
  }
  return stream;
}

/* -------------------------------------------------------------- the response

   Newer Vercel runtimes give a response object with .status()/.send(). Older
   ones give a plain http.ServerResponse. Detect, then either pass it straight
   through or wrap it. */

function isNodeResponse(res) {
  return typeof res.writeHead === 'function' && typeof res.status !== 'function';
}

function vercelResponse(res) {
  const headers = {};
  let status = 200;
  let finished = false;
  const chunks = [];

  const flush = () => {
    if (finished) return;
    finished = true;
    const body = Buffer.concat(chunks);
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) res.setHeader(k, v);
    }
    res.status(status);
    /* 204 and 304 must carry no body at all; anything else gets the bytes. */
    if (status === 204 || status === 304) res.end();
    else res.send(body);
  };

  const shim = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    removeHeader(name) {
      delete headers[String(name).toLowerCase()];
    },
    get statusCode() {
      return status;
    },
    set statusCode(v) {
      status = v;
    },
    set statusMessage(_) {
      /* Node-only; Vercel has no reason phrase. */
    },
    writeHead(code, maybeHeaders) {
      status = code;
      if (maybeHeaders && typeof maybeHeaders === 'object') {
        for (const [k, v] of Object.entries(maybeHeaders)) {
          if (v !== undefined) headers[String(k).toLowerCase()] = v;
        }
      }
      return shim;
    },
    /* Node resolves both res.write(chunk, cb) and res.write(chunk, enc, cb). */
    write(chunk, encoding, cb) {
      if (typeof encoding === 'function') {
        cb = encoding;
        encoding = undefined;
      }
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
      if (typeof cb === 'function') cb();
      return true;
    },
    end(chunk, encoding, cb) {
      if (typeof chunk === 'function') {
        cb = chunk;
        chunk = undefined;
        encoding = undefined;
      }
      if (typeof encoding === 'function') {
        cb = encoding;
        encoding = undefined;
      }
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
      flush();
      if (typeof cb === 'function') cb();
      return shim;
    },
    flushHeaders() {},
    get headersSent() {
      return finished;
    },
    on() {
      return shim;
    },
  };

  return shim;
}

/* ------------------------------------------------------------------ the entry */

/* Exported for the tests: the URL restoration is the one piece of logic here
   that has real conditions in it. */
export { realUrl };

export default async function handler(req, res) {
  const nodeReq = nodeRequest(req);
  const nodeRes = isNodeResponse(res) ? res : vercelResponse(res);
  await handleRequest(nodeReq, nodeRes);
}
