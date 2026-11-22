/* ============================================================ sample data */
const SEED = () => ({
  shop: { name: 'Shop Yangu Kenya', branch: 'Mombasa Branch', phone: '0722 000 111', kra: 'P051234567X', plan: 1500 },
  me: { name: 'Wanjiku Kamau', role: 'owner' },
  settings: { allowCredit: true, askCustomer: false, smsReceipt: true, offline: true },
  users: [
    { id: 'u1', name: 'Wanjiku Kamau', phone: '0722 000 111', role: 'owner', active: true, last: 'Today, 14:26' },
    { id: 'u2', name: 'Otieno Were', phone: '0733 442 118', role: 'sales', active: true, last: 'Today, 13:58' },
    { id: 'u3', name: 'Fatuma Ali', phone: '0711 909 233', role: 'sales', active: true, last: 'Yesterday, 18:04' },
    { id: 'u4', name: 'Peter Mwangi', phone: '0700 221 664', role: 'sales', active: false, last: '2 weeks ago' }
  ],
  cats: ['Drinks', 'Grocery', 'Household', 'Personal care', 'Hardware'],
  products: [
    { id: 'p01', sku: 'GRC-001', name: 'Sugar 2kg', cat: 'Grocery', unit: 'packet', cost: 205, price: 240, qty: 68, reorder: 24, exp: '' },
    { id: 'p02', sku: 'GRC-002', name: 'Pishori rice 2kg', cat: 'Grocery', unit: 'packet', cost: 268, price: 320, qty: 41, reorder: 20, exp: '2027-08-31' },
    { id: 'p03', sku: 'GRC-003', name: 'Maize flour 2kg', cat: 'Grocery', unit: 'packet', cost: 163, price: 190, qty: 12, reorder: 30, exp: '2027-02-28' },
    { id: 'p04', sku: 'GRC-004', name: 'Cooking oil 1L', cat: 'Grocery', unit: 'bottle', cost: 245, price: 285, qty: 33, reorder: 18, exp: '2027-06-30' },
    { id: 'p05', sku: 'DRK-001', name: 'Soda 350ml', cat: 'Drinks', unit: 'bottle', cost: 38, price: 50, qty: 144, reorder: 60, exp: '2027-01-31' },
    { id: 'p06', sku: 'DRK-002', name: 'Bottled water 1L', cat: 'Drinks', unit: 'bottle', cost: 42, price: 60, qty: 96, reorder: 48, exp: '2027-04-30' },
    { id: 'p07', sku: 'DRK-003', name: 'Fresh milk 500ml', cat: 'Drinks', unit: 'packet', cost: 48, price: 60, qty: 8, reorder: 36, exp: '2026-11-26' },
    { id: 'p08', sku: 'DRK-004', name: 'Tea leaves 250g', cat: 'Drinks', unit: 'packet', cost: 112, price: 140, qty: 54, reorder: 20, exp: '2027-09-30' },
    { id: 'p09', sku: 'HHD-001', name: 'Bar soap 800g', cat: 'Household', unit: 'bar', cost: 198, price: 240, qty: 37, reorder: 15, exp: '' },
    { id: 'p10', sku: 'HHD-002', name: 'Washing powder 500g', cat: 'Household', unit: 'packet', cost: 146, price: 180, qty: 5, reorder: 20, exp: '' },
    { id: 'p11', sku: 'HHD-003', name: 'Jik 750ml', cat: 'Household', unit: 'bottle', cost: 96, price: 125, qty: 22, reorder: 12, exp: '2027-03-31' },
    { id: 'p12', sku: 'HHD-004', name: 'Matches, box of 10', cat: 'Household', unit: 'box', cost: 42, price: 60, qty: 0, reorder: 10, exp: '' },
    { id: 'p13', sku: 'PRC-001', name: 'Toothpaste 100ml', cat: 'Personal care', unit: 'tube', cost: 132, price: 165, qty: 29, reorder: 12, exp: '2027-11-30' },
    { id: 'p14', sku: 'PRC-002', name: 'Toilet paper, 4 rolls', cat: 'Personal care', unit: 'pack', cost: 118, price: 150, qty: 44, reorder: 18, exp: '' },
    { id: 'p15', sku: 'PRC-003', name: 'Sanitary pads, 10s', cat: 'Personal care', unit: 'pack', cost: 92, price: 120, qty: 17, reorder: 20, exp: '2027-05-31' },
    { id: 'p16', sku: 'HDW-001', name: 'Cement 32.5, 50kg', cat: 'Hardware', unit: 'bag', cost: 690, price: 780, qty: 24, reorder: 10, exp: '' },
    { id: 'p17', sku: 'HDW-002', name: 'Padlock 50mm', cat: 'Hardware', unit: 'piece', cost: 178, price: 240, qty: 11, reorder: 6, exp: '' },
    { id: 'p18', sku: 'HDW-003', name: 'Nails 3 inch, 1kg', cat: 'Hardware', unit: 'kg', cost: 148, price: 200, qty: 19, reorder: 8, exp: '' },
    { id: 'p19', sku: 'HDW-004', name: 'LED bulb 9W', cat: 'Hardware', unit: 'piece', cost: 122, price: 180, qty: 26, reorder: 10, exp: '' },
    { id: 'p20', sku: 'GRC-005', name: 'Salt 1kg', cat: 'Grocery', unit: 'packet', cost: 22, price: 30, qty: 88, reorder: 30, exp: '' }
  ],
  suppliers: [
    { id: 's1', name: 'Kwa Nguvu Distributors', phone: '0722 341 900', terms: '30 days', owed: 18400 },
    { id: 's2', name: 'Coast Beverages Ltd', phone: '0733 118 220', terms: '7 days', owed: 6300 },
    { id: 's3', name: 'Bahari Wholesale', phone: '0711 762 004', terms: 'Cash on delivery', owed: 0 },
    { id: 's4', name: 'Pwani Hardware Supply', phone: '0700 552 871', terms: '14 days', owed: 9750 }
  ],
  pos: [
    { no: 'PO-1042', supplier: 's1', at: '2026-11-12', status: 'received', total: 18400, lines: 6 },
    { no: 'PO-1043', supplier: 's2', at: '2026-11-16', status: 'received', total: 6300, lines: 3 },
    { no: 'PO-1044', supplier: 's4', at: '2026-11-18', status: 'ordered', total: 9750, lines: 4 },
    { no: 'PO-1045', supplier: 's3', at: '2026-11-20', status: 'draft', total: 4150, lines: 5 }
  ],
  customers: [
    { id: 'c1', name: 'Mama Zawadi Kiosk', phone: '0722 118 044', limit: 20000, bal: 8650, since: '2024-03-11' },
    { id: 'c2', name: 'Hotel Bahari', phone: '0733 900 551', limit: 40000, bal: 21400, since: '2023-08-02' },
    { id: 'c3', name: 'Juma Mwinyi', phone: '0711 442 907', limit: 5000, bal: 1280, since: '2025-01-19' },
    { id: 'c4', name: 'Star Mini Market', phone: '0700 663 112', limit: 30000, bal: 18300, since: '2022-11-30' },
    { id: 'c5', name: 'Aisha Bakery', phone: '0745 221 380', limit: 15000, bal: 0, since: '2025-06-04' },
    { id: 'c6', name: 'Walk-in customer', phone: '', limit: 0, bal: 0, since: '2024-01-01' }
  ],
  sales: [],   /* filled by seedSales() */
  ledger: [],  /* credit payments received */
  expenses: [
    { id: 'e1', at: '2026-11-20', what: 'Electricity, KPLC token', amt: 1500, cat: 'Utilities' },
    { id: 'e2', at: '2026-11-19', what: 'Boda delivery to Hotel Bahari', amt: 300, cat: 'Transport' },
    { id: 'e3', at: '2026-11-18', what: 'Casual labour, 2 days', amt: 1600, cat: 'Wages' },
    { id: 'e4', at: '2026-11-15', what: 'Shop licence renewal', amt: 2400, cat: 'Licences' },
    { id: 'e5', at: '2026-11-13', what: 'Airtime and data', amt: 500, cat: 'Utilities' }
  ],
  audit: []
});

const S = SEED();

/* a week of sales at wholesale volume, so the charts and lists have something real */
(function seedSales() {
  const fast = ['p01', 'p03', 'p04', 'p05', 'p06', 'p07', 'p09', 'p10', 'p14', 'p16', 'p20', 'p02'];
  const buyers = ['c1', 'c2', 'c3', 'c4', 'c6', 'c6', 'c6', 'c5'];
  let n = 3800;
  for (let d = 13; d >= 0; d--) {
    const day = addDays(today(), -d);
    /* shops buy in the morning; a quiet Sunday */
    const base = day.getDay() === 0 ? 11 : 21;
    const count = base + ((d * 5) % 7);
    for (let i = 0; i < count; i++) {
      const at = new Date(day);
      at.setHours(7 + ((i * 5 + d) % 11), (i * 13 + d * 7) % 60, 0, 0);
      const items = [];
      const picks = 1 + ((i + d) % 4);
      for (let k = 0; k < picks; k++) {
        const p = S.products.find(x => x.id === fast[(i * 3 + k * 5 + d) % fast.length]);
        const bulk = p.cost > 400 ? 1 : p.cost > 150 ? 2 : 6;
        const q = bulk * (1 + ((i + k * 3) % 4));
        items.push({ id: p.id, name: p.name, qty: q, price: p.price, cost: p.cost, unit: p.unit });
      }
      const total = items.reduce((s, it) => s + it.price * it.qty, 0);
      const credit = (i % 7 === 3);
      const cust = credit ? buyers[i % 4] : buyers[4 + (i % 4)];
      const paidAmt = credit ? Math.round(total * 0.62) : total;
      S.sales.push({
        no: 'R-' + (++n), at: at.toISOString(), items, total,
        paid: paidAmt ? [{ m: i % 3 === 0 ? 'Cash' : i % 3 === 1 ? 'M-Pesa' : 'Card', amt: paidAmt }] : [],
        credit: credit ? total - paidAmt : 0, customer: cust,
        cashier: ['Otieno Were', 'Fatima Ali', 'Wanjiku Kamau'][(i + d) % 3],
        etims: { status: 'sent', sig: 'KRA' + (721000 + n) }
      });
    }
  }
  S.sales.sort((a, b) => new Date(b.at) - new Date(a.at));
})();

/* derived helpers */
const prod = id => S.products.find(p => p.id === id);
const cust = id => S.customers.find(c => c.id === id);
const sup  = id => S.suppliers.find(x => x.id === id);
const salesToday = () => S.sales.filter(s => ymd(new Date(s.at)) === ymd(today()));
const salesOn = d => S.sales.filter(s => ymd(new Date(s.at)) === d);
const sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);
const costOf = s => sum(s.items, it => (it.cost || 0) * it.qty);
const isOwner = () => S.me.role === 'owner';
const can = what => {
  if (isOwner()) return true;
  return ['pos', 'mysales', 'stock', 'purchases'].includes(what);
};
