// שינוי הזמנה מאושרת (החלפת דגם), מקדמה בהצעה רגילה, וחסימת מחיקה של הצעה מאושרת.
// התרחיש האמיתי (3.11.2026): הצעה מאושרת עם Night + Prime שנגרעו מהמלאי, נלקחה מקדמה,
// והלקוח מבקש Prime נוסף במקום ה-Night.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

T.freezeTime('2026-11-03T08:00:00.000Z');

// Morning מדומה: מקליט כל מסמך שנשלח ומחזיר קישור.
const morningCalls = [];
globalThis.fetch = window.fetch = async (url, opts) => {
  T.ui.fetches.push({ url: String(url), opts });
  if (String(url).includes('morning-proxy')) {
    morningCalls.push(JSON.parse(opts.body).body);
    const payload = { status: 1, data: `https://morning.test/doc/${morningCalls.length}` };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload };
  }
  return { ok: false, status: 503, text: async () => 'network disabled in tests', json: async () => ({}) };
};

const item = (model, modelId, extra = {}) => ({ model, modelId, status: 'in_warehouse', factoryUnitCostUSD: 1000, createdAt: '2026-09-01T10:00:00.000Z', shipmentId: '', ...extra });
const soldTo = (cust) => ({ status: 'sold', customerId: cust, saleDate: '2026-11-01', salePrice: 9000, discountAmount: 500, awaitingDelivery: true, warrantyStartDate: null });

T.seed({
  crm_settings: { general_settings: { models: {
    Prime: { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: '', deliveryDescription: '' },
    Night: { id: 'm_night', cbm: 1, listPrice: 7800, videoUrl: '', supplierId: '', deliveryDescription: '' },
  }, morningApiKeyId: 'kid', morningApiKeySecret: 'ksecret' } },
  crm_items: {
    // הזמנה QA: נמכרו P1 + N1 ללקוח C1
    P1: item('Prime', 'm_prime', soldTo('C1')),
    N1: item('Night', 'm_night', { ...soldTo('C1'), salePrice: 7800, discountAmount: 0 }),
    P2: item('Prime', 'm_prime'),
    P3: item('Prime', 'm_prime'),
    // הזמנה QD: נמכרה P9 ללקוח C2 (לבדיקת מחיקה)
    P9: item('Prime', 'm_prime', soldTo('C2')),
  },
  crm_customers: {
    C1: { status: 'active', previousStatusBeforeActive: 'lead', businessName: 'בר השינוי', contactName: 'דנה', phone: '0521111111', city: 'חיפה', interactionLogs: [], createdAt: '2026-10-01T10:00:00.000Z' },
    C2: { status: 'active', businessName: 'בר המחיקה', contactName: 'גיל', phone: '0522222222', interactionLogs: [], createdAt: '2026-10-01T10:00:00.000Z' },
  },
  crm_quotes: {
    QA: {
      customerId: 'C1', date: '2026-11-01', status: 'approved', createdAt: '2026-11-01T09:00:00.000Z',
      items: [
        { model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 500, finalPrice: 9000, price: 9000, customNotes: '' },
        { model: 'Night', modelId: 'm_night', qty: 1, listPrice: 7800, discount: 0, finalPrice: 7800, price: 7800, customNotes: '' },
      ],
      shippingCost: 400, warrantyMonths: 12, campaignId: '',
      approvedAt: '2026-11-01T10:00:00.000Z', approvedItemIds: ['P1', 'N1'], approvedShippingCost: 400,
      previousCustomerStatus: 'lead', morningInvoiceUrl: 'https://morning.test/old-QA',
    },
    QD: {
      customerId: 'C2', date: '2026-11-01', status: 'approved', createdAt: '2026-11-01T09:00:00.000Z',
      items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 500, finalPrice: 9000, price: 9000, customNotes: '' }],
      shippingCost: 0, warrantyMonths: 12, campaignId: '', approvedItemIds: ['P9'], previousCustomerStatus: 'lead',
    },
  },
  crm_customer_deliveries: {
    DA: { quoteId: 'QA', customerId: 'C1', itemIds: ['P1', 'N1'], lines: [{ model: 'Prime', qty: 1 }, { model: 'Night', qty: 1 }], deliveryMethod: 'delivery', shippingTiming: 'scheduled', shippingDate: '2026-11-10', deliveryCity: 'חיפה', deliveryCost: 400, deliveryStatus: 'awaiting', deliveredAt: null, createdAt: '2026-11-01T10:00:00.000Z' },
    DD: { quoteId: 'QD', customerId: 'C2', itemIds: ['P9'], lines: [{ model: 'Prime', qty: 1 }], deliveryMethod: 'pickup', deliveryStatus: 'awaiting', deliveredAt: null, createdAt: '2026-11-01T10:00:00.000Z' },
  },
});
T.setNav('sales', 'quotes');

(async () => {
  await T.mountApp(App);

  // ───────────── 1. מחיקת הצעה מאושרת ─────────────
  T.describe('1. מחיקת הצעה מאושרת עם גריעת מלאי — נחסמת');
  T.answerConfirms(true);
  const alertsBefore1 = T.ui.alerts.length;
  await T.click(T.byId('quote-delete-QD'));
  T.check(!!T.docs('crm_quotes').QD, 'הצעה מאושרת נמחקה — היחידה נשארת "נמכרה" ללקוח בלי הצעה');
  T.check(T.docs('crm_items').P9.status === 'sold' && T.docs('crm_items').P9.customerId === 'C2', 'מצב היחידה השתנה');
  T.check(T.ui.alerts.slice(alertsBefore1).some(a => a.includes('בטל קודם את האישור')), 'לא הוסבר איך מוחקים הצעה מאושרת');

  // ───────────── 2. פתיחת שינוי הזמנה ─────────────
  T.describe('2. שינוי הזמנה: Prime במקום Night, עם מקדמה — נשמר כטיוטה בלי לגעת במלאי');
  const quoteModal = () => T.modalWithTitle('מחולל הצעת מחיר');
  const itemsSnapshot = () => JSON.stringify(Object.entries(T.docs('crm_items')).map(([id, i]) => [id, i.status, i.customerId || '']));
  const before2 = itemsSnapshot();
  await T.click(T.byId('quote-change-QA'));
  T.check(!!quoteModal(), 'מחולל ההצעות לא נפתח לשינוי הזמנה');
  T.check(!!T.byId('quote-change-banner', quoteModal()) && !T.byId('customer-combobox-input', quoteModal()), 'בשינוי הזמנה הלקוח צריך להיות נעול ולהופיע הסבר');
  const nightSelect = T.$$('select', quoteModal()).find(sel => sel.value === 'Night');
  T.check(!!nightSelect, 'שורת ה-Night לא הועתקה למחולל');
  await T.select(nightSelect, 'Prime');
  await T.type(T.byId('quote-deposit', quoteModal()), 2000);
  await T.click(T.byId('quote-save'));
  const drafts = T.docsWhere('crm_quotes', q => q.replacesQuoteId === 'QA');
  T.check(drafts.length === 1, `צפויה טיוטת שינוי אחת, נמצאו ${drafts.length}`);
  const NQ = drafts[0] || {};
  T.check(NQ.status === 'pending' && NQ.customerId === 'C1', `שדות טיוטת השינוי שגויים: ${JSON.stringify({ s: NQ.status, c: NQ.customerId })}`);
  // ברירת מחדל: המקדמה כוללת מע"מ (הסכום שבקבלה). לפני מע"מ בשתי ספרות — לא מעוגל לשקל.
  T.check(NQ.depositInput === 2000 && NQ.depositInclVat === true && NQ.depositAmount === 1694.92, `שדות המקדמה שגויים: ${JSON.stringify({ i: NQ.depositInput, v: NQ.depositInclVat, a: NQ.depositAmount })}`);
  T.check(NQ.items?.length === 2 && NQ.items.every(it => it.model === 'Prime' && it.modelId === 'm_prime'), `השורות בטיוטה צריכות להיות 2 Prime: ${JSON.stringify(NQ.items?.map(i => i.model))}`);
  T.check(Number(NQ.items?.[0]?.discount) === 500 && Number(NQ.items?.[1]?.listPrice) === 9500, 'ההנחה בשורה הקיימת אבדה / מחיר ה-Prime החדש שגוי');
  T.check(T.docs('crm_quotes').QA.status === 'approved' && itemsSnapshot() === before2, 'שמירת הטיוטה שינתה את ההזמנה המקורית או את המלאי');
  T.check(!!T.byId(`quote-change-draft-${NQ.id}`), 'הטיוטה לא מסומנת "שינוי להזמנה" ברשימה');

  T.describe('3. שינוי שני לאותה הזמנה כשיש טיוטה פתוחה — נחסם');
  const alertsBefore3 = T.ui.alerts.length;
  await T.click(T.byId('quote-change-QA'));
  T.check(!quoteModal() && T.ui.alerts.slice(alertsBefore3).some(a => a.includes('כבר קיימת טיוטת שינוי')), 'נפתחה טיוטת שינוי שנייה לאותה הזמנה');

  // ───────────── 4. אישור השינוי ─────────────
  T.describe('4. אישור טיוטת השינוי: החלפה אטומית');
  await T.selectAction(T.byId(`quote-status-${NQ.id}`), 'approved');
  const approvalModal = () => T.byId('quote-approve-submit')?.closest('.fixed');
  T.check(!!approvalModal() && !!T.byId('quote-approve-swap-note', approvalModal()), 'חלון האישור לא הסביר שזו החלפת הזמנה');
  const cityInput = T.$$('input', approvalModal()).find(i => (i.placeholder || '').includes('עיר'));
  T.check(!cityInput || cityInput.value === 'חיפה', `עיר ההובלה לא נלקחה מההזמנה המקורית: ${cityInput?.value}`);
  const alertsBefore4 = T.ui.alerts.length;
  await T.click(T.byId('quote-approve-submit'));
  const NQa = T.docs('crm_quotes')[NQ.id];
  const newIds = NQa.approvedItemIds || [];
  T.check(NQa.status === 'approved' && newIds.length === 2 && new Set(newIds).size === 2, `ההצעה החדשה לא אושרה עם 2 יחידות: ${JSON.stringify({ s: NQa.status, ids: newIds })}`);
  T.check(newIds.includes('P1'), 'יחידת ה-Prime שכבר הייתה בהזמנה לא נשארה בה (הוחלפה ביחידה אחרת בלי צורך)');
  T.check(newIds.every(id => T.docs('crm_items')[id].model === 'Prime' && T.docs('crm_items')[id].status === 'sold' && T.docs('crm_items')[id].customerId === 'C1'), 'היחידות החדשות לא סומנו כנמכרות ללקוח');
  const N1 = T.docs('crm_items').N1;
  T.check(N1.status === 'in_warehouse' && !N1.customerId && !Number(N1.salePrice) && !Number(N1.discountAmount) && N1.awaitingDelivery === false, `ה-Night לא חזר נקי למלאי: ${JSON.stringify(N1)}`);
  const added = newIds.find(id => id !== 'P1');
  T.check(Number(T.docs('crm_items')[added]?.salePrice) === 9500, `מחיר המכירה של ה-Prime שנוסף צריך להיות 9,500: ${T.docs('crm_items')[added]?.salePrice}`);
  const QAr = T.docs('crm_quotes').QA;
  T.check(QAr.status === 'replaced' && QAr.replacedByQuoteId === NQ.id && (QAr.approvedItemIds || []).length === 0 && JSON.stringify(QAr.approvedItemIdsBeforeReplace) === JSON.stringify(['P1', 'N1']), `ההזמנה המקורית לא סומנה "הוחלפה" כראוי: ${JSON.stringify(QAr)}`);
  T.check(!T.docs('crm_customer_deliveries').DA, 'ההובלה של ההזמנה המקורית לא נמחקה (הובלת רפאים)');
  const newDel = T.docsWhere('crm_customer_deliveries', d => d.quoteId === NQ.id);
  T.check(newDel.length === 1 && JSON.stringify(newDel[0].itemIds) === JSON.stringify(newIds) && newDel[0].deliveryCity === 'חיפה' && newDel[0].shippingTiming === 'scheduled' && newDel[0].shippingDate === '2026-11-10', `ההובלה החדשה לא שמרה את פרטי ההובלה המקוריים: ${JSON.stringify(newDel[0])}`);
  T.check(T.docs('crm_customers').C1.status === 'active' && T.docs('crm_customers').C1.previousStatusBeforeActive === 'lead' && NQa.previousCustomerStatus === 'lead', 'הסטטוס הקודם של הלקוח נדרס ב"פעיל"');
  T.check(morningCalls.length === 1, `צפוי מסמך Morning אחד, נשלחו ${morningCalls.length}`);
  const inc = morningCalls[0]?.income || [];
  T.check(inc.some(r => r.description.includes('מקדמה') && r.price === -2000 && r.vatType === 1) && inc.filter(r => r.description.includes('Prime')).length === 2 && inc.some(r => r.description === 'הובלה' && r.price === 400), `שורות Morning שגויות: ${JSON.stringify(inc)}`);
  T.check(T.ui.alerts.slice(alertsBefore4).some(a => a.includes('לבטל ידנית') && a.includes('https://morning.test/old-QA')), 'לא הוזכר לבטל ב-Morning את דרישת התשלום הקודמת');

  T.describe('5. ההזמנה שהוחלפה — היסטוריה בלבד');
  T.check(!!T.byId('quote-replaced-QA') && !T.byId('quote-status-QA') && !T.byId('quote-change-QA'), 'הזמנה שהוחלפה עדיין ניתנת לשינוי סטטוס / לשינוי הזמנה');
  T.answerConfirms(true);
  await T.click(T.byId('quote-delete-QA'));
  T.check(!!T.docs('crm_quotes').QA, 'הזמנה שהוחלפה נמחקה');

  T.describe('6. ביטול אישור של ההזמנה המשונה — הלקוח חוזר לסטטוס שלפני ההזמנה המקורית');
  T.answerConfirms(true);
  await T.selectAction(T.byId(`quote-status-${NQ.id}`), 'pending');
  T.check(newIds.every(id => T.docs('crm_items')[id].status === 'in_warehouse'), 'היחידות לא חזרו למלאי בביטול');
  T.check(T.docs('crm_customers').C1.status === 'lead', `הלקוח צריך לחזור ל"ליד" (הסטטוס שלפני ההזמנה המקורית): ${T.docs('crm_customers').C1.status}`);
  T.check(T.docs('crm_quotes').QA.status === 'replaced', 'ההזמנה המקורית חזרה לחיים בביטול');

  // ───────────── 7. שינוי כשכבר יצאה תעודה ─────────────
  T.describe('7. שינוי הזמנה אחרי הנפקת תעודת משלוח — נחסם');
  await T.act(async () => { await T.api().updateDoc(T.api().doc(null, 'crm_customer_deliveries', 'DD'), { deliveryNoteNumber: 7 }); });
  await T.flush(4);
  const alertsBefore7 = T.ui.alerts.length;
  await T.click(T.byId('quote-change-QD'));
  T.check(!quoteModal() && T.ui.alerts.slice(alertsBefore7).some(a => a.includes('00007')), 'שינוי הזמנה נפתח למרות שהונפקה תעודה ממוספרת');

  // ───────────── 8. מקדמה גבוהה מההזמנה ─────────────
  T.describe('8. מקדמה גבוהה מסכום ההזמנה — לא נשמרת');
  await T.click(T.byId('quote-new'));
  const custInput = T.byId('customer-combobox-input', quoteModal());
  await T.focus(custInput);
  await T.type(custInput, 'בר המחיקה');
  const opt = T.$$('div', quoteModal()).find(d => d.children.length === 0 && d.textContent.includes('בר המחיקה'));
  await T.mouseDown(opt);
  await T.type(T.byId('quote-deposit', quoteModal()), 99999);
  const countBefore8 = Object.keys(T.docs('crm_quotes')).length;
  const alertsBefore8 = T.ui.alerts.length;
  await T.click(T.byId('quote-save'));
  T.check(Object.keys(T.docs('crm_quotes')).length === countBefore8 && T.ui.alerts.slice(alertsBefore8).some(a => a.includes('המקדמה גבוה')), 'הצעה עם מקדמה גבוהה מסכום ההזמנה נשמרה');

  // ───────────── 9. מקדמה לפני מע"מ, עם אגורות ─────────────
  T.describe('9. מקדמה שהוזנה לפני מע"מ, עם אגורות');
  await T.click(T.byId('quote-new'));
  const ci = T.byId('customer-combobox-input', quoteModal());
  await T.focus(ci);
  await T.type(ci, 'בר המחיקה');
  await T.mouseDown(T.$$('div', quoteModal()).find(d => d.children.length === 0 && d.textContent.includes('בר המחיקה')));
  await T.type(T.byId('quote-deposit', quoteModal()), 1000.5);
  await T.click(T.byId('quote-deposit-incl-vat', quoteModal()));
  T.check(T.text(T.byId('quote-deposit-breakdown', quoteModal())).includes('1,180.59'), `הפירוט לא מציג 1,000.50 × 1.18 = 1,180.59: ${T.text(T.byId('quote-deposit-breakdown', quoteModal()))}`);

  T.describe('10. כותרת ההצעה: שם משפטי, ח.פ, מחסן, טלפונים ומייל');
  const hdr = T.text(T.byId('quote-company-header', quoteModal()));
  T.check(['סטיל אנד ספיריט בע"מ', 'ח.פ 517356077', 'מחסן: אפעל 11, פתח תקווה', '050-2212880', '054-8050870', 'sales@steelandspirit.com'].every(x => hdr.includes(x)), `כותרת ההצעה חסרה פרטים: ${hdr}`);

  const keysBefore9 = Object.keys(T.docs('crm_quotes'));
  await T.click(T.byId('quote-save'));
  const q9id = Object.keys(T.docs('crm_quotes')).find(k => !keysBefore9.includes(k));
  const q9 = q9id ? T.docs('crm_quotes')[q9id] : {};
  T.check(q9.depositInput === 1000.5 && q9.depositInclVat === false && q9.depositAmount === 1000.5, `מקדמה לפני מע"מ לא נשמרה כפי שהוזנה: ${JSON.stringify({ i: q9.depositInput, v: q9.depositInclVat, a: q9.depositAmount })}`);

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
