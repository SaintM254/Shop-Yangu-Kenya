/* ============================================================ Excel

   A real .xlsx workbook, built in the browser: a zip with the four XML parts
   Excel insists on, plus a styled header row in the shop's colours. No
   library, no CDN, nothing that can 404 on a bad signal.

   Every sheet is the same shape — a bold title, the shop and the date, then a
   header row and the rows — so one function covers stock, sales, customers,
   purchases, the audit log and the full backup. */

/* ---- a small zip writer (stored, no compression) ----------------------- */

const ZIP_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function zipCrc(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = ZIP_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* files: [{ name, text }] */
function zipStored(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = zipCrc(data);
    const head = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
    ]);
    parts.push(head, name, data);
    central.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), name);
    offset += head.length + name.length + data.length;
  });

  const centralSize = central.reduce((t, c) => t + c.length, 0);
  const end = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  const all = [...parts, ...central, end];
  const total = all.reduce((t, p) => t + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  all.forEach((p) => {
    out.set(p, at);
    at += p.length;
  });
  return out;
}

/* ---- spreadsheet XML --------------------------------------------------- */

const xesc = (v) =>
  String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/* 0-based column index → A, B, … AA */
const colName = (i) => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/**
 * spec = {
 *   sheet: 'Stock',
 *   title: 'Stock on hand',
 *   subtitle: 'Shop Yangu Kenya · Mombasa Branch',
 *   note: 'Exported 20/11/26 14:26',
 *   columns: [{ label, width, type:'text'|'money'|'number'|'date' }],
 *   rows: [[…]],
 * }
 */
function sheetXml(spec) {
  const cols = spec.columns;
  const last = colName(cols.length - 1);
  const widths = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join('');
  const styleFor = (i) => {
    const t = cols[i].type;
    return t === 'money' ? 2 : t === 'number' ? 1 : t === 'date' ? 3 : 0;
  };

  const row = (r, cells, style) =>
    '<row r="' + r + '">' +
    cells.map((v, i) => {
      const ref = colName(i) + r;
      if (v === null || v === undefined || v === '') return '<c r="' + ref + '" s="' + style + '"/>';
      const numeric = typeof v === 'number' && isFinite(v);
      return '<c r="' + ref + '" s="' + style + '"' + (numeric ? '' : ' t="inlineStr"') + '>' +
        (numeric ? '<v>' + v + '</v>' : '<is><t>' + xesc(v) + '</t></is>') + '</c>';
    }).join('') +
    '</row>';

  const head = [];
  head.push(row(1, [spec.title], 4));
  head.push(row(2, [spec.subtitle], 5));
  if (spec.note) head.push(row(3, [spec.note], 5));
  const headerRow = spec.note ? 5 : 4;
  head.push(row(headerRow, cols.map((c) => c.label), 6));

  /* body rows: money as a real number so Excel can add it up */
  const bodyRows = spec.rows.map((r, i) =>
    '<row r="' + (headerRow + 1 + i) + '">' +
    r.map((v, ci) => {
      const ref = colName(ci) + (headerRow + 1 + i);
      const st = styleFor(ci);
      if (v === null || v === undefined || v === '') return '<c r="' + ref + '" s="' + st + '"/>';
      const numeric = typeof v === 'number' && isFinite(v);
      return '<c r="' + ref + '" s="' + st + '"' + (numeric ? '' : ' t="inlineStr"') + '>' +
        (numeric ? '<v>' + v + '</v>' : '<is><t>' + xesc(v) + '</t></is>') + '</c>';
    }).join('') +
    '</row>'
  );

  const merges = spec.note
    ? `<mergeCells count="3"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/><mergeCell ref="A3:${last}3"/></mergeCells>`
    : `<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>`;

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="A1:' + last + (headerRow + spec.rows.length) + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="' + headerRow +
    '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16"/>' +
    '<cols>' + widths + '</cols>' +
    '<sheetData>' + head.join('') + bodyRows.join('') + '</sheetData>' +
    merges +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>' +
    '</worksheet>';
}

const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Ksh&quot;\\ #,##0"/></numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><color rgb="FF1E2A22"/></font>' +
  '<font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF023246"/></font>' +
  '<font><sz val="10"/><name val="Calibri"/><color rgb="FF596658"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF287094"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2"><border/><border><bottom style="thin"><color rgb="FFE7DDB5"/></bottom></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/**
 * sheets = [{ name, columns, rows, title, subtitle, note }]
 * returns Uint8Array of a .xlsx file
 */
function buildXlsx(sheets) {
  const names = sheets.map((s, i) => (s.name || 'Sheet' + (i + 1)).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31));
  const files = [];

  files.push({
    name: '[Content_Types].xml',
    text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '</Types>',
  });
  files.push({
    name: '_rels/.rels',
    text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  });
  files.push({
    name: 'xl/workbook.xml',
    text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + names.map((n, i) => '<sheet name="' + xesc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
      '</workbook>',
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
  });
  files.push({ name: 'xl/styles.xml', text: XLSX_STYLES });
  sheets.forEach((s, i) => {
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: sheetXml({ ...s, sheet: names[i] }) });
  });
  return zipStored(files);
}
