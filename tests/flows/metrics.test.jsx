// בדיקות יחידה ל-src/lib/metrics.ts — ההגדרות שאושרו ע"י שחף (31.10.2026):
// מכירה = תשלום/מקדמה; שווי לפני מע"מ בלי הובלה; רווח גולמי = שווי פחות עלות מוצר בלבד (בלי שיווק);
// שילוח חסר = 0; עלות מפעל חסרה = עלות לא ידועה (מחוץ לממוצעי הרווח).
import { describe, check, finish, crash } from '../harness/checks.cjs';
import * as M from '../../src/lib/metrics.ts';

const price = (it) => (it.listPrice !== undefined ? Math.max(0, Number(it.listPrice) - Number(it.discount || 0)) : Number(it.price || 0));
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

try {
  describe('1. עסקאות מלאי — קיבוץ לפי הצעה, רווח גולמי בלי שיווק');
  const items = [
    { id: 'i1', status: 'sold', saleDate: '2026-09-10', customerId: 'C1', model: 'Prime', salePrice: 9000, addOnPrice: 500, discountAmount: 500, factoryCostILS: 4000, importCostILS: 600, repairCost: 0, addOnCost: 200, marketingCostILS: 999 },
    { id: 'i2', status: 'sold', saleDate: '2026-09-10', customerId: 'C1', model: 'Night', salePrice: 7800, addOnPrice: 0, factoryCostILS: 3000, importCostILS: 0 },
    { id: 'i3', status: 'sold', saleDate: '2026-10-05', customerId: 'C2', model: 'Prime', salePrice: 9500, factoryCostILS: 0, importCostILS: 0 }, // עלות מפעל חסרה
    { id: 'i4', status: 'in_warehouse', model: 'Prime', factoryCostILS: 4000 },
    { id: 'i5', status: 'sold', saleDate: null, model: 'Prime', salePrice: 9500 }, // אישור בוטל
    { id: 'i6', status: 'sold', saleDate: '2026-10-07', customerId: 'C3', model: 'Urban', source: 'local', localCostILS: 2500, salePrice: 5800 },
  ];
  const quotes = [
    { id: 'Q1', status: 'approved', customerId: 'C1', approvedItemIds: ['i1', 'i2'] },
    { id: 'Q2', status: 'approved_no_stock', customerId: 'C4', approvedAt: '2026-10-12T08:00:00.000Z', items: [{ model: 'Grand', qty: 2, listPrice: 8200, discount: 200 }] },
    { id: 'Q3', status: 'pending', customerId: 'L1', createdAt: '2026-10-01T08:00:00.000Z', items: [{ model: 'Prime', qty: 2, listPrice: 9500 }] },
    { id: 'Q4', status: 'approved_test', customerId: 'C5', items: [{ model: 'Prime', qty: 1, listPrice: 9500 }] },
  ];
  const customProjects = [
    { id: 'P1', status: 'deposit_paid', customerId: 'C6', depositMorningSentAt: '2026-10-20T20:30:00.000Z', depositProductsTotal: 30000 },
    { id: 'P2', status: 'design_only', customerId: 'C7' },
    { id: 'P3', status: 'awaiting_payment', customerId: 'C8' },
  ];
  const customers = [
    { id: 'C1', status: 'active', assignedTo: 'sh@x', previousStatusBeforeActive: 'lead', source: 'website', createdAt: '2026-09-01T08:00:00.000Z' },
    { id: 'C2', status: 'active', createdBy: 'dn@x', createdAt: '2026-09-20T08:00:00.000Z', leadStage: 'waiting' },
    { id: 'C6', status: 'active', assignedTo: 'dn@x', source: 'facebook', createdAt: '2026-10-01T08:00:00.000Z' },
    { id: 'L9', status: 'lead', leadStage: 'new', source: 'facebook', createdAt: '2026-10-02T08:00:00.000Z' },
    { id: 'K1', status: 'active', createdAt: '2026-10-02T08:00:00.000Z' }, // לקוח שלא היה ליד — לא נספר בהמרה
  ];
  const econ = (p) => p.id === 'P1' ? { revenue: 25000, cost: 18000, lines: [{ model: 'בר קסטום', qty: 2, revenue: 25000, cost: 18000 }] } : null;
  const deals = M.buildDeals({ items, quotes, customProjects, customers, quoteItemPrice: price, projectEconomics: econ });
  const byId = Object.fromEntries(deals.map(d => [d.id, d]));

  check(deals.length === 5, `5 עסקאות (הצעה מאושרת, מכירה ידנית ×2, ללא מלאי, קסטום): ${deals.map(d => d.id).join(',')}`);
  const q1 = byId['q:Q1'];
  check(q1 && q1.units === 2 && q1.revenue === 17300, `Q1: 2 יחידות, שווי 17,300 (כולל תוספת, בלי הובלה): ${q1?.revenue}`);
  check(q1 && q1.cost === 7800, `Q1: עלות 7,800 = מפעל+שילוח+עלות תוספת, בלי 999 שיווק: ${q1?.cost}`);
  check(q1 && q1.profit === 9500 && q1.owner === 'sh@x', `Q1: רווח גולמי 9,500, בעלים שחף: ${q1?.profit} ${q1?.owner}`);
  const manual = deals.find(d => d.customerId === 'C2');
  check(manual && manual.cost === null && manual.profit === null, 'יחידה בלי עלות מפעל → עלות לא ידועה');
  const local = deals.find(d => d.customerId === 'C3');
  check(local && local.profit === 3300, `רכישה מקומית: עלות מ-localCostILS, רווח 3,300: ${local?.profit}`);
  check(!deals.some(d => d.lines.some(l => l.model === 'Prime' && l.revenue === 9500 && d.customerId === '')), 'יחידה שאישורה בוטל (saleDate ריק) לא נספרת');
  const ns = byId['n:Q2'];
  check(ns && ns.revenue === 16000 && ns.cost === null && ns.date === '2026-10-12', `ללא מלאי: שווי 16,000, עלות לא ידועה, תאריך האישור: ${ns?.revenue} ${ns?.date}`);
  check(!deals.some(d => d.id.includes('Q3') || d.id.includes('Q4')), 'הצעה ממתינה ואישור בדיקה אינם מכירה');
  const p1 = byId['p:P1'];
  check(p1 && p1.date === '2026-10-20', `קסטום: תאריך המקדמה בשעון ישראל (20:30Z = 23:30 בישראל, שעון קיץ): ${p1?.date}`);
  check(p1 && p1.revenue === 30000 && near(p1.profit, 12000), `קסטום: שווי לפי מה שחויב (30,000), רווח 12,000: ${p1?.revenue} ${p1?.profit}`);
  check(!deals.some(d => d.id === 'p:P2' || d.id === 'p:P3'), '"שולמו רק מדידות" וממתין לתשלום אינם מכירה');

  describe('2. סיכום — עסקה בלי עלות מחוץ לממוצעי הרווח');
  const s = M.summarize(deals);
  check(s.count === 5 && s.missingCost === 2, `5 עסקאות, 2 בלי עלות: ${s.count} ${s.missingCost}`);
  check(s.revenue === 17300 + 9500 + 5800 + 16000 + 30000, `סך שווי: ${s.revenue}`);
  check(near(s.profit, 9500 + 3300 + 12000), `רווח גולמי רק מעסקאות עם עלות: ${s.profit}`);
  check(near(s.marginPct, (24800 / (17300 + 5800 + 30000)) * 100), `מרווח % מחושב רק על עסקאות עם עלות: ${s.marginPct}`);
  check(near(s.avgProfitPerUnit, 24800 / 5), `רווח ממוצע לעמדה (5 יחידות עם עלות): ${s.avgProfitPerUnit}`);

  describe('3. חודשים, מגמה ודגמים');
  const months = M.monthly(deals, '2026-08-01', '2026-10-31');
  check(months.map(m => m.month).join(',') === '2026-08,2026-09,2026-10', `חודשים רציפים כולל חודש ריק: ${months.map(m => m.month)}`);
  check(months[0].count === 0 && months[1].count === 1 && months[2].count === 4, `ספירה לפי חודש: ${months.map(m => m.count)}`);
  check(M.trendSlope([{ avgDeal: 1000, count: 1 }, { avgDeal: 2000, count: 1 }, { avgDeal: 3000, count: 1 }]) === 1000, 'שיפוע +1,000 לחודש');
  check(M.trendSlope([{ avgDeal: 1000, count: 1 }, { avgDeal: 2000, count: 1 }]) === null, 'פחות מ-3 חודשים — אין מגמה');
  const models = M.byModel(deals);
  const prime = models.find(m => m.model === 'Prime');
  check(prime && prime.units === 2 && prime.profitUnits === 1, `Prime: 2 יחידות, רק אחת עם עלות: ${prime?.units}/${prime?.profitUnits}`);
  check(prime && near(prime.discountPct, (500 / (9500 + 500 + 9500)) * 100), `Prime: עומק הנחה מהמחירון: ${prime?.discountPct}`);

  describe('4. המרה לפי מקור ונציג');
  const src = Object.fromEntries(M.conversion(customers, deals, '2026-09-01', '2026-10-31', 'source').map(r => [r.key, r]));
  check(src.website?.leads === 1 && src.website?.won === 1, 'אתר: 1/1');
  check(src.facebook?.leads === 2 && src.facebook?.won === 1, `פייסבוק: 1 מתוך 2: ${src.facebook?.won}/${src.facebook?.leads}`);
  check(src.manual?.leads === 1 && !src.manual?.k, 'ידני: רק C2 (שהיה ליד). K1 שלא היה ליד לא נספר');
  check(src.website?.avgDaysToSale === 9, `ימים מליד למכירה (1.9 → 10.9): ${src.website?.avgDaysToSale}`);
  const own = Object.fromEntries(M.conversion(customers, deals, '', '', 'owner').map(r => [r.key, r]));
  check(own['dn@x']?.leads === 2 && own['לא משויך']?.leads === 1, 'לפי נציג: דניאל 2, לא משויך 1');

  describe('5. הצעות פתוחות וממצאים');
  const pipe = M.pipeline(quotes, price, '2026-10-31');
  check(pipe.count === 1 && pipe.value === 19000 && pipe.staleCount === 1, `הצעה פתוחה אחת, 19,000, ממתינה מעל 14 יום: ${JSON.stringify(pipe)}`);
  const ins = M.insights({ deals, months, models, sources: M.conversion(customers, deals, '', '', 'source'), pipe, summary: s });
  check(ins.some(i => i.text.includes('יותר מ-14 יום')), 'ממצא: הצעות תקועות');
  check(ins.some(i => i.text.includes('בלי עלות ידועה')), 'ממצא: עסקאות בלי עלות');
  check(ins.length <= 5, 'לכל היותר 5 ממצאים');
  check(M.insights({ deals: [], months: [], models: [], sources: [], pipe: { count: 0, value: 0, staleCount: 0, staleValue: 0 }, summary: M.summarize([]) }).length === 0, 'בלי נתונים — אין ממצאים מומצאים');

  describe('6. "היום שלי" — סדר, כפילויות ובעלות');
  const SH = 'sh@x', DN = 'dn@x', TODAY = '2026-10-31';
  const day = M.buildMyDay({
    today: TODAY, userEmail: SH, scope: 'mine', price,
    customers: [
      { id: 'A', status: 'lead', leadStage: 'contacted', assignedTo: SH, followUpDate: '2026-10-25', interactionLogs: [{ date: '2026-10-20T08:00:00Z', text: 'שיחה' }, { date: '2026-10-30T08:00:00Z', text: 'סטטוס', type: 'system' }] },
      { id: 'B', status: 'lead', leadStage: 'callback', assignedTo: SH, followUpDate: '2026-10-30' },
      { id: 'C', status: 'lead', leadStage: 'quote_sent', assignedTo: SH, followUpDate: TODAY },
      { id: 'D', status: 'lead', leadStage: 'quote_sent', assignedTo: SH },
      { id: 'E', status: 'lead', leadStage: 'new', createdAt: '2026-10-28T08:00:00Z', source: 'website' },
      { id: 'F', status: 'lead', leadStage: 'new', createdBy: SH, createdAt: '2026-10-30T08:00:00Z' },
      { id: 'G', status: 'lead', leadStage: 'new', assignedTo: DN, followUpDate: '2026-10-01' },
      { id: 'H', status: 'lead', leadStage: 'not_relevant', assignedTo: SH, followUpDate: '2026-10-01' },
      { id: 'K', status: 'active', assignedTo: SH },
    ],
    quotes: [
      { id: 'q1', status: 'pending', customerId: 'C', createdAt: '2026-10-29T08:00:00Z', items: [{ listPrice: 9500, qty: 1 }] },
      { id: 'q2', status: 'pending', customerId: 'D', createdAt: '2026-10-21T08:00:00Z', items: [{ listPrice: 5800, qty: 1 }] },
      { id: 'q3', status: 'pending', customerId: 'K', createdAt: '2026-10-30T08:00:00Z', items: [{ listPrice: 10400, qty: 1 }] },
      { id: 'q4', status: 'approved', customerId: 'D', items: [{ listPrice: 99999, qty: 1 }] },
    ],
  });
  const ids = (rows) => rows.map(r => r.customer.id).join(',');
  check(ids(day.overdue) === 'A,B', `באיחור — הכי ישן קודם: ${ids(day.overdue)}`);
  check(day.overdue[0].daysOverdue === 6, `A באיחור 6 ימים: ${day.overdue[0].daysOverdue}`);
  check(day.overdue[0].lastLog?.text === 'שיחה' && day.overdue[0].daysSinceContact === 11, 'תיעוד אחרון מתעלם משורות system');
  check(ids(day.today) === 'C' && day.today[0].quoteValue === 9500, 'היום: C עם שווי ההצעה שלו');
  check(ids(day.hot) === 'K,D', `חמים: לפי שווי, כולל לקוח קיים עם הצעה פתוחה, בלי C שכבר בהיום: ${ids(day.hot)}`);
  check(day.hot[1].daysSinceQuote === 10, `D: 10 ימים מאז ההצעה: ${day.hot[1].daysSinceQuote}`);
  check(ids(day.fresh) === 'E,F' && day.fresh[0].unassigned, `חדשים: ממתין הכי הרבה קודם, כולל ליד בלי בעלים: ${ids(day.fresh)}`);
  check(![...day.overdue, ...day.today, ...day.hot, ...day.fresh].some(r => r.customer.id === 'G' || r.customer.id === 'H'), 'בלי לידים של השותף ובלי לא רלוונטי');
  check(day.pipelineValue === 9500 + 5800 + 10400, `שווי הצעות פתוחות שלי: ${day.pipelineValue}`);
  const partner = M.buildMyDay({ today: TODAY, userEmail: SH, scope: 'partner', price, customers: [{ id: 'G', status: 'lead', leadStage: 'new', assignedTo: DN, followUpDate: '2026-10-01' }, { id: 'A', status: 'lead', assignedTo: SH, followUpDate: '2026-10-01' }], quotes: [] });
  check(ids(partner.overdue) === 'G', 'של השותף: רק הלידים של השותף');

  describe('7. עזרים');
  check(M.toWhatsAppNumber('054-805-0870') === '972548050870' && M.toWhatsAppNumber('+972548050870') === '972548050870', 'מספר וואטסאפ בינלאומי');
  check(M.addDaysYmd('2026-10-31', 1) === '2026-11-01' && M.addDaysYmd('2026-12-31', 3) === '2027-01-03', 'הוספת ימים לתאריך');
  finish();
} catch (e) { crash(e); }
