/* ============================================================ PDF

   A real PDF, written byte by byte in the browser. No print dialog, no
   library, no server: pressing "PDF" downloads a finished document.

   Design rules, the same ones the app lives by:
     · cream page, white cards, 1px sand rules, navy headings, cerulean accents
     · the logo mark top-left, the shop and the date top-right
     · a coloured summary band, then a clean table, then a small footer
     · money right-aligned and monospaced so the columns line up
     · every page numbered — a shopkeeper prints these and files them

   Payload shape:
     { kind, title, subtitle, meta: [[label, value]], columns, rows, totals,
       note, orientation }
   `kind` picks the summary band and the column widths. */

const PDF = (() => {
  const PAGE = { w: 595.28, h: 841.89 }; /* A4 in points */
  const M = 40; /* margin */
  const CREAM = [1, 0.973, 0.882]; /* #FFF8E1 */
  const PAPER = [1, 1, 1];
  const SAND = [0.906, 0.867, 0.71]; /* #E7DDB5 */
  const NAVY = [0.008, 0.196, 0.275]; /* #023246 */
  const SYK = [0.157, 0.439, 0.58]; /* #287094 */
  const INK = [0.118, 0.165, 0.133]; /* #1E2A22 */
  const MUTED = [0.349, 0.4, 0.345]; /* #596658 */
  const FOREST = [0.122, 0.302, 0.18]; /* #1F4D2E */
  const WHITE = [1, 1, 1];

  /* Adobe's Helvetica metrics, in 1/1000 em — measured, not guessed, so
     headings and columns line up on the page. */
  const WIDTHS = {
    regular: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
    bold: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
  };

  /* PDF text is WinAnsi; anything outside it is folded down, never dropped
     silently into a broken glyph. */
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00b7/g, '-')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  }
  const esc = (s) => clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  function charW(ch, bold) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 255) return 556;
    return WIDTHS[bold ? 'bold' : 'regular'][c - 32] || 556;
  }
  function textW(str, size, bold) {
    let t = 0;
    const s = clean(str);
    for (let i = 0; i < s.length; i++) t += charW(s[i], bold);
    return (t / 1000) * size;
  }
  function fit(str, size, bold, max) {
    let s = clean(str);
    if (textW(s, size, bold) <= max) return s;
    while (s.length > 1 && textW(s + '...', size, bold) > max) s = s.slice(0, -1);
    return s.replace(/\s+$/, '') + '...';
  }

  /* ---- content-stream building blocks ---- */

  function layout() {
    const ops = [];
    const state = { ops, page: 0, pages: [] };
    return state;
  }

  function push(state, ...parts) {
    state.ops.push(parts.join('\n'));
  }

  function rgb(c) {
    return c.map((v) => v.toFixed(3)).join(' ');
  }

  function rect(state, x, y, w, h, color) {
    push(state, rgb(color), 'rg', x.toFixed(2), y.toFixed(2), w.toFixed(2), h.toFixed(2), 're f');
  }

  function strokeRect(state, x, y, w, h, color, lw) {
    push(state, rgb(color), 'RG', (lw || 0.75).toFixed(2), 'w', x.toFixed(2), y.toFixed(2), w.toFixed(2), h.toFixed(2), 're S');
  }

  function line(state, x1, y1, x2, y2, color, lw) {
    push(state, rgb(color), 'RG', (lw || 0.75).toFixed(2), 'w',
      x1.toFixed(2), y1.toFixed(2), 'm', x2.toFixed(2), y2.toFixed(2), 'l S');
  }

  function text(state, str, x, y, size, color, bold, align) {
    const s = clean(str);
    if (!s) return;
    let tx = x;
    if (align === 'right') tx = x - textW(s, size, bold);
    else if (align === 'center') tx = x - textW(s, size, bold) / 2;
    push(state, 'BT', '/' + (bold ? 'F2' : 'F1'), size.toFixed(2), 'Tf', rgb(color), 'rg',
      tx.toFixed(2), y.toFixed(2), 'Td', '(' + esc(s) + ') Tj ET');
  }

  /* A page of the document: header, footer, and the usable band between. */
  function newPage(state, doc) {
    state.page++;
    const p = { ops: [], index: state.page };
    state.pages.push(p);
    state.ops = p.ops;
    rect(state, 0, 0, PAGE.w, PAGE.h, CREAM);
    /* header: logo tile, shop, document title, date */
    rect(state, M, PAGE.h - M - 42, 42, 42, [0.996, 0.984, 0.93]);
    const lw = 25;
    const lh = doc.logo ? lw * doc.logo.h / doc.logo.w : lw;
    drawLogo(state, doc.logo, M + (42 - lw) / 2, PAGE.h - M - 42 + (42 - lh) / 2, lw);
    text(state, doc.shop, M + 54, PAGE.h - M - 14, 13, NAVY, true);
    text(state, doc.branch + '  ·  ' + doc.phone + '  ·  PIN ' + doc.kra, M + 54, PAGE.h - M - 29, 7.6, MUTED, false);
    text(state, doc.title, PAGE.w - M, PAGE.h - M - 12, 15, NAVY, true, 'right');
    text(state, doc.subtitle || '', PAGE.w - M, PAGE.h - M - 27, 8, MUTED, false, 'right');
    text(state, doc.stamp, PAGE.w - M, PAGE.h - M - 38, 7.6, MUTED, false, 'right');
    line(state, M, PAGE.h - M - 52, PAGE.w - M, PAGE.h - M - 52, SAND, 1);
    state.y = PAGE.h - M - 52;
    return p;
  }

  function footer(state, doc, total) {
    const n = state.pages.length;
    line(state, M, M + 18, PAGE.w - M, M + 18, SAND, 1);
    text(state, doc.shop + ' · ' + doc.branch, M, M + 6, 7.2, MUTED, false);
    text(state, 'Page ' + state.page + ' of ' + total, PAGE.w - M, M + 6, 7.2, MUTED, false, 'right');
  }

  /* ---- cells ---------------------------------------------------------- */

  /* Money in a PDF table is grouped and right-aligned: 12,345. The column
     header says KSH, so every cell does not have to. */
  function group(n) {
    const v = Math.round(Number(n) || 0);
    const neg = v < 0;
    const digits = String(Math.abs(v));
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i && (digits.length - i) % 3 === 0) out += ',';
      out += digits[i];
    }
    return (neg ? '-' : '') + out;
  }

  function headerLabel(c) {
    const base = String(c.label || '').toUpperCase();
    return c.type === 'money' && !/KSH/.test(base) ? base + ' (KSH)' : base;
  }

  function cellText(v, c) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return c.type === 'money' ? group(v) : String(Math.round(v));
    return String(v);
  }

  /* Column widths follow the content: the widest of the header and its cells,
     with a floor so a short column still reads, and a ceiling so one long
     product name cannot squeeze the numbers. Then the whole table is scaled
     to the page. */
  function sizeColumns(cols, rows, usable) {
    const HEAD = 6.8, CELL = 8.4;
    const natural = cols.map((c, i) => {
      let w = textW(headerLabel(c), HEAD, true) + 12;
      for (let r = 0; r < Math.min(rows.length, 200); r++) {
        w = Math.max(w, textW(cellText(rows[r][i], c), CELL, c.type === 'strong') + 12);
      }
      return Math.max(30, Math.min(w, c.max || 190));
    });
    const total = natural.reduce((t, w) => t + w, 0);
    const scale = total > usable ? usable / total : Math.min(1.3, usable / total);
    let x = M;
    return cols.map((c, i) => {
      const w = natural[i] * scale;
      const col = { ...c, w, x };
      x += w;
      return col;
    });
  }

  /* ---- the logo -------------------------------------------------------

     The mark from Images/Icon.svg, recoloured, drawn into the page's own
     content stream as vector paths: crisp at any size, no rasterising, no
     canvas, nothing an old reader can refuse to paint. The artwork only uses
     M, L, C and Z, which map straight onto PDF's m, l, c and h.

     SVG's y grows downwards and PDF's grows up, so the path is drawn inside a
     flip: 1 0 0 -1 0 <height> cm. */

  function logoOps(d) {
    const tokens = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const out = [];
    let i = 0;
    let cmd = '';
    const n = () => parseFloat(tokens[i++]);
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
      if (cmd === 'M') {
        out.push(n().toFixed(2), n().toFixed(2), 'm');
        cmd = 'L'; /* the pairs after a moveto are linetos */
      } else if (cmd === 'L') {
        out.push(n().toFixed(2), n().toFixed(2), 'l');
      } else if (cmd === 'C') {
        out.push(n().toFixed(2), n().toFixed(2), n().toFixed(2), n().toFixed(2), n().toFixed(2), n().toFixed(2), 'c');
      } else if (cmd === 'Z' || cmd === 'z') {
        out.push('h');
        cmd = '';
      } else if (cmd) {
        i++; /* an unknown command: skip a token rather than fail the export */
      } else {
        i++;
      }
    }
    return out.join(' ');
  }

  function drawLogo(state, logo, x, y, w) {
    if (!logo || !logo.d) return;
    const h = w * logo.h / logo.w;
    push(state, 'q',
      rgb(SYK), 'rg',
      (w / logo.w).toFixed(4), '0 0', (h / logo.h).toFixed(4), x.toFixed(2),
      y.toFixed(2), 'cm',
      '1 0 0 -1 0', logo.h.toFixed(2), 'cm',
      logoOps(logo.d), 'f',
      'Q');
  }

  /* ---- the document ---- */

  function build(doc) {
    const state = layout();
    const usable = PAGE.w - M * 2;
    const cols = sizeColumns(doc.columns, doc.rows, usable);
    const rowH = 15;
    const headerH = 19;
    const bandBottom = M + 34;

    /* Page 1: the header, then the summary band and the meta block. */
    newPage(state, doc);

    /* summary band: up to four headline numbers, white on navy */
    if (doc.meta && doc.meta.length) {
      const boxH = 46;
      const top = state.y - 14;
      rect(state, M, top - boxH, PAGE.w - M * 2, boxH, NAVY);
      const n = Math.min(doc.meta.length, 4);
      const cellW = (PAGE.w - M * 2) / n;
      doc.meta.slice(0, 4).forEach(([label, value], i) => {
        const cx = M + cellW * i + 14;
        text(state, String(label).toUpperCase(), cx, top - 16, 6.6, [0.62, 0.78, 0.86], true);
        text(state, value, cx, top - 33, 13.5, WHITE, true);
      });
      state.y = top - boxH - 20;
    }

    if (doc.note) {
      text(state, doc.note, M, state.y, 8, MUTED, false);
      state.y -= 16;
    }

    /* keep one row + header together, so a table never strands its header */
    function drawTableHeader() {
      const y = state.y;
      rect(state, M, y - headerH, PAGE.w - M * 2, headerH, SYK);
      cols.forEach((c) => {
        const align = c.align === 'right' ? 'right' : 'left';
        const tx = align === 'right' ? c.x + c.w - 6 : c.x + 6;
        text(state, fit(headerLabel(c), 6.8, true, c.w - 10), tx, y - headerH + 6, 6.8, WHITE, true, align);
      });
      state.y = y - headerH;
    }

    function drawRow(row, i) {
      const y = state.y;
      if (i % 2 === 1) rect(state, M, y - rowH, PAGE.w - M * 2, rowH, PAPER);
      cols.forEach((c, ci) => {
        const raw = cellText(row[ci], c);
        const align = c.align === 'right' ? 'right' : 'left';
        const tx = align === 'right' ? c.x + c.w - 6 : c.x + 6;
        const bold = c.type === 'strong';
        text(state, fit(raw, 8.4, bold, c.w - 12), tx, y - rowH + 4.6, 8.4, bold ? NAVY : INK, bold, align);
      });
      line(state, M, y - rowH, PAGE.w - M, y - rowH, [0.94, 0.91, 0.83], 0.5);
      state.y = y - rowH;
    }

    function newPageWithHeader() {
      newPage(state, doc);
      drawTableHeader();
    }

    drawTableHeader();
    doc.rows.forEach((r, i) => {
      if (state.y - rowH < bandBottom + (doc.totals ? 34 : 4)) newPageWithHeader();
      drawRow(r, i);
    });

    /* totals: a sand rule and the money, aligned with its own column */
    if (doc.totals && doc.totals.length) {
      if (state.y - 30 < bandBottom) newPageWithHeader();
      state.y -= 6;
      line(state, M, state.y, PAGE.w - M, state.y, SAND, 1);
      state.y -= 16;
      /* A summary block, right-aligned to the page edge, so it never lies
         under the wrong column. */
      const rx = PAGE.w - M;
      const lx = rx - 250;
      doc.totals.forEach(([label, value, strong]) => {
        const y = state.y;
        text(state, label, lx, y, strong ? 10 : 8.8, strong ? NAVY : MUTED, !!strong);
        text(state, value, rx, y, strong ? 11 : 9, strong ? NAVY : INK, !!strong, 'right');
        state.y -= strong ? 18 : 14;
      });
    }

    const total = state.pages.length;
    state.pages.forEach((p) => {
      state.ops = p.ops;
      state.page = p.index;
      footer(state, doc, total);
    });

    return assemble(doc, state.pages);
  }

  /* ---- file assembly ---- */

  function assemble(doc, pages) {
    const objects = []; /* 1-based */
    const add = (body) => {
      objects.push(body);
      return objects.length;
    };

    const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');



    /* Number the objects before writing them: content streams, then the page
       objects, then the tree that names its kids, then the catalog. */
    const base = objects.length;
    const firstContent = base + 1;
    const firstPage = base + pages.length + 1;
    const pagesObj = base + pages.length * 2 + 1;

    pages.forEach((p) => add('<< /Length ' + p.ops.join('\n').length + ' >>\nstream\n' + p.ops.join('\n') + '\nendstream'));

    pages.forEach((p, i) => {
      const res = '<< /Font << /F1 ' + fontRegular + ' 0 R /F2 ' + fontBold + ' 0 R >> >>';
      add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + PAGE.w.toFixed(2) + ' ' +
        PAGE.h.toFixed(2) + '] /Resources ' + res + ' /Contents ' + (firstContent + i) + ' 0 R >>');
    });

    const kids = pages.map((p, i) => (firstPage + i) + ' 0 R').join(' ');
    const tree = add('<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
    if (tree !== pagesObj) throw new Error('page tree index mismatch: ' + tree + ' vs ' + pagesObj);
    const catalog = add('<< /Type /Catalog /Pages ' + tree + ' 0 R >>');

    /* write the file with a cross-reference table */
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += i + 1 + ' 0 obj\n' + body + '\nendobj\n';
    });
    const xrefAt = out.length;
    out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach((o) => {
      out += String(o).padStart(10, '0') + ' 00000 n \n';
    });
    out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n';
    return out;
  }

  /* bytes as a latin1 string keeps the stream lengths exact */
  const BufferShim = {
    latin1(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    },
  };

  return { build, textW, fit };
})();
