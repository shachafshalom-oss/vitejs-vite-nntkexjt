// "היום שלי" (דשבורד מכירות) + "ניתוח מכירות" (טאב כספים) על הקוד האמיתי של App.tsx.
// הגדרות שאושרו ע"י שחף (31.10.2026): מכירה = תשלום/מקדמה, רווח גולמי בלי שיווק,
// פרויקט קסטום נספר כמכירה בתאריך המקדמה, אפס טאבים חדשים.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com'; // המשתמש המחובר במוק
const DN = 'danielyos205@gmail.com';
T.freezeTime('2026-10-31T09:00:00.000Z'); // שבת 31.10.2026, 11:00 בישראל
const TODAY = '2026-10-31';

T.seed({
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500 }, Night: { id: 'm_night', cbm: 1, listPrice: 7800 } } } },
  crm_shipments: {
    S1: { name: 'משלוח ספטמבר', date: '2026-08-01', arrivalDate: '2026-09-01', status: 'in_warehouse', exchangeRate: 3.5, shippingCostUSD: 0, shippingCostILS: 2000, totalCbm: 2, lines: [{ model: 'Prime', modelId: 'm_prime', qty: 2, unitCostUSD: 1000 }], createdAt: '2026-08-01T10:00:00.000Z' },
  },
  crm_campaigns: { CMP: { name: 'קמפיין', totalCost: 3000, startDate: '2026-10-01' } },
  crm_items: {
    // נמכרה ב-Q1: עלות 1000$×3.5 + שילוח 1,000 = 4,500. מחיר 9,500 → רווח גולמי 5,000 (בלי 3,000 שיווק)
    I1: { model: 'Prime', modelId: 'm_prime', status: 'sold', shipmentId: 'S1', factoryUnitCostUSD: 1000, saleDate: '2026-10-10', customerId: 'CW', salePrice: 9500, addOnPrice: 0, discountAmount: 0, repairCost: 0, addOnCost: 0, campaignId: 'CMP', createdAt: '2026-08-01T10:00:00.000Z' },
    I2: { model: 'Prime', modelId: 'm_prime', status: 'in_warehouse', shipmentId: 'S1', factoryUnitCostUSD: 1000, saleDate: null, salePrice: 0, addOnPrice: 0, repairCost: 0, addOnCost: 0, campaignId: '', createdAt: '2026-08-01T10:00:00.000Z' },
  },
  crm_quotes: {
    Q1: { status: 'approved', customerId: 'CW', approvedItemIds: ['I1'], approvedAt: '2026-10-10T08:00:00.000Z', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], createdAt: '2026-10-05T08:00:00.000Z' },
    QH: { status: 'pending', customerId: 'H', items: [{ model: 'Prime', modelId: 'm_prime', qty: 2, listPrice: 9500, discount: 500 }], createdAt: '2026-10-11T08:00:00.000Z' },
  },
  crm_custom_projects: {
    // מקדמה שולמה היום: מחיר נעול 12,000; עלות 2000$×3.5 = 7,000 (מכס 0) → רווח 5,000
    P1: { name: 'בר קסטום', customerId: 'CP', status: 'deposit_paid', depositMorningSentAt: '2026-10-31T08:00:00.000Z', depositProductsTotal: 12000, depositAmount: 6000, marginPercent: 30, params: { exchangeRate: 3.5, containerShippingUSD: 0, customsPercent: 0, portFeesILS: 0, localTransportILS: 0, installationILS: 0 }, products: [{ lineId: 'l1', itemHe: 'עמדה', qty: 1, unitPriceUSD: 2000, cbm: 1, lockedSaleILS: 12000 }], date: '2026-10-01' },
  },
  crm_customers: {
    A: { status: 'lead', leadStage: 'contacted', businessName: 'בר באיחור', contactName: 'אבי', phone: '0501000001', assignedTo: SH, followUpDate: '2026-10-27', followUpNote: 'לחזור אחרי הפגישה', interactionLogs: [{ date: '2026-10-20T08:00:00.000Z', text: 'ביקש מחיר לשתי עמדות', user: SH }], createdAt: '2026-10-15T08:00:00.000Z' },
    B: { status: 'lead', leadStage: 'callback', businessName: 'בר היום', phone: '0501000002', assignedTo: SH, followUpDate: TODAY, interactionLogs: [], createdAt: '2026-10-20T08:00:00.000Z' },
    H: { status: 'lead', leadStage: 'quote_sent', businessName: 'בר חם', phone: '0501000003', assignedTo: SH, interactionLogs: [{ date: '2026-10-11T08:00:00.000Z', text: 'נשלחה הצעה', user: SH }], createdAt: '2026-10-08T08:00:00.000Z', source: 'facebook' },
    N: { status: 'lead', leadStage: 'new', businessName: 'ליד מהאתר', phone: '+972501000004', source: 'website', interactionLogs: [], createdAt: '2026-10-30T08:00:00.000Z' },
    D: { status: 'lead', leadStage: 'contacted', businessName: 'בר של דניאל', phone: '0501000005', assignedTo: DN, followUpDate: '2026-10-29', interactionLogs: [], createdAt: '2026-10-01T08:00:00.000Z' },
    X: { status: 'lead', leadStage: 'not_relevant', businessName: 'לא רלוונטי', phone: '0501000006', assignedTo: SH, followUpDate: '2026-10-01', interactionLogs: [], createdAt: '2026-10-01T08:00:00.000Z' },
    CW: { status: 'active', businessName: 'לקוח מלאי', phone: '0501000007', assignedTo: SH, previousStatusBeforeActive: 'lead', source: 'website', createdAt: '2026-10-01T08:00:00.000Z', interactionLogs: [] },
    CP: { status: 'active', businessName: 'לקוח קסטום', phone: '0501000008', assignedTo: DN, previousStatusBeforeActive: 'lead', source: 'facebook', createdAt: '2026-10-03T08:00:00.000Z', interactionLogs: [] },
  },
});
T.setNav('sales', 'sales_dashboard');

const rowsOf = (sec) => T.allById(sec === 'followups' ? 'dash-followup-row' : `myday-${sec}-row`).map(r => r.textContent);
const rowFor = (name) => [...T.allById('dash-followup-row'), ...T.byIdPrefix('myday-')].find(r => r.getAttribute('data-testid')?.endsWith('-row') && r.textContent.includes(name));
const cust = (id) => T.docs('crm_customers')[id];

(async () => {
  await T.mountApp(App);
  await T.flush(8);

  T.describe('1. "היום שלי" — מה מופיע ובאיזה סדר');
  T.check(!!T.byId('myday-overdue') && T.byId('myday-overdue').textContent.includes('בר באיחור'), 'באיחור: בר באיחור');
  T.check(T.byId('myday-overdue').textContent.includes('באיחור 4 ימים'), `באיחור 4 ימים: ${T.byId('myday-overdue')?.textContent.slice(0, 120)}`);
  T.check(T.byId('myday-overdue').textContent.includes('ביקש מחיר לשתי עמדות') && T.byId('myday-overdue').textContent.includes('לחזור אחרי הפגישה'), 'השורה מציגה תיעוד אחרון והערת תזכורת — בלי להיכנס לליד');
  T.check(T.byId('myday-today')?.textContent.includes('בר היום'), 'היום: בר היום');
  T.check(T.byId('myday-hot')?.textContent.includes('בר חם') && T.amountShown(18000, T.byId('myday-hot')), `חם: שווי ההצעה 18,000 (2×9,000): ${T.byId('myday-hot')?.textContent.slice(0, 100)}`);
  T.check(T.byId('myday-fresh')?.textContent.includes('ליד מהאתר') && T.byId('myday-fresh').textContent.includes('לא משויך'), 'חדשים: ליד מהאתר בלי בעלים, מסומן "לא משויך"');
  T.check(!T.text().includes('בר של דניאל') && !T.byId('myday-overdue').textContent.includes('לא רלוונטי'), 'ברירת מחדל "שלי": בלי הליד של דניאל ובלי לא רלוונטי');
  T.check(T.byId('myday-next')?.textContent.includes('בר באיחור'), 'הפעולה הבאה = הליד הכי דחוף');
  T.check(T.byId('myday-tasks')?.textContent.trim() === '3', `משימות להיום = באיחור + היום + חדשים: ${T.byId('myday-tasks')?.textContent}`);
  T.check(T.amountShown(18000, T.byId('myday-pipeline')), `הצעות פתוחות שלי: ${T.byId('myday-pipeline')?.textContent}`);
  T.check(T.byId('myday-month-closed')?.textContent.trim() === '1', `סגירות החודש שלי: 1 (המלאי של שחף; הקסטום של דניאל): ${T.byId('myday-month-closed')?.textContent}`);
  T.check(rowFor('בר באיחור')?.querySelector('a[href="tel:0501000001"]') && rowFor('בר באיחור')?.querySelector('a[href^="https://wa.me/972501000001"]'), 'חיוג ווואטסאפ ישירות מהשורה');

  T.describe('2. דחיית תזכורת מהשורה');
  await T.click(rowFor('בר היום').querySelector('[data-testid="myday-snooze-1"]'));
  await T.flush(4);
  // מחר = ראשון 1.11
  T.check(cust('B').followUpDate === '2026-11-01', `דחייה למחר: ${cust('B').followUpDate}`);

  T.describe('3. תיעוד שיחה + תזכורת הבאה, בלי להיכנס לליד');
  await T.click(rowFor('בר באיחור').querySelector('[data-testid="myday-log"]'));
  await T.type(T.byId('myday-log-text'), 'דיברנו, מחכה לאישור שותף');
  await T.click(T.byId('myday-next-3'));
  await T.click(T.byId('myday-log-save'));
  await T.flush(6);
  const logs = cust('A').interactionLogs || [];
  T.check(logs.some(l => l.text === 'דיברנו, מחכה לאישור שותף' && l.type === 'call' && l.user === SH), `התיעוד נשמר ביומן הליד: ${JSON.stringify(logs.slice(-1))}`);
  T.check(cust('A').followUpDate === '2026-11-03', `תזכורת הבאה בעוד 3 ימים (שלישי 3.11): ${cust('A').followUpDate}`);

  T.describe('4. שיוך ליד חדש אליי');
  await T.click(rowFor('ליד מהאתר').querySelector('[data-testid="myday-claim"]'));
  await T.flush(4);
  T.check(cust('N').assignedTo === SH, `הליד שויך לשחף: ${cust('N').assignedTo}`);

  T.describe('5. מתג "של השותף"');
  await T.click(T.byId('myday-scope-partner'));
  T.check(T.byId('myday-scope-partner').textContent.includes('דניאל'), 'המתג נקרא בשם השותף');
  T.check(T.text().includes('בר של דניאל') && !T.text().includes('בר חם'), 'מוצגים רק הלידים של דניאל');
  await T.click(T.byId('myday-scope-mine'));

  T.describe('6. מעבר לניתוח מכירות');
  await T.click(T.byId('myday-go-analytics'));
  await T.flush(6);
  T.check(!!T.byId('sales-analytics') && T.byId('finance-view-analytics')?.getAttribute('aria-pressed') === 'true', 'נפתח טאב הכספים בתצוגת ניתוח מכירות');
  const v = (id) => T.byId(id)?.textContent.trim();
  // ברירת מחדל: מוצרי מלאי בלבד (31.10.2026) — הקסטום לא מעוות את הממוצעים
  T.check(T.byId('analytics-seg-stock')?.getAttribute('aria-pressed') === 'true', 'ברירת מחדל: מוצרי מלאי');
  T.check(v('an-count') === '1' && T.amountShown(9500, T.byId('an-revenue')), `מלאי: מכירה אחת, 9,500: ${v('an-count')} ${v('an-revenue')}`);
  T.check(T.amountShown(5000, T.byId('an-profit')) && v('an-margin') === '53%', `מלאי: רווח 5,000 (בלי 3,000 שיווק), מרווח 53%: ${v('an-profit')} ${v('an-margin')}`);
  T.check(T.amountShown(9500, T.byId('an-avg-deal')) && T.amountShown(5000, T.byId('an-profit-unit')), 'מלאי: ממוצע לעסקה 9,500, רווח לעמדה 5,000');
  T.check(T.byId('an-models')?.textContent.includes('Prime') && !T.byId('an-models').textContent.includes('פרויקט קסטום'), 'טבלת דגמים במלאי — בלי קסטום');
  T.check(!T.byId('an-kind-custom'), 'השוואת מלאי/קסטום מוצגת רק ב"הכול"');

  await T.click(T.byId('analytics-seg-custom'));
  T.check(v('an-count') === '1' && T.amountShown(12000, T.byId('an-revenue')) && T.amountShown(5000, T.byId('an-profit')), `קסטום: עסקה אחת 12,000, רווח 5,000: ${v('an-revenue')} ${v('an-profit')}`);
  T.check(T.byId('an-models')?.textContent.includes('פרויקט קסטום') && !T.byId('an-models').textContent.includes('Prime'), 'טבלה בקסטום — רק קסטום');

  await T.click(T.byId('analytics-seg-all'));
  T.check(v('an-count') === '2' && T.amountShown(21500, T.byId('an-revenue')) && T.amountShown(10000, T.byId('an-profit')), `הכול: 2 מכירות, 21,500, רווח 10,000: ${v('an-count')} ${v('an-revenue')}`);
  T.check(v('an-avg-deal')?.includes('₪9,500') && v('an-avg-deal')?.includes('₪12,000'), `הכול: ממוצע לעסקה בנפרד למלאי ולקסטום, לא מספר מעורבב: ${v('an-avg-deal')}`);
  T.check(v('an-margin')?.includes('53%') && v('an-margin')?.includes('42%'), `הכול: מרווח בנפרד: ${v('an-margin')}`);
  T.check(T.byId('an-kind-custom')?.textContent.includes('1 עסקאות'), 'השוואת מלאי מול קסטום');
  T.check(T.byId('an-pipeline')?.textContent.includes('ממתינות מעל 14 יום') && T.amountShown(18000, T.byId('an-pipeline')), 'הצעות פתוחות: 18,000');
  T.check(T.byId('an-conv-source')?.textContent.includes('אתר') && T.byId('an-conv-source').textContent.includes('פייסבוק'), 'המרה לפי מקור');
  T.check(!!T.byId('an-chart-avg') && !!T.byId('an-chart-profit'), 'שני הגרפים מוצגים');
  T.check(!!T.byId('an-models')?.className.includes('table-fixed'), 'טבלת הדגמים ברוחב קבוע (בלי גלילה הצידה)');

  T.describe('7. התזרים הקיים לא נפגע');
  await T.click(T.byId('finance-view-cashflow'));
  T.check(!!T.byId('finance-month-income') && !T.byId('sales-analytics'), 'מתג לתזרים החודשי');

  T.describe('8. ליד מפייסבוק שנפתח לו כרטיס חדש במכירה — חלון "כבר קיים כרטיס"');
  await T.click(T.byId('space-sales'));
  await T.nav('leads');
  const before = Object.keys(T.docs('crm_customers')).length;
  await T.click(T.byId('lead-new'));
  let form = document.getElementById('customerForm');
  await T.type(T.$('input[placeholder="לדוגמה: הבר של משה"]', form), 'בר חם בע"מ');
  await T.type(T.$('input[placeholder="050-0000000"]', form), '+972-50-100-0003'); // הטלפון של "בר חם" (H) בפורמט אחר
  T.answerConfirms(true);
  await T.submit(form);
  await T.flush(4);
  T.check(T.lastConfirm().includes('כבר קיים כרטיס עם הטלפון הזה') && T.lastConfirm().includes('פייסבוק'), `נשאל לפני פתיחת כרטיס כפול, עם המקור: ${T.lastConfirm().slice(0, 80)}`);
  T.check(Object.keys(T.docs('crm_customers')).length === before, 'אישור — לא נוצר כרטיס חדש');
  T.check(cust('H').businessName === 'בר חם בע"מ' && cust('H').source === 'facebook' && cust('H').assignedTo === SH, `הכרטיס הקיים עודכן, המקור והנציג נשמרו: ${cust('H').businessName} ${cust('H').source}`);
  T.check((cust('H').interactionLogs || []).some(l => l.type === 'system' && l.text.includes('במקום כרטיס כפול')), 'נרשם ביומן');

  await T.click(T.byId('lead-new'));
  form = document.getElementById('customerForm');
  await T.type(T.$('input[placeholder="לדוגמה: הבר של משה"]', form), 'סניף 2');
  await T.type(T.$('input[placeholder="050-0000000"]', form), '0501000003');
  await T.select(T.byId('customer-source'), 'other');
  T.answerConfirms(false);
  await T.submit(form);
  await T.flush(4);
  const branch = T.docsWhere('crm_customers', c => c.businessName === 'סניף 2')[0];
  T.check(!!branch && branch.possibleDuplicateOfId === 'H' && branch.source === 'other', `ביטול — נוצר כרטיס חדש, מסומן ככפילות אפשרית, עם המקור שנבחר: ${JSON.stringify({ d: branch?.possibleDuplicateOfId, s: branch?.source })}`);

  T.describe('9. "היום שלי": ליד שכבר קנה עובר ל"כבר לקוחות" ונסגר ככפילות');
  // ליד מפייסבוק שהמכירה נרשמה על כרטיס לקוח אחר (CW — אותו טלפון)
  await T.api().setDoc(T.api().doc(null, 'crm_customers', 'FBX'), { status: 'lead', leadStage: 'new', businessName: 'ליד ישן של לקוח המלאי', phone: '0501000007', source: 'facebook', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-25T08:00:00.000Z' });
  await T.flush(4);
  await T.nav('sales_dashboard');
  T.check(T.byId('myday-merge')?.textContent.includes('ליד ישן של לקוח המלאי') && T.byId('myday-merge').textContent.includes('לקוח מלאי'), 'מופיע ב"כבר לקוחות" עם שם כרטיס הלקוח');
  T.check(!T.byId('myday-fresh')?.textContent.includes('ליד ישן של לקוח המלאי'), 'ולא ב"חדשים"');
  T.answerConfirms(true);
  await T.click(T.byId('myday-merge').querySelector('[data-testid="myday-dedupe"]'));
  await T.flush(6);
  T.check(cust('FBX').leadStage === 'not_relevant' && cust('FBX').duplicateOfCustomerId === 'CW', `הליד בארכיון עם הפניה לכרטיס: ${cust('FBX').leadStage} ${cust('FBX').duplicateOfCustomerId}`);
  T.check((cust('FBX').interactionLogs || []).some(l => l.text.includes('נסגר ככפילות')), 'נרשם ביומן הליד');
  T.check(cust('CW').source === 'website', `לכרטיס הלקוח כבר היה מקור — לא נדרס: ${cust('CW').source}`);
  T.check(!T.byId('myday-merge'), 'הרשימה התרוקנה');

  T.finish();
})().catch(T.crash);
