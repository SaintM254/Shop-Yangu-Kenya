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
  /* A4, 80mm thermal, and nothing else. Both are point sizes: PDF measures in
     1/72 inch, so 80mm is 226.77pt and the printable width of a thermal roll
     is 72mm (204.09pt) — 4mm of margin on each side, which is what the
     printers actually need. */
  const SHEETS = {
    a4: { w: 595.28, h: 841.89, m: 40 },
    receipt: { w: 226.77, h: 841.89, m: 11.34 },
  };
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
  /* The header of an A4 document: the mark on the paper itself, then the shop
     on the left and the document's own name on the right. No tinted square
     behind the mark — the artwork is a solid shape and does not need a plate,
     and a plate reads as a stuck-on badge in print. */
  function newPage(state, doc) {
    const { w, h, m } = state.sheet;
    state.page++;
    const p = { ops: [], index: state.page };
    state.pages.push(p);
    state.ops = p.ops;
    rect(state, 0, 0, w, h, CREAM);
    const lw = 21;
    const lh = doc.logo ? lw * doc.logo.h / doc.logo.w : lw;
    if (doc.logo) drawLogo(state, doc.logo, m, h - m - lh, lw, SYK);
    text(state, doc.shop, m + lw + 10, h - m - 9, 13, NAVY, true);
    text(state, doc.branch + '  ·  ' + doc.phone + '  ·  PIN ' + doc.kra, m + lw + 10, h - m - 23, 7.6, MUTED, false);
    if (doc.stamp) text(state, doc.stamp, m + lw + 10, h - m - 34, 7.4, MUTED, false);
    text(state, doc.title, w - m, h - m - 9, 14, NAVY, true, 'right');
    text(state, doc.subtitle || '', w - m, h - m - 23, 8, MUTED, false, 'right');
    line(state, m, h - m - 42, w - m, h - m - 42, SAND, 1);
    state.y = h - m - 42;
    return p;
  }

  function footer(state, doc, total) {
    const { w, h, m } = state.sheet;
    line(state, m, m + 18, w - m, m + 18, SAND, 1);
    text(state, doc.shop + ' · ' + doc.branch, m, m + 6, 7.2, MUTED, false);
    text(state, 'Page ' + state.page + ' of ' + total, w - m, m + 6, 7.2, MUTED, false, 'right');
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

  /* The column header is the label alone — "VALUE AT COST", not
     "VALUE AT COST (KSH)". The table already ends in money columns that are
     right-aligned and grouped, and the note under the title says the figures
     are shillings; repeating KSH nine times across a header is noise that
     also costs the width the product name needs. */
  /* The label alone. "COST (KSH)", "SELLING (KSH)", "STOCK VALUE (KSH)" is
     the same unit three times in a row, and it doubles the width of the
     header for nothing: one line above the table says it once. */
  function headerLabel(c) {
    return String(c.label || '').toUpperCase();
  }

  /* What a cell actually prints. Money is grouped, so 13,940 is measured as
     six characters and its column is sized for the comma. */
  function cellText(v, c) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return c.type === 'money' ? group(v) : String(Math.round(v));
    /* A number that arrives as a string — from an import, or a form field —
       is still a number to the reader. Group it when the column is money. */
    if (c.type === 'money' && v !== '' && /^-?\d+(\.\d+)?$/.test(String(v).trim())) {
      return group(String(v).trim());
    }
    return String(v);
  }

  /* A cell that does not fit is shortened in the middle of its own words, not
     by chopping the tail: "Running..." tells a shopkeeper nothing, "Running
     low" tells them to reorder. Two chars give way to one ellipsis. */
  function shorten(raw, size, bold, max) {
    const s = clean(raw);
    if (textW(s, size, bold) <= max) return s;
    if (max < 12) return fit(s, size, bold, max);
    const words = s.split(' ');
    if (words.length > 1) {
      /* drop whole words from the end while they are the cheapest thing to lose */
      let out = s;
      while (out.includes(' ') && textW(out, size, bold) > max) out = out.slice(0, out.lastIndexOf(' '));
      if (textW(out, size, bold) >= max * 0.45) return out;
    }
    return fit(s, size, bold, max);
  }

  /* Column widths follow the content: the widest of the header and its cells,
     with a floor so a short column still reads, and a ceiling so one long
     product name cannot squeeze the numbers. Then the whole table is scaled
     to the page. */
  function sizeColumns(cols, rows, usable, startX) {
    const HEAD = 6.8, CELL = 8.4;
    /* A header is measured on its longest word, because it wraps: four lines
       of "VALUE AT COST" is a narrower column than one line of it. */
    const headNeeds = (c) => {
      const label = headerLabel(c);
      const longest = label.split(' ').reduce((m, w) => Math.max(m, textW(w, HEAD, true)), 0);
      return Math.max(longest + 10, Math.min(textW(label, HEAD, true) + 10, 74));
    };
    const natural = cols.map((c, i) => {
      let w = headNeeds(c);
      for (let r = 0; r < Math.min(rows.length, 200); r++) {
        w = Math.max(w, Math.min(textW(cellText(rows[r][i], c), CELL, c.type === 'strong') + 14, c.max || 190));
      }
      return Math.max(34, Math.min(w, c.max || 190));
    });
    const total = natural.reduce((t, w) => t + w, 0);
    /* Scale down to the page when the columns do not fit. Never scale a
       readable table up to fill it: white space on the right is correct. */
    const scale = total > usable ? usable / total : 1;
    let x = startX;
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

  function drawLogo(state, logo, x, y, w, color) {
    if (!logo || !logo.d) return;
    const h = w * logo.h / logo.w;
    push(state, 'q',
      rgb(color || SYK), 'rg',
      (w / logo.w).toFixed(4), '0 0', (h / logo.h).toFixed(4), x.toFixed(2),
      y.toFixed(2), 'cm',
      '1 0 0 -1 0', logo.h.toFixed(2), 'cm',
      logoOps(logo.d), 'f',
      'Q');
  }

  /* ---- the document ---- */

  function build(doc) {
    if (doc.sheet === 'receipt') return buildReceipt(doc);
    const state = layout();
    state.sheet = SHEETS.a4;
    const { w: PW, h: PH, m: PM } = state.sheet;
    const usable = PW - PM * 2;
    const cols = sizeColumns(doc.columns, doc.rows, usable, PM);
    const rowH = 15.5;
    const headerH = 25;
    const bandBottom = PM + 34;

    /* Page 1: the header, then the summary band and the meta block. */
    newPage(state, doc);

    /* summary band: up to four headline numbers, white on navy */
    if (doc.meta && doc.meta.length) {
      const boxH = 46;
      const top = state.y - 14;
      rect(state, PM, top - boxH, usable, boxH, NAVY);
      const n = Math.min(doc.meta.length, 4);
      const cellW = usable / n;
      doc.meta.slice(0, 4).forEach(([label, value], i) => {
        const cx = PM + cellW * i + 14;
        text(state, String(label).toUpperCase(), cx, top - 16, 6.6, [0.62, 0.78, 0.86], true);
        text(state, value, cx, top - 33, 13.5, WHITE, true);
      });
      state.y = top - boxH - 20;
    }

    if (doc.note) {
      text(state, doc.note, PM, state.y, 8, MUTED, false);
      state.y -= 16;
    }

    /* keep one row + header together, so a table never strands its header */
    function drawTableHeader() {
      const y = state.y;
      rect(state, PM, y - headerH, usable, headerH, SYK);
      cols.forEach((c) => {
        const align = c.align === 'right' ? 'right' : 'left';
        const tx = align === 'right' ? c.x + c.w - 7 : c.x + 7;
        const lines = wrapLabel(headerLabel(c), c.w - 14);
        const top = y - headerH + 10.6;
        lines.forEach((ln, i) => {
          text(state, ln, tx, top - i * LINE, 6.8, WHITE, true, align);
        });
      });
      state.y = y - headerH;
    }

    /* Split a header onto as many lines as it needs, never more than three,
       wrapping on whole words: "VALUE AT COST (KSH)" becomes three short
       lines instead of a column title cut off at "VALUE AT...". */
    const LINE = 7.9;
    function wrapLabel(label, max) {
      if (textW(label, 6.8, true) <= max) return [label];
      const lines = [];
      let cur = '';
      for (const w of label.split(' ')) {
        const next = cur ? cur + ' ' + w : w;
        if (cur && textW(next, 6.8, true) > max) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      }
      if (cur) lines.push(cur);
      /* still too wide on its own (a long single word): fit it, do not spill */
      return lines.slice(0, 3).map((ln) => (textW(ln, 6.8, true) > max ? fit(ln, 6.8, true, max) : ln));
    }

    function drawRow(row, i) {
      const y = state.y;
      if (i % 2 === 1) rect(state, PM, y - rowH, usable, rowH, PAPER);
      cols.forEach((c, ci) => {
        const raw = cellText(row[ci], c);
        const align = c.align === 'right' ? 'right' : 'left';
        const tx = align === 'right' ? c.x + c.w - 6 : c.x + 6;
        const bold = c.type === 'strong';
        text(state, shorten(raw, 8.4, bold, c.w - 14), tx, y - rowH + 4.6, 8.4, bold ? NAVY : INK, bold, align);
      });
      line(state, PM, y - rowH, PW - PM, y - rowH, [0.94, 0.91, 0.83], 0.5);
      state.y = y - rowH;
    }

    function newPageWithHeader() {
      newPage(state, doc);
      drawTableHeader();
    }

    /* Say the unit once, quietly, right where the numbers start. */
    if (doc.columns.some((c) => c.type === 'money')) {
      text(state, 'Amounts in Kenya shillings (Ksh)', PW - PM, state.y - 10, 6.6, MUTED, false, 'right');
      state.y -= 14;
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
      line(state, PM, state.y, PW - PM, state.y, SAND, 1);
      state.y -= 16;
      /* A summary block, right-aligned to the page edge, so it never lies
         under the wrong column. */
      const rx = PW - PM;
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

  /* ---- an 80mm till slip ------------------------------------------------

     This is not a report shrunk to fit a roll. A thermal receipt is read
     standing up, at arm's length, with a thumb over the bottom third: it is
     one column, it is centred, and it is set in the order a customer checks
     it — who sold to me, what did I buy, what did I pay, what do I owe, and
     the KRA signature that makes it a receipt.

     The sheet is 226.77pt wide (80mm). The printer cannot reach the outer
     4mm, so everything lives inside 204pt. The height is sized to the content
     after it is drawn, then written into every page box: no roll is wasted on
     an A4 page with a slip at the top. Long baskets break across pages
     rather than shrink the type. */

  const RCPT = {
    w: SHEETS.receipt.w,
    pad: 11.34,          /* 4mm, the unprintable edge of the roll */
    line: 4.6,           /* the height of a dashed tear rule */
  };

  function buildReceipt(doc) {
    const state = layout();
    const W = RCPT.w;
    const P = RCPT.pad;
    const IN = P + 5;
    const RIGHT = W - IN;
    const CW = W - IN * 2;          /* the column text is set in */
    const DASH = [0.78, 0.75, 0.62];
    const page = { ops: [], index: 1 };
    state.pages.push(page);
    state.ops = page.ops;

    let y = 0;                       /* measured down from the top, flipped at the end */

    const center = (str, size, color, bold) =>
      text(state, str, W / 2, -y, size, color, bold, 'center');

    const dashed = () => {
      y += 6;
      const step = 3.2;
      for (let x = IN; x < RIGHT; x += step * 2) {
        line(state, x, -y, Math.min(x + step, RIGHT), -y, DASH, 0.6);
      }
      y += 7;
    };

    /* Two columns on one line: what on the left, what it cost on the right. */
    const pair = (left, right, opts) => {
      const o = opts || {};
      const size = o.size || 8.2;
      const bold = !!o.bold;
      text(state, fit(left, size, bold, CW - (o.rightW || 62) - 4), IN, -y, size, o.color || INK, bold);
      text(state, right, RIGHT, -y, size, o.color || INK, bold, 'right');
      y += o.lead || size + 3.4;
    };

    /* ---- the shop ---- */
    const logoW = 34;
    if (doc.logo) {
      const logoH = logoW * doc.logo.h / doc.logo.w;
      y = 2;
      drawLogo(state, doc.logo, (W - logoW) / 2, -(y + logoH), logoW, NAVY);
      y += logoH + 7;
    }
    y += 4;
    center(doc.shop, 11.5, NAVY, true);
    y += 13;
    center(doc.branch, 7.6, MUTED, false);
    y += 10.5;
    center(doc.phone + '  ·  KRA PIN ' + doc.kra, 7.6, MUTED, false);
    y += 12;

    dashed();

    /* ---- the receipt's own name and number ---- */
    center('TAX INVOICE / RECEIPT', 7.4, SYK, true);
    y += 11;
    center('No ' + doc.receiptNo, 9.2, NAVY, true);
    y += 12;
    center(doc.dateLine, 7.6, MUTED, false);
    y += 11;
    if (doc.customer) {
      pair('Customer', doc.customer, { size: 7.8, rightW: 96 });
    }
    if (doc.cashier) {
      pair('Served by', doc.cashier, { size: 7.8, rightW: 96, color: MUTED });
    }

    dashed();

    /* ---- what was bought ---- */
    pair('ITEM', 'AMOUNT', { size: 6.4, bold: true, color: MUTED, lead: 10, rightW: 56 });
    (doc.lines || []).forEach((l) => {
      /* the name on its own line, then the arithmetic underneath, indented:
         a 72mm column cannot hold "Cooking oil 2L × 2 @ 1,000" on one line
         without shrinking it past readable */
      text(state, fit(l.name, 8.2, true, CW), IN, -y, 8.2, INK, true);
      y += 9.6;
      text(state, l.qty + ' x ' + l.price, IN, -y, 7.4, MUTED, false);
      text(state, l.amount, RIGHT, -y, 8.2, INK, false, 'right');
      y += 11.4;
    });

    dashed();

    /* ---- what it adds up to ---- */
    (doc.amounts || []).forEach((a) => {
      if (a.rule) {
        y += 1.5;
        line(state, IN, -y, RIGHT, -y, DASH, 0.6);
        y += 7;
      }
      pair(a.label, a.value, {
        size: a.strong ? 10.4 : 8.2,
        bold: !!a.strong,
        color: a.strong ? NAVY : a.tone === 'credit' ? MUTED : INK,
        lead: a.strong ? 16 : 12,
        rightW: 84,
      });
    });

    /* ---- what is still owed ---- */
    if (doc.credit) {
      dashed();
      const boxH = 30;
      rect(state, IN, -(y + boxH), CW, boxH, [0.996, 0.973, 0.91]);
      strokeRect(state, IN, -(y + boxH), CW, boxH, SAND, 0.8);
      text(state, 'ON CREDIT', IN + 7, -(y + 10), 6.4, MUTED, true);
      text(state, doc.credit, IN + 7, -(y + 21), 10, NAVY, true);
      text(state, 'Payable on the account', RIGHT - 7, -(y + 21), 6.6, MUTED, false, 'right');
      y += boxH + 9;
    }

    /* ---- the KRA signature: the line that makes it a valid tax invoice ---- */
    dashed();
    center('KRA eTIMS', 6.4, MUTED, true);
    y += 9.5;
    center(doc.sig || '', 6.6, MUTED, false);
    y += 9;
    if (doc.verify) center(doc.verify, 6.4, MUTED, false);

    if (doc.thanks) {
      y += 13;
      center(doc.thanks, 7.8, SYK, true);
    }

    y += 16;

    /* Everything above was measured from the top down, because that is how a
       slip is laid out. PDF counts from the bottom up, so the whole stream is
       wrapped in one flip: `1 0 0 -1 0 H cm` puts local (x, y) at page
       (x, H - y). One transform, applied once, at the end. */
    const H = Math.ceil(y);
    /* No mirror: the drawing above already negated y, so the stream is in
       PDF's own up-is-positive space once it is lifted by the page height. */
    page.ops = [
      'q',
      '1 0 0 1 0 ' + H.toFixed(2) + ' cm',
      '1 1 1 rg',
      '0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + ' re f',
      ...page.ops,
      'Q',
    ];

    state.pages.forEach((pg) => { pg.h = H; });
    return assemble(doc, state.pages, { w: W, h: H });
  }

  /* ---- file assembly ---- */

  function assemble(doc, pages, sheet) {
    /* A receipt is one page of its own height; a report is A4, page after
       page. `sheet` is passed only by the receipt writer. */
    const W = sheet ? sheet.w : SHEETS.a4.w;
    const H = sheet ? sheet.h : SHEETS.a4.h;
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
      add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + W.toFixed(2) + ' ' +
        H.toFixed(2) + '] /Resources ' + res + ' /Contents ' + (firstContent + i) + ' 0 R >>');
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
