/* ============================================================ utilities */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = '') => '<svg class="ic ' + cls + '"><use href="#i-' + n + '"/></svg>';

const fmt = n => {
  const v = Math.round((Number(n) || 0));
  return 'Ksh ' + v.toLocaleString('en-KE');
};
const fmt2 = n => {
  const v = Number(n) || 0;
  const whole = Math.trunc(v), cents = Math.round(Math.abs(v - whole) * 100);
  return 'Ksh ' + whole.toLocaleString('en-KE') + '.' + String(cents).padStart(2, '0');
};
const num = n => (Number(n) || 0).toLocaleString('en-KE');
const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
/* DD/MM/YY everywhere a date is shown — the format a Kenyan shopkeeper writes. */
const dmy = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2);
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const now = () => new Date(2026, 10, 20, 14, 26, 0); /* a fixed "today" for the prototype */
const today = () => { const n = now(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const longDate = d => DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONS[d.getMonth()] + ' ' + d.getFullYear();
const clock = d => pad(d.getHours()) + ':' + pad(d.getMinutes());

/* ---- PNG encoding, for the exported PDF's logo ------------------------- */

/* The PDF embeds the mark as an RGB image, so the drawing code has to make
   one. Deflate is the only hard part, and the browser already has it. */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/* deflate with stored (uncompressed) blocks — valid zlib, no library, and
   these images are a few kilobytes. */
function zlibStored(bytes) {
  const out = [0x78, 0x01];
  let i = 0;
  while (i < bytes.length) {
    const n = Math.min(65535, bytes.length - i);
    const last = i + n >= bytes.length ? 1 : 0;
    out.push(last, n & 0xff, n >> 8, ~n & 0xff, (~n >> 8) & 0xff);
    for (let k = 0; k < n; k++) out.push(bytes[i + k]);
    i += n;
  }
  const a = adler32(bytes);
  out.push((a >>> 24) & 0xff, (a >>> 16) & 0xff, (a >>> 8) & 0xff, a & 0xff);
  return new Uint8Array(out);
}

function be32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/* rgba: Uint8Array of w*h*4; one transparent or opaque image, both fine. */
function pngFromRGBA(w, h, rgba) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const chunks = [];
  const chunk = (type, data) => {
    const len = be32(data.length);
    const t = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
    const body = new Uint8Array(len.length + t.length + data.length);
    body.set(len, 0);
    body.set(t, 4);
    body.set(data, 8);
    const c = crc32(body);
    chunks.push(body, new Uint8Array(be32(c)));
  };
  chunk('IHDR', new Uint8Array([...be32(w), ...be32(h), 8, 6, 0, 0, 0]));
  chunk('IDAT', zlibStored(raw));
  chunk('IEND', new Uint8Array(0));
  let total = 8;
  chunks.forEach((c) => (total += c.length));
  const out = new Uint8Array(total);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let at = 8;
  chunks.forEach((c) => {
    out.set(c, at);
    at += c.length;
  });
  return out;
}

function toBase64(bytes) {
  let s2 = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s2 += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s2);
}
