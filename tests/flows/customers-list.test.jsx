// לשונית הלקוחות כרשימה, פעולות מתוך תיק הלקוח, וחיפוש טלפון 0 / +972 — על הקוד האמיתי של App.tsx.
//
// החלטות שחף:
// - כל לקוח = שורה (שם מלא בלי חיתוך, סטטוס, טלפון לחיץ, רכישות והכנסה). בלי כפתורים בשורה —
//   לחיצה פותחת את התיק, וכל הפעולות (קטלוג, הצעת מחיר, עריכה, מחיקה) בתוך התיק.
// - "שלח קטלוג" בתיק — גם לליד וגם ללקוח.
// - מחיקת לקוח שיש לו יחידות / הצעות / הובלות / פרויקט קסטום נחסמת עם הסבר.
// - חיפוש טלפון מוצא את אותו אדם בין אם הוקלד 05… ובין אם +972…, בלקוחות ובלידים.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com';
T.freezeTime('2026-10-03T09:00:00.000Z');

const LONG_NAME = 'מסעדת הים התיכון הגדולה של חיפה והקריות';
T.seed({
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500, videoUrl: '' } } } },
  crm_items: {
    I1: { model: 'Prime', modelId: 'm_prime', status: 'sold', customerId: 'K1', salePrice: 9500, saleDate: '2026-09-01', factoryUnitCostUSD: 1000, createdAt: '2026-08-01T10:00:00.000Z', shipmentId: '' },
  },
  crm_quotes: {
    Q1: { customerId: 'K3', status: 'draft', date: '2026-09-15', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0, finalPrice: 9500, price: 9500, customNotes: '' }], shippingCost: 0, createdAt: '2026-09-15T10:00:00.000Z' },
  },
  crm_customers: {
    K1: { status: 'active', businessName: LONG_NAME, contactName: 'יוסי', phone: '+972548050870', assignedTo: SH, interactionLogs: [], createdAt: '2026-08-01T10:00:00.000Z' },
    K2: { status: 'active', businessName: 'בר ריק', companyName: 'חברת בדיקה בע"מ', contactName: 'רינה', phone: '0521234567', assignedTo: SH, interactionLogs: [], createdAt: '2026-08-02T10:00:00.000Z' },
    K3: { status: 'active', businessName: 'פאב עם הצעה', contactName: 'משה', phone: '0537777777', assignedTo: SH, interactionLogs: [], createdAt: '2026-08-03T10:00:00.000Z' },
    L1: { status: 'lead', leadStage: 'new', businessName: 'ליד מהאתר', phone: '+972541112233', assignedTo: SH, source: 'website', interactionLogs: [], createdAt: '2026-09-20T10:00:00.000Z' },
    L2: { status: 'lead', leadStage: 'contacted', businessName: 'ליד מקומי', phone: '0549998877', assignedTo: SH, interactionLogs: [{ date: '2026-09-21T10:00:00.000Z', text: 'שיחה', user: SH }], createdAt: '2026-09-21T10:00:00.000Z' },
  },
});
T.setNav('sales', 'customers');

const NAMES = { K1: LONG_NAME, K2: 'בר ריק', K3: 'פאב עם הצעה' };
const rows = () => T.allById('customer-row');
const rowOf = (k) => rows().find(r => r.textContent.includes(NAMES[k]));
const shownCustomers = () => Object.keys(NAMES).filter(k => !!rowOf(k)).join(',');
const leadShown = (name) => T.allById('lead-row').some(r => r.textContent.includes(name));
const searchBox = () => T.$$('input').find(i => (i.placeholder || '').startsWith('חיפוש לפי שם'));
const panel = () => T.byId('lead-panel-close')?.closest('.fixed');

(async () => {
  await T.mountApp(App);

  T.describe('1. רשימה במקום כרטיסים');
  T.check(T.allById('customer-card').length === 0, 'עדיין מוצגים כרטיסי לקוח מלאים');
  T.check(shownCustomers() === 'K1,K2,K3', `שורות לקוח: ${shownCustomers()}`);
  T.check(rows().every(r => r.querySelectorAll('button').length === 0), 'יש כפתורים בתוך שורת לקוח');
  T.check(!!rowOf('K1')?.querySelector('a[href^="tel:"]'), 'הטלפון בשורה לא לחיץ לחיוג');
  T.check(!rowOf('K1')?.querySelector('.truncate'), 'שם הלקוח בשורה נחתך (truncate)');
  T.check(/לקוח עבר \(אחריות פגה\)/.test(rowOf('K1')?.textContent || '') && /לקוח עבר/.test(rowOf('K2')?.textContent || ''), 'הסטטוס לא מוצג בשורה'); // K1: יחידה בלי אחריות → "אחריות פגה"
  T.check(/1\s*ברים/.test(rowOf('K1')?.textContent || ''), 'מספר הרכישות לא מוצג בשורה');

  T.describe('2. חיפוש טלפון — 0 מול +972');
  await T.type(searchBox(), '0548050');
  T.check(shownCustomers() === 'K1', `חיפוש 0548050 (שמור כ-+972548050870): ${shownCustomers()}`);
  await T.type(searchBox(), '8050870');
  T.check(shownCustomers() === 'K1', `חיפוש רצף מאמצע המספר: ${shownCustomers()}`);
  await T.type(searchBox(), '+972 52 123');
  T.check(shownCustomers() === 'K2', `חיפוש +972 52 123 (שמור כ-0521234567): ${shownCustomers()}`);
  await T.type(searchBox(), '050');
  T.check(shownCustomers() === '', `חיפוש 050 (קידומת) מצא מספרים שלא מתחילים ב-050: ${shownCustomers()}`);
  await T.type(searchBox(), '+972 5');
  T.check(shownCustomers() === '', `חיפוש "+972 5" (ספרה אחת אחרי הקידומת) מצא: ${shownCustomers()}`);
  await T.type(searchBox(), '052');
  T.check(shownCustomers() === 'K2', `חיפוש קידומת 052: ${shownCustomers()} (צפוי K2 בלבד)`);
  await T.type(searchBox(), 'יוסי');
  T.check(shownCustomers() === 'K1', `חיפוש לפי איש קשר: ${shownCustomers()}`);
  await T.type(searchBox(), 'חברת בדיקה');
  T.check(shownCustomers() === 'K2', `חיפוש לפי שם חברה: ${shownCustomers()}`);
  T.check(!T.text().includes('לא נמצאו תוצאות'), 'חיפוש לפי שם חברה מציג תוצאה וגם "לא נמצאו תוצאות"');
  await T.type(searchBox(), '');

  T.describe('3. תיק לקוח — הפעולות עברו פנימה');
  await T.click(rowOf('K1'));
  T.check(!!panel(), 'לחיצה על השורה לא פתחה את תיק הלקוח');
  T.check(!!T.byId('customer-panel-catalog') && !!T.byId('customer-panel-quote') && !!T.byId('customer-panel-delete') && !!T.byId('lead-panel-edit'),
    'חסר כפתור בתיק (קטלוג / הצעת מחיר / מחיקה / עריכה)');

  T.describe('4. שליחת קטלוג מתוך תיק לקוח');
  const openedBefore = T.ui.opened.length;
  await T.click(T.byId('customer-panel-catalog'));
  const sendBtn = T.buttonByText('שלח בWhatsApp');
  T.check(!!sendBtn, 'חלון שליחת הקטלוג לא נפתח מתוך התיק');
  if (sendBtn) await T.click(sendBtn);
  T.check(T.ui.opened.slice(openedBefore).some(u => u.includes('wa.me/972548050870')), `לא נפתח WhatsApp למספר הנכון: ${T.ui.opened.slice(openedBefore).join(' | ')}`);
  T.check((T.docs('crm_customers').K1.interactionLogs || []).some(l => l.type === 'catalog'), 'שליחת הקטלוג לא נרשמה ביומן הלקוח');
  T.check(T.docs('crm_customers').K1.status === 'active' && !T.docs('crm_customers').K1.leadStage, 'שליחת קטלוג ללקוח שינתה לו סטטוס/שלב');

  T.describe('5. מחיקה מוגנת');
  const alertsBefore = T.ui.alerts.length;
  T.answerConfirms(true);
  await T.click(T.byId('customer-panel-delete'));
  T.check(!!T.docs('crm_customers').K1, 'לקוח עם יחידה שנמכרה נמחק');
  T.check(T.ui.alerts.slice(alertsBefore).some(a => a.includes('לא ניתן למחוק')), 'לא הוצגה הודעה למה אי אפשר למחוק');
  T.ui.confirmAnswers.length = 0;
  await T.click(T.byId('lead-panel-close'));

  await T.click(rowOf('K3'));
  const alertsBefore3 = T.ui.alerts.length;
  T.answerConfirms(true);
  await T.click(T.byId('customer-panel-delete'));
  T.check(!!T.docs('crm_customers').K3, 'לקוח עם הצעת מחיר נמחק');
  T.check(T.ui.alerts.slice(alertsBefore3).some(a => a.includes('הצעות מחיר')), 'ההודעה לא מציינת את הצעות המחיר');
  T.ui.confirmAnswers.length = 0;

  T.describe('6. הצעת מחיר מתוך התיק');
  await T.click(T.byId('customer-panel-quote'));
  const quoteModal = T.modalWithTitle('מחולל הצעת מחיר');
  T.check(!!quoteModal, 'חלון הצעת המחיר לא נפתח');
  T.check(!panel(), 'התיק נשאר פתוח מעל חלון ההצעה');
  T.check((T.byId('customer-combobox-input', quoteModal || document)?.value || '').includes('פאב עם הצעה'), 'הלקוח לא נבחר מראש בהצעה');
  const closeQuote = quoteModal && T.$$('button', quoteModal).find(b => b.textContent.trim() === 'ביטול');
  if (closeQuote) await T.click(closeQuote);

  T.describe('7. מחיקת לקוח בלי היסטוריה');
  await T.click(rowOf('K2'));
  T.answerConfirms(true);
  await T.click(T.byId('customer-panel-delete'));
  T.check(!T.docs('crm_customers').K2, 'לקוח בלי היסטוריה לא נמחק');
  T.check(!T.ui.alerts.some(a => a.includes('כבר לא קיים')), 'מחיקה תקינה הציגה "הליד שהיה פתוח כבר לא קיים במערכת"');
  T.check(!panel(), 'התיק נשאר פתוח אחרי מחיקה');

  T.describe('8. לידים — חיפוש +972, שם בלי חיתוך, קטלוג בתיק, בלי מחיקה');
  await T.nav('leads');
  await T.type(searchBox(), '0541112');
  T.check(leadShown('ליד מהאתר') && !leadShown('ליד מקומי'), 'חיפוש 0541112 לא מצא ליד ששמור כ-+972541112233');
  await T.type(searchBox(), '');
  const leadRow = T.allById('lead-row').find(r => r.textContent.includes('ליד מקומי'));
  T.check(!!leadRow && !T.$$('p', leadRow).some(p => p.textContent.includes('ליד מקומי') && p.classList.contains('truncate')), 'שם הליד ברשימה נחתך (truncate)');
  await T.click(leadRow);
  T.check(!!T.byId('customer-panel-catalog'), 'אין כפתור שליחת קטלוג בתיק הליד');
  T.check(!!T.byId('customer-panel-quote'), 'אין כפתור הצעת מחיר בתיק הליד');
  T.check(!T.byId('customer-panel-delete'), 'כפתור מחיקה מוצג בתיק ליד (לידים עוברים לארכיון, לא נמחקים)');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
