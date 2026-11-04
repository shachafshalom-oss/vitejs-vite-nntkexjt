// מסמכי Morning בהצעה רגילה (4.11.2026): מקדמה באישור ויתרה ביציאה מהמחסן, שליחה חוזרת,
// הפקה מחדש עם היסטוריה, ותיקון "שלח שוב" שלא ניכה את המקדמה.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

T.freezeTime('2026-11-04T08:00:00.000Z');

// Morning מדומה: מקליט כל מסמך שנשלח ומחזיר קישור (או שגיאה כש-morningFail=true)
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

const pline = { model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 500, finalPrice: 9000, price: 9000, customNotes: '' };
T.seed({
  crm_settings: { general_settings: { models: {
    Prime: { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: '', deliveryDescription: '' },
  }, morningApiKeyId: 'kid', morningApiKeySecret: 'ksecret' } },
  crm_items: {
    R1: { model: 'Prime', modelId: 'm_prime', status: 'sold', customerId: 'CR', source: 'local', shipmentId: '', salePrice: 9000, factoryUnitCostUSD: 900, createdAt: '2026-09-01T10:00:00.000Z' },
    P1: { model: 'Prime', modelId: 'm_prime', status: 'in_warehouse', source: 'local', shipmentId: '', factoryUnitCostUSD: 900, createdAt: '2026-09-02T10:00:00.000Z' },
  },
  crm_customers: {
    CR: { status: 'active', businessName: 'בר הניסיון החוזר', contactName: 'נועה', phone: '0524444444', interactionLogs: [], createdAt: '2026-10-01T10:00:00.000Z' },
    CD: { status: 'lead', leadStage: 'quote_sent', businessName: 'בר המקדמה', contactName: 'אלון', phone: '0525555555', city: 'חיפה', interactionLogs: [], createdAt: '2026-10-01T10:00:00.000Z' },
  },
  crm_quotes: {
    // אושרה, השליחה ל-Morning נכשלה; הלקוח כבר שילם מקדמה 1,180 כולל מע"מ (= 1,000 לפני)
    QR: { customerId: 'CR', date: '2026-11-03', status: 'approved', items: [pline], shippingCost: 400, approvedShippingCost: 400, warrantyMonths: 12, campaignId: '',
          approvedItemIds: ['R1'], previousCustomerStatus: 'lead', depositInput: 1180, depositInclVat: true, depositAmount: 1000, morningError: 'timeout', createdAt: '2026-11-03T09:00:00.000Z' },
    QD: { customerId: 'CD', date: '2026-11-04', status: 'pending', items: [pline], shippingCost: 400, warrantyMonths: 12, campaignId: '', createdAt: '2026-11-04T07:00:00.000Z' },
  },
});
T.setNav('sales', 'customers');

const rowOf = (name) => T.allById('customer-row').find(r => r.textContent.includes(name));

(async () => {
  await T.mountApp(App);

  T.describe('1. "שלח שוב ל-Morning" אחרי כשל — מנכה את המקדמה שנרשמה');
  await T.click(rowOf('בר הניסיון החוזר'));
  await T.click(T.byId('customer-tab-quotes'));
  await T.click(T.byId('morning-retry-QR'));
  const inc1 = morningCalls[0]?.income || [];
  T.check(morningCalls.length === 1, `צפוי מסמך אחד ל-Morning, נשלחו ${morningCalls.length}`);
  T.check(inc1.some(r => r.description.includes('מקדמה') && r.price === -1000), `"שלח שוב" לא ניכה את המקדמה: ${JSON.stringify(inc1)}`);
  T.check(inc1.some(r => r.description === 'הובלה' && r.price === 400) && inc1.some(r => r.description.includes('Prime') && r.price === 9000), `שורות המסמך שגויות: ${JSON.stringify(inc1)}`);

  T.check(!T.byId('morning-retry-QR'), 'אחרי שליחה מוצלחת עדיין מוצג "שלח שוב" (יוביל למסמך כפול)');
  T.check(T.docs('crm_quotes').QR.morningDocs?.length === 1 && T.docs('crm_quotes').QR.morningDocs[0].kind === 'final' && T.docs('crm_quotes').QR.morningDocs[0].amountPreVat === 8400, `המסמך לא נשמר בהיסטוריה: ${JSON.stringify(T.docs('crm_quotes').QR.morningDocs)}`);

  // ───────────── 2. אישור עם "מקדמה עכשיו" ─────────────
  T.describe('2. אישור: מקדמה עכשיו (2,360 כולל מע"מ), יתרה ביציאה מהמחסן');
  await T.nav('quotes');
  await T.selectAction(T.byId('quote-status-QD'), 'approved');
  const appr = T.byId('quote-approve-submit')?.closest('.fixed');
  T.check(!!appr && T.byId('approve-pay-full', appr)?.checked === true, 'ברירת המחדל בחלון האישור צריכה להיות "מלא עכשיו"');
  await T.click(T.byId('approve-pay-deposit', appr));
  await T.type(T.byId('approve-deposit-amount', appr), 2360);
  await T.click(T.byId('quote-approve-submit'));
  const QD = T.docs('crm_quotes').QD;
  T.check(QD.status === 'approved' && QD.paymentPlan === 'deposit_then_balance' && QD.depositInput === 2360 && QD.depositInclVat === true && QD.depositAmount === 2000, `פרטי התשלום לא נשמרו: ${JSON.stringify({ s: QD.status, p: QD.paymentPlan, i: QD.depositInput, a: QD.depositAmount })}`);
  const inc2 = morningCalls[1]?.income || [];
  T.check(morningCalls.length === 2 && inc2.length === 1 && inc2[0].price === 2000 && inc2[0].description.includes('מקדמה'), `דרישת המקדמה שגויה: ${JSON.stringify(inc2)}`);
  T.check(QD.morningDocs?.length === 1 && QD.morningDocs[0].kind === 'deposit' && !QD.morningInvoiceUrl, 'מסמך המקדמה לא נשמר / נרשם כדרישה סופית');

  // ───────────── 3. יתרה בהפקת תעודת המשלוח ─────────────
  T.describe('3. הובלה: "יתרה לגבייה", ודרישת יתרה בהפקת תעודת המשלוח');
  await T.nav('customer_deliveries');
  const D = T.docsWhere('crm_customer_deliveries', d => d.quoteId === 'QD')[0];
  T.check(!!D && T.text(T.byId(`delivery-balance-due-${D.id}`)).includes('8,732'), `תגית היתרה חסרה / סכום שגוי (צפוי (9,400−2,000)×1.18 = 8,732): ${T.text(T.byId(`delivery-balance-due-${D?.id}`))}`);
  T.answerConfirms(true);
  await T.click(T.byId(`delivery-note-${D.id}`));
  await T.sleep(450);
  const inc3 = morningCalls[2]?.income || [];
  T.check(T.ui.confirms.some(c => c.includes('דרישת היתרה') && c.includes('7,400')), 'לא נשאלתי אם לשלוח דרישת יתרה בהפקת התעודה');
  T.check(morningCalls.length === 3 && inc3.some(r => r.price === -2000) && inc3.some(r => r.price === 9000) && inc3.some(r => r.price === 400), `דרישת היתרה שגויה: ${JSON.stringify(inc3)}`);
  T.check(T.docs('crm_customer_deliveries')[D.id].deliveryNoteNumber === 1, 'תעודת המשלוח לא הופקה אחרי שליחת היתרה');
  T.check(T.docs('crm_quotes').QD.morningInvoiceUrl === 'https://morning.test/doc/3' && !T.byId(`delivery-balance-due-${D.id}`), 'אחרי שליחת היתרה התגית עדיין מוצגת / הקישור לא נשמר');

  // ───────────── 4. שליחה חוזרת ללקוח ─────────────
  T.describe('4. שליחה חוזרת של מסמך קיים — בלי מסמך חדש');
  await T.nav('customers');
  await T.click(rowOf('בר המקדמה'));
  await T.click(T.byId('customer-tab-quotes'));
  const callsBefore4 = morningCalls.length;
  await T.click(T.byId('morning-share-QD-1'));
  const opened = T.ui.opened.map(String).join(' ');
  T.check(opened.includes('wa.me/972525555555') && opened.includes(encodeURIComponent('https://morning.test/doc/3')), `וואטסאפ לא נפתח עם הקישור הקיים: ${opened}`);
  await T.click(T.byId('morning-copy-QD-0'));
  // ב-jsdom אין גישה ל-clipboard של הדפדפן — אז נבדק גם המסלול החלופי (הקישור מוצג להעתקה ידנית)
  T.check(T.ui.clipboard.includes('https://morning.test/doc/2') || T.lastAlert() === 'https://morning.test/doc/2', `הקישור לא הועתק ולא הוצג: ${JSON.stringify(T.ui.clipboard)} / ${T.lastAlert()}`);
  T.check(morningCalls.length === callsBefore4, 'שליחה חוזרת יצרה מסמך חדש ב-Morning');

  // ───────────── 5. הפקה מחדש ─────────────
  T.describe('5. הפקה מחדש: מסמך חדש, הקודם מסומן "הוחלף", תזכורת לחשבונית זיכוי');
  await T.click(T.byId('morning-reissue-QD-final'));
  T.check(!!T.byId('morning-doc-modal') && T.text(T.byId('morning-reissue-warning')).includes('חשבונית זיכוי'), 'חסרה אזהרת חשבונית הזיכוי בהפקה מחדש');
  await T.click(T.byId('morning-doc-send'));
  const QD5 = T.docs('crm_quotes').QD;
  T.check(morningCalls.length === 4 && QD5.morningDocs.length === 3, `צפוי מסמך חדש אחד: ${morningCalls.length} קריאות, ${QD5.morningDocs?.length} מסמכים`);
  T.check(!!QD5.morningDocs[1].replacedAt && !QD5.morningDocs[0].replacedAt && !QD5.morningDocs[2].replacedAt, 'סימון "הוחלף" שגוי (רק דרישת היתרה הקודמת צריכה להיות מוחלפת)');
  T.check(QD5.morningInvoiceUrl === 'https://morning.test/doc/4' && !!T.byId('morning-doc-replaced-QD-1'), 'הקישור הפעיל לא עודכן / הקודם לא מוצג כמוחלף');

  // ───────────── 6. כשל ─────────────
  T.describe('6. כשל ב-Morning בהפקה מחדש — לא נוגע בהיסטוריה');
  morningFail = true;
  await T.click(T.byId('morning-reissue-QD-deposit'));
  await T.click(T.byId('morning-doc-send'));
  const QD6 = T.docs('crm_quotes').QD;
  T.check(QD6.morningDocs.length === 3 && !QD6.morningDocs[0].replacedAt && QD6.morningError === 'שגיאת proxy: Morning לא זמין', `כשל שינה את ההיסטוריה: ${JSON.stringify(QD6.morningDocs.map(d => [d.kind, !!d.replacedAt]))} / ${QD6.morningError}`);
  T.check(!!T.byId('morning-doc-modal'), 'החלון נסגר למרות הכשל (אין דרך לנסות שוב)');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
