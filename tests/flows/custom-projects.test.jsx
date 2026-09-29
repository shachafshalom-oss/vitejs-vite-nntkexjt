// פרויקטים קסטום — תהליך מלא על הקוד האמיתי של App.tsx:
// פרויקט חדש (מוצרים + פרמטרים + קישור לליד) ← דוח עלויות ← עריכה ישירה עם שמירה אוטומטית ←
// מחיר מכירה ידני ← הובלה והתקנה ← דרישת מקדמה ב-Morning (ליד הופך ללקוח) ← דרישת יתרה ← הושלם.
// אחר כך תרחישי קצה ובדיקת חשדות שעלו בקריאת הקוד (knownBug עד שיאושר תיקון).
//
// המספרים מחושבים ידנית מהנוסחה (ולא מהקוד עצמו):
//   שער 3.7 | שילוח מכולה 2,000$ | מכס 12% | נמל 1,000₪ | הובלה 1,500₪ | התקנה 2,500₪ | מרווח 30%
//   A: 2 יח' × 1,000$, CBM 1.5 ליח' | B: 1 יח' × 2,000$, CBM 2.0
//   מפעל 4,000$ = 14,800₪ | שילוח 7,400₪ | מכס 1,776₪ | קבועות 5,000₪ → עלות כוללת 28,976₪
//   מחיר מינימלי (30%) 37,669₪ | שילוח ל-CBM 1,480₪ | קבועות ליחידה 1,666.67₪
//   A ליח': 3,700 + 2,220 + 444 + 1,666.67 = 8,030.67 × 1.3 = 10,440₪
//   B ליח': 7,400 + 2,960 + 888 + 1,666.67 = 12,914.67 × 1.3 = 16,789₪
import { act } from 'react';
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com';
T.freezeTime('2026-10-07T09:00:00.000Z'); // רביעי 12:00 שעון ישראל

// השמירה האוטומטית מחכה 900ms אחרי ההקלדה האחרונה. כדי שהבדיקה תהיה מהירה מקצרים רק את
// ההשהיות האלה (900 → 60, 1800 → 20). הסדר והלוגיקה נשארים זהים.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 900 ? 60 : ms === 1800 ? 20 : ms, ...a);
const AUTOSAVE_WAIT = 150;

// Morning מדומה: מקליט כל מסמך שנשלח ומחזיר קישור, או שגיאה כש-morningFail=true.
const morningCalls = [];
let morningFail = false;
globalThis.fetch = window.fetch = async (url, opts) => {
  T.ui.fetches.push({ url: String(url), opts });
  if (String(url).includes('morning-proxy')) {
    morningCalls.push(JSON.parse(opts.body).body);
    const payload = morningFail ? { error: 'Morning לא זמין' } : { status: 1, data: `https://morning.test/doc/${morningCalls.length}` };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload };
  }
  return { ok: false, status: 503, text: async () => 'network disabled in tests', json: async () => ({}) };
};

const P2_PARAMS = { exchangeRate: 3.6, containerShippingUSD: 1000, customsPercent: 10, portFeesILS: 600, localTransportILS: 0, installationILS: 0 };
const P2_PRODUCTS = [
  { id: 'X1', itemHe: 'דלפק', itemEn: 'Counter', info: '', size: '', qty: 1, unitPriceUSD: 1500, cbm: 2, images: [], noteHe: '' },
  { id: 'X2', itemHe: 'מדף', itemEn: 'Shelf', info: '', size: '', qty: 2, unitPriceUSD: 300, cbm: 0.5, images: [], noteHe: '' },
  { id: 'X3', itemHe: 'כיור', itemEn: 'Sink', info: '', size: '', qty: 1, unitPriceUSD: 200, cbm: 0.2, images: [], noteHe: '' },
];

T.seed({
  crm_settings: { general_settings: { models: {}, morningApiKeyId: 'kid', morningApiKeySecret: 'ksecret' } },
  crm_customers: {
    L1: { status: 'lead', leadStage: 'quote_sent', businessName: 'בר על הגג', contactName: 'מאיה', phone: '0541234567', email: 'maya@roof.co.il', address: 'תל אביב', hp: '515555555', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-20T10:00:00.000Z' },
    C2: { status: 'active', businessName: 'מלון החוף', contactName: 'אלון', phone: '0529876543', assignedTo: SH, interactionLogs: [], createdAt: '2026-01-01T10:00:00.000Z' },
  },
  crm_custom_projects: {
    P2: { name: 'פרויקט בדיקות', clientName: 'מלון החוף', customerId: 'C2', date: '2026-10-01', status: 'preparation', params: P2_PARAMS, marginPercent: 25, products: P2_PRODUCTS, notes: '', deliveryCost: 500, createdAt: '2026-10-01T10:00:00.000Z' },
    P3: { name: 'פרויקט בלי לקוח', clientName: '', customerId: '', date: '2026-10-02', status: 'preparation', params: P2_PARAMS, marginPercent: 30, products: [P2_PRODUCTS[0]], createdAt: '2026-10-02T10:00:00.000Z' },
  },
});
T.setNav('sales', 'custom_projects');

// ---------- חישוב עצמאי (לא מהקוד של האפליקציה) ----------
function expectTotals(params, products, margin = 30) {
  const r = Number(params.exchangeRate);
  const qty = products.reduce((s, p) => s + Number(p.qty), 0);
  const cbm = products.reduce((s, p) => s + Number(p.cbm) * Number(p.qty), 0);
  const factoryILS = products.reduce((s, p) => s + Number(p.unitPriceUSD) * Number(p.qty), 0) * r;
  const shipILS = Number(params.containerShippingUSD) * r;
  const customsILS = factoryILS * Number(params.customsPercent) / 100;
  const fixed = Number(params.portFeesILS) + Number(params.localTransportILS) + Number(params.installationILS);
  const total = factoryILS + shipILS + customsILS + fixed;
  return { total, suggested: total * (1 + margin / 100), shipPerCbm: cbm ? shipILS / cbm : 0, fixedPerUnit: qty ? fixed / qty : 0 };
}
function expectUnitSale(params, product, products, margin = 30) {
  const t = expectTotals(params, products, margin);
  const f = Number(product.unitPriceUSD) * Number(params.exchangeRate);
  const landed = f + t.shipPerCbm * Number(product.cbm) + f * Number(params.customsPercent) / 100 + t.fixedPerUnit;
  return Math.round(landed * (1 + margin / 100));
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.5;

// ---------- עזרי מסך ----------
const NAME = 'בר על הגג — גג אירועים';
const proj = (id) => T.docs('crm_custom_projects')[id];
const newProjId = () => Object.keys(T.docs('crm_custom_projects')).find(id => proj(id).name === NAME);
const form = () => T.byId('cp-form');
const detail = () => T.byId('cp-detail-close')?.closest('.fixed');
const payModal = () => { const h = T.$$('h3').find(x => x.textContent.includes('שידור דרישת')); return h ? h.closest('.fixed') : null; };
async function openDetail(id) {
  if (detail()) await T.click(T.byId('cp-detail-close'));
  await T.click(T.byId(`cp-status-${id}`).closest('[data-testid="cp-card"]'));
  return !!detail();
}
async function closePayModal() { if (payModal()) await T.click(payModal().querySelector('button[aria-label="סגור"]')); }
async function fillRow(i, { name, usd, cbm, qty }) {
  const row = T.allById('cp-form-row')[i];
  await T.type(row.querySelector('input[type="text"]'), name);
  const [usdIn, cbmIn, qtyIn] = T.$$('input[type="number"]', row);
  await T.type(usdIn, usd);
  await T.type(cbmIn, cbm);
  await T.type(qtyIn, qty);
}

(async () => {
  await T.mountApp(App);

  // =====================================================================
  T.describe('1. הקמת פרויקט חדש');
  await T.click(T.byId('cp-new'));
  T.check(!!form(), 'חלון "פרויקט קסטום חדש" לא נפתח');
  await T.type(T.fieldByLabel('שם הפרויקט', form()), NAME);
  await T.type(T.fieldByLabel('שם לקוח', form()), 'מאיה');
  await T.select(T.fieldByLabel('קישור ללקוח ב-CRM', form()), 'L1');
  await T.click(T.byId('cp-form-add-product'));
  await T.click(T.byId('cp-form-add-product'));
  await fillRow(0, { name: 'עמדת בר A', usd: 1000, cbm: 1.5, qty: 2 });
  await fillRow(1, { name: 'עמדת בר B', usd: 2000, cbm: 2, qty: 1 });
  await T.type(T.fieldByLabel('שער דולר', form()), 3.7);
  await T.type(T.fieldByLabel('שילוח מכולה', form()), 2000);
  await T.type(T.fieldByLabel('מכס', form()), 12);
  await T.type(T.fieldByLabel('אגרות נמל', form()), 1000);
  await T.type(T.fieldByLabel('הובלה בארץ', form()), 1500);
  await T.type(T.fieldByLabel('עלות התקנה', form()), 2500);
  T.check(T.amountShown(28976, form()) && T.amountShown(37669, form()), 'התצוגה המקדימה בחלון לא מראה עלות 28,976 / מינימום 37,669');
  await T.submit(form());
  await T.flush(10);
  const PID = newProjId();
  const P = () => proj(PID) || {};
  T.check(!!PID && !form(), 'הפרויקט לא נשמר / החלון לא נסגר');
  T.check(P().customerId === 'L1' && P().status === 'preparation' && !!P().createdAt, `שדות בסיס שגויים: ${JSON.stringify({ c: P().customerId, s: P().status })}`);
  T.check(near(P().totalCostILS, 28976) && near(P().suggestedPrice, 37668.8) && P().totalQty === 3 && near(P().totalCBM, 5), `הסיכומים שנשמרו שגויים: עלות ${P().totalCostILS}, מינימום ${P().suggestedPrice}`);
  T.check((P().products || []).map(p => `${p.itemHe}:${p.qty}:${p.unitPriceUSD}:${p.cbm}`).join('|') === 'עמדת בר A:2:1000:1.5|עמדת בר B:1:2000:2', `המוצרים נשמרו שגוי: ${JSON.stringify(P().products)}`);
  const card = T.byId(`cp-status-${PID}`)?.closest('[data-testid="cp-card"]');
  // בכרטיס התאריך צמוד לסכום בטקסט, ולכן בודקים את הצירוף "עלות כוללת₪28,976"
  T.check(!!card && card.textContent.includes('עלות כוללת₪28,976'), 'כרטיס הפרויקט ברשימה לא מציג עלות כוללת 28,976');

  // =====================================================================
  T.describe('2. דוח עלויות ומחירי מכירה');
  T.check(await openDetail(PID), 'דוח העלויות של הפרויקט לא נפתח');
  T.check(T.amountShown(28976, detail()) && T.amountShown(37669, detail()), 'הדוח לא מציג עלות 28,976 ומינימום 37,669');
  T.check(T.byId('cp-row-sale-0').value === '10440' && T.byId('cp-row-sale-1').value === '16789', `מחירי מכירה ליחידה שגויים: ${T.byId('cp-row-sale-0').value}, ${T.byId('cp-row-sale-1').value} (צפוי 10,440 / 16,789)`);
  T.check(T.amountShown(37669, T.byId('cp-sale-total')), `סה"כ מכירה בשורת הסיכום שגוי: ${T.byId('cp-sale-total').textContent}`);

  // =====================================================================
  T.describe('3. עריכה ישירה עם שמירה אוטומטית');
  await T.type(T.byId('cp-param-exchangeRate'), 3.8);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(P().params.exchangeRate === 3.8 && near(P().totalCostILS, 29624), `שינוי שער לא נשמר או שהעלות לא חושבה מחדש (צפוי 29,624): ${P().params.exchangeRate}, ${P().totalCostILS}`);
  T.check(P().params.containerShippingUSD === 2000 && P().params.installationILS === 2500, 'שמירת שער דרסה פרמטרים אחרים');
  await T.type(T.byId('cp-param-exchangeRate'), 3.7);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(near(P().totalCostILS, 28976), 'החזרת השער ל-3.7 לא החזירה את העלות ל-28,976');
  await T.type(T.byId('cp-row-sale-0'), 11000);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(P().salePriceOverrides && Number(P().salePriceOverrides['0']) === 11000, `מחיר מכירה ידני לא נשמר: ${JSON.stringify(P().salePriceOverrides)}`);
  T.check(T.amountShown(38789, T.byId('cp-sale-total')), `סה"כ מכירה לא התעדכן ל-38,789: ${T.byId('cp-sale-total').textContent}`);

  // הובלה והתקנה נקבעות בחלון הפקת ההצעה ללקוח
  await T.click(T.byId('cp-pdf-open'));
  await T.click(T.byId('cp-pdf-type-customer'));
  T.check(!!T.byId('cp-delivery-cost'), 'שדה "עלות הובלה והתקנה" לא מופיע בהצעה ללקוח');
  await T.type(T.byId('cp-delivery-cost'), 1200);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(Number(P().deliveryCost) === 1200, `עלות הובלה והתקנה לא נשמרה: ${P().deliveryCost}`);
  await T.click(T.byId('cp-pdf-cancel'));

  // =====================================================================
  T.describe('4. דרישת מקדמה ב-Morning');
  await T.selectAction(T.byId('cp-detail-status'), 'deposit_paid');
  T.check(!!payModal(), 'חלון שידור המקדמה לא נפתח');
  T.check(P().status === 'preparation', 'הסטטוס השתנה לפני השידור');
  await T.click(T.byId('cp-pay-send'));
  await T.flush(10);
  const dep = morningCalls[0] || { income: [] };
  const depLines = dep.income.map(l => `${l.description}:${l.quantity}:${l.price}`);
  T.check(morningCalls.length === 1, `צפוי מסמך Morning אחד, נשלחו ${morningCalls.length}`);
  T.check(depLines[0] === 'עמדת בר A:2:11000' && depLines[1] === 'עמדת בר B:1:16789', `שורות המוצרים במסמך שגויות: ${depLines.join(' | ')}`);
  T.check(dep.income.length === 3 && dep.income[2].price === -27152, `שורת הניכוי שגויה (צפוי -27,152): ${JSON.stringify(dep.income[2])}`);
  T.check(dep.income.reduce((s, l) => s + l.quantity * l.price, 0) === 11637, 'סכום המסמך אינו 30% מ-38,789 = 11,637');
  T.check(dep.client?.name === 'בר על הגג' && dep.client?.taxId === '515555555' && dep.type === 300, `פרטי הלקוח/סוג המסמך שגויים: ${JSON.stringify(dep.client)}`);
  T.check(P().status === 'deposit_paid' && P().depositAmount === 11637 && P().depositProductsTotal === 38789 && P().depositMorningInvoiceUrl === 'https://morning.test/doc/1', `שדות המקדמה בפרויקט שגויים: ${JSON.stringify({ s: P().status, a: P().depositAmount, u: P().depositMorningInvoiceUrl })}`);
  const L1 = T.docs('crm_customers').L1;
  T.check(L1.status === 'active' && L1.previousStatusBeforeActive === 'lead', `הליד לא הפך ללקוח פעיל אחרי מקדמה: ${L1.status}`);
  await closePayModal();

  // =====================================================================
  T.describe('5. דרישת יתרה והשלמת הפרויקט');
  await T.selectAction(T.byId('cp-detail-status'), 'completed');
  T.check(!!payModal(), 'חלון שידור היתרה לא נפתח');
  await T.click(T.byId('cp-pay-send'));
  await T.flush(10);
  const bal = morningCalls[1] || { income: [] };
  const balKinds = bal.income.map(l => l.price);
  T.check(balKinds.join(',') === '11000,16789,-11637,1200', `שורות מסמך היתרה שגויות (צפוי מוצרים, ניכוי מקדמה -11,637, הובלה 1,200): ${balKinds.join(',')}`);
  T.check(bal.income.reduce((s, l) => s + l.quantity * l.price, 0) === 28352, 'סכום היתרה אינו 38,789 - 11,637 + 1,200 = 28,352');
  T.check(P().status === 'completed' && P().balanceAmount === 28352 && P().balanceDeliveryCost === 1200 && !!P().balanceMorningInvoiceUrl, `שדות היתרה שגויים: ${JSON.stringify({ s: P().status, a: P().balanceAmount })}`);
  await closePayModal();
  await T.click(T.byId('cp-detail-close'));

  // חזרה אחורה מסטטוס תשלום: אזהרה שהמסמכים ב-Morning לא מתבטלים; "ביטול" לא משנה כלום
  T.answerConfirms(false);
  await T.selectAction(T.byId(`cp-status-${PID}`), 'submitted');
  T.check(T.lastConfirm().includes('נשארות שם') && P().status === 'completed', 'ביטול באזהרת החזרה אחורה בכל זאת שינה סטטוס / לא הוצגה אזהרה');
  await T.selectAction(T.byId(`cp-status-${PID}`), 'submitted');
  T.check(P().status === 'submitted' && !!P().depositMorningInvoiceUrl, 'אישור החזרה אחורה לא שינה סטטוס, או מחק את תיעוד המקדמה');
  T.check(morningCalls.length === 2, 'החזרה אחורה שידרה מסמך נוסף ל-Morning');

  // =====================================================================
  T.describe('6. חסימות ושגיאות');
  const alertsBefore = T.ui.alerts.length;
  await T.selectAction(T.byId('cp-status-P3'), 'deposit_paid');
  T.check(!payModal() && T.lastAlert().includes('אינו מקושר ללקוח') && proj('P3').status === 'preparation', 'פרויקט בלי לקוח לא נחסם משידור מקדמה');
  await T.selectAction(T.byId('cp-status-P2'), 'completed');
  T.check(!payModal() && T.lastAlert().includes('לא נשלחה עדיין דרישת מקדמה'), 'אפשר לשדר יתרה בלי מקדמה');
  T.check(T.ui.alerts.length === alertsBefore + 2, 'מספר ההתראות שגוי');
  morningFail = true;
  await T.selectAction(T.byId('cp-status-P2'), 'deposit_paid');
  await T.click(T.byId('cp-pay-send'));
  await T.flush(10);
  T.check(proj('P2').status === 'preparation' && !proj('P2').depositMorningInvoiceUrl && String(proj('P2').depositMorningError || '').includes('Morning לא זמין'), `כשל ב-Morning: הסטטוס השתנה או שהשגיאה לא נשמרה: ${JSON.stringify({ s: proj('P2').status, e: proj('P2').depositMorningError })}`);
  T.check(T.docs('crm_customers').C2.status === 'active' && morningCalls.length === 3, 'כשל ב-Morning נגע בלקוח');
  await closePayModal();
  morningFail = false;

  // מחיקה
  const beforeDelete = Object.keys(T.docs('crm_custom_projects')).length;
  T.answerConfirms(false);
  await T.click(T.byId('cp-delete-P3'));
  T.check(!!proj('P3'), 'ביטול באישור המחיקה בכל זאת מחק');
  await T.click(T.byId('cp-delete-P3'));
  T.check(!proj('P3') && Object.keys(T.docs('crm_custom_projects')).length === beforeDelete - 1 && !T.byId('cp-status-P3'), 'המחיקה לא מחקה את הפרויקט (או מחקה יותר)');

  // =====================================================================
  T.describe('7. חשדות מקריאת הקוד');
  const P2 = () => proj('P2');

  // CP-1: מכס 0% — מסך, שורת סיכום, ייצוא PDF ו-Morning חייבים להציג/לחייב אותו מחיר
  await openDetail('P2');
  await T.type(T.byId('cp-param-customsPercent'), 0);
  await T.sleep(AUTOSAVE_WAIT);
  const zeroParams = { ...P2_PARAMS, customsPercent: 0 };
  const expectedZero = P2_PRODUCTS.map(pr => expectUnitSale(zeroParams, pr, P2_PRODUCTS, 25));
  const expectedZeroTotal = expectedZero.reduce((s, u, i) => s + u * P2_PRODUCTS[i].qty, 0);
  const shownZero = P2_PRODUCTS.map((_, i) => Number(T.byId(`cp-row-sale-${i}`).value));
  T.check(near(proj('P2').totalCostILS, expectTotals(zeroParams, P2_PRODUCTS, 25).total), `CP-1: עלות כוללת שנשמרה עם מכס 0% שגויה: ${proj('P2').totalCostILS}`);
  T.check(shownZero.join(',') === expectedZero.join(','), `CP-1: מחירי המכירה על המסך עם מכס 0% לא לפי 0% (צפוי ${expectedZero.join(',')}, מוצג ${shownZero.join(',')})`);
  T.check(T.amountShown(expectedZeroTotal, T.byId('cp-sale-total')), `CP-1: שורת הסיכום עם מכס 0% שגויה (צפוי ${expectedZeroTotal}): ${T.byId('cp-sale-total').textContent}`);
  await T.click(T.byId('cp-pdf-open'));
  const pdfZero = P2_PRODUCTS.map((_, i) => Number(T.byId(`cp-pdf-sale-${i}`)?.value));
  T.check(pdfZero.join(',') === expectedZero.join(','), `CP-1: מחירי ייצוא ה-PDF עם מכס 0% שגויים (צפוי ${expectedZero.join(',')}, התקבל ${pdfZero.join(',')})`);
  await T.click(T.byId('cp-pdf-cancel'));
  await T.selectAction(T.byId('cp-detail-status'), 'deposit_paid');
  await T.click(T.byId('cp-pay-test'));
  await T.flush(10);
  const sentZero = (morningCalls[morningCalls.length - 1]?.income || []).filter(l => l.price > 0).map(l => l.price);
  T.check(proj('P2').status === 'preparation' && String(morningCalls[morningCalls.length - 1]?.client?.name || '').startsWith('[TEST]'), 'שידור "בדיקה בלבד" שינה סטטוס או לא סומן [TEST]');
  T.check(sentZero.join(',') === expectedZero.join(','), `CP-1: מסמך Morning עם מכס 0% שונה ממה שעל המסך (צפוי ${expectedZero.join(',')}, נשלח ${sentZero.join(',')})`);
  await closePayModal();
  await T.type(T.byId('cp-param-customsPercent'), 10);
  await T.sleep(AUTOSAVE_WAIT);

  // CP-2: עריכת פרמטר ומיד אחריה עריכת מוצר — הסיכומים שנשמרים מחושבים כל פעם מחצי ישן
  await T.type(T.byId('cp-param-exchangeRate'), 4);
  await T.type(T.byId('cp-row-qty-0'), 3);
  await T.sleep(AUTOSAVE_WAIT);
  const raceExpected = expectTotals(P2().params, P2().products, 25).total;
  T.check(P2().params.exchangeRate === 4 && P2().products[0].qty === 3, 'שתי העריכות לא נשמרו');
  T.knownBug('CP-2', `עריכת פרמטר ומוצר בהפרש של פחות משנייה: "עלות כוללת" שנשמרת (ומוצגת בכרטיס ברשימה) לא תואמת את הנתונים (נשמר ${Math.round(P2().totalCostILS)}, נכון ${Math.round(raceExpected)})`, near(P2().totalCostILS, raceExpected));
  await T.type(T.byId('cp-row-qty-0'), 1);
  await T.sleep(AUTOSAVE_WAIT);
  await T.type(T.byId('cp-param-exchangeRate'), 3.6);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(near(P2().totalCostILS, expectTotals(P2_PARAMS, P2_PRODUCTS, 25).total), 'עריכות בנפרד (עם הפסקה) לא החזירו סיכום נכון');

  // CP-3: מחיר ידני נשמר לפי מספר שורה — מחיקת שורה חייבת להזיז את המחירים יחד עם המוצרים
  await T.type(T.byId('cp-row-sale-0'), 20000); // דלפק
  await T.sleep(AUTOSAVE_WAIT);
  // מחיר לכיור ומחיקת הדלפק מיד אחריו — לפני שהשמירה האוטומטית של המחיר רצה
  await T.type(T.byId('cp-row-sale-2'), 1500);  // כיור
  await T.click(T.byId('cp-row-delete-0'));     // מוחקים את הדלפק
  const afterDelete = [P2_PRODUCTS[1], P2_PRODUCTS[2]];
  const shelfCalc = expectUnitSale(P2_PARAMS, P2_PRODUCTS[1], afterDelete, 25);
  // מיד אחרי המחיקה (לפני שהשמירה האוטומטית רצה): גם ה-PDF וגם Morning חייבים לראות את המחירים שזזו
  await T.click(T.byId('cp-pdf-open'));
  const pdfRightAway = [0, 1].map(i => Number(T.byId(`cp-pdf-sale-${i}`)?.value));
  await T.click(T.byId('cp-pdf-cancel'));
  await T.selectAction(T.byId('cp-detail-status'), 'deposit_paid');
  await T.click(T.byId('cp-pay-test'));
  await T.flush(4);
  const morningRightAway = (morningCalls[morningCalls.length - 1]?.income || []).filter(l => l.price > 0).map(l => l.price);
  await closePayModal();
  T.check(pdfRightAway.join(',') === `${shelfCalc},1500`, `CP-3: חלון ה-PDF שנפתח מיד אחרי מחיקה מציג מחירים שלא זזו: ${pdfRightAway.join(',')}`);
  T.check(morningRightAway.join(',') === `${shelfCalc},1500`, `CP-3: מסמך Morning שנשלח מיד אחרי מחיקה מחייב מחירים שלא זזו: ${morningRightAway.join(',')}`);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(P2().products.length === 2 && P2().products[0].id === 'X2', 'מחיקת שורה לא נשמרה');
  const shownAfterDelete = [0, 1].map(i => Number(T.byId(`cp-row-sale-${i}`).value));
  T.check(shownAfterDelete.join(',') === `${shelfCalc},1500`, `CP-3: אחרי מחיקת הדלפק, המדף צריך לחזור למחיר המחושב (${shelfCalc}) והכיור להישאר 1,500: מוצג ${shownAfterDelete.join(',')}`);
  T.check(JSON.stringify(P2().salePriceOverrides) === JSON.stringify({ 1: 1500 }), `CP-3: המחירים הידניים שנשמרו לא זזו עם המוצרים: ${JSON.stringify(P2().salePriceOverrides)}`);
  await T.selectAction(T.byId('cp-detail-status'), 'deposit_paid');
  await T.click(T.byId('cp-pay-test'));
  await T.flush(10);
  const sentAfterDelete = (morningCalls[morningCalls.length - 1]?.income || []).filter(l => l.price > 0).map(l => l.price);
  T.check(sentAfterDelete.join(',') === `${shelfCalc},1500`, `CP-3: מסמך Morning אחרי מחיקה מחייב מחירים שגויים: ${sentAfterDelete.join(',')}`);
  await closePayModal();
  await T.click(T.byId('cp-detail-close'));

  // CP-4 + CP-5: חלון העריכה שומר את כל הפרויקט כפי שהיה ברגע הפתיחה
  await T.click(T.byId('cp-edit-P2'));
  await T.flush(2);
  await act(async () => { await T.api().updateDoc(T.api().doc(null, 'crm_custom_projects', 'P2'), { deliveryCost: 900, notes: 'עודכן ממכשיר אחר' }); });
  await T.flush(4);
  await T.type(T.fieldByLabel('שם לקוח', form()), 'מלון החוף — אלון');
  await T.submit(form());
  await T.flush(10);
  T.check(P2().clientName === 'מלון החוף — אלון', 'שמירה מחלון העריכה לא נשמרה');
  T.knownBug('CP-4', `שמירה מחלון העריכה דורסת שינויים שנשמרו בזמן שהחלון היה פתוח (ממכשיר אחר / שמירה אוטומטית): ההערות חזרו ל-"${P2().notes}" והובלה ל-${P2().deliveryCost} במקום "עודכן ממכשיר אחר" / 900`, Number(P2().deliveryCost) === 900 && P2().notes === 'עודכן ממכשיר אחר');
  T.knownBug('CP-5', 'שמירה מחלון העריכה כותבת את השדה id לתוך מסמך הפרויקט', !('id' in P2()));

  // CP-6: אחרי עריכה בחלון, דוח העלויות ממשיך להציג את המוצרים מהעריכה הישירה הקודמת
  await openDetail('P2');
  await T.type(T.byId('cp-row-qty-0'), 3);
  await T.sleep(AUTOSAVE_WAIT);
  await T.click(T.byId('cp-detail-close'));
  await T.click(T.byId('cp-edit-P2'));
  const [usdIn] = T.$$('input[type="number"]', T.allById('cp-form-row')[0]);
  await T.type(usdIn, 350);
  await T.submit(form());
  await T.flush(10);
  T.check(P2().products[0].unitPriceUSD === 350, 'שינוי מחיר מוצר בחלון העריכה לא נשמר');
  await openDetail('P2');
  const shownUsd = T.byId('cp-row-usd-0').value;
  await T.type(T.byId('cp-row-qty-0'), 2);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(shownUsd === '350' && P2().products[0].unitPriceUSD === 350, `CP-6: אחרי שמירה בחלון העריכה, דוח העלויות מציג את המוצרים הישנים (מחיר ${shownUsd}$ במקום 350$), ועריכה ישירה הבאה מחזירה אותם ל-Firestore (נשמר ${P2().products[0].unitPriceUSD}$)`);
  await T.click(T.byId('cp-detail-close'));

  // CP-3 (חלון העריכה): מחיקת מוצר בחלון מזיזה גם את המחירים הידניים
  const overridesBeforeModal = P2().salePriceOverrides || {};
  const lastIdx = P2().products.length - 1;
  await T.click(T.byId('cp-edit-P2'));
  const lastPrice = Number(overridesBeforeModal[lastIdx]);
  T.check(lastPrice > 0, `צפוי מחיר ידני על המוצר האחרון לפני התרחיש: ${JSON.stringify(overridesBeforeModal)}`);
  await T.click(T.$('button[type="button"]', T.allById('cp-form-row')[0]) && T.$$('button[type="button"]', T.allById('cp-form-row')[0]).pop());
  await T.submit(form());
  await T.flush(10);
  T.check(P2().products.length === lastIdx && JSON.stringify(P2().salePriceOverrides) === JSON.stringify({ [lastIdx - 1]: lastPrice }), `CP-3: מחיקה בחלון העריכה לא הזיזה את המחירים הידניים: ${JSON.stringify(P2().salePriceOverrides)}`);

  T.check(!globalThis.__unhandled, `היו ${globalThis.__unhandled} שגיאות לא מטופלות`);
  T.finish();
})().catch(T.crash);
