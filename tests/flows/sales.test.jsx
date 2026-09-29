// תהליך מכירה מלא, על הקוד האמיתי של App.tsx:
// ליד חדש ← שלבים ותזכורות ← הערה ← עריכת פרטים ← הצעת מחיר ← אישור (גריעת מלאי) ←
// לקוח פעיל ← תעודת משלוח ← אישור הגעה ותחילת אחריות.
// בסוף — תרחישי קצה שחשפו באגים ידועים (מסומנים knownBug עד שיאושר תיקון).
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com';

// רביעי 7.10.2026, 01:30 בשעון ישראל (= שלישי 6.10 22:30 UTC). נבחר בכוונה סמוך לחצות.
T.freezeTime('2026-10-06T22:30:00.000Z');
const ISRAEL_TODAY = '2026-10-07';
const PLUS_3_BUSINESS_DAYS = '2026-10-12'; // חמישי 8 (1), שישי-שבת מדולגים, ראשון 11 (2), שני 12 (3)

T.seed({
  crm_settings: { general_settings: { models: {
    Prime: { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: '', deliveryDescription: 'עמדת בר' },
    Night: { id: 'm_night', cbm: 1, listPrice: 7800, videoUrl: '', supplierId: '', deliveryDescription: '' },
  } } },
  crm_items: {
    P1: { model: 'Prime', modelId: 'm_prime', status: 'in_warehouse', factoryUnitCostUSD: 1000, createdAt: '2026-09-01T10:00:00.000Z', shipmentId: '' },
    P2: { model: 'Prime', modelId: 'm_prime', status: 'in_warehouse', factoryUnitCostUSD: 1000, createdAt: '2026-09-02T10:00:00.000Z', shipmentId: '' },
    N1: { model: 'Night', modelId: 'm_night', status: 'in_warehouse', factoryUnitCostUSD: 800, createdAt: '2026-09-03T10:00:00.000Z', shipmentId: '' },
  },
  crm_customers: {
    C9: { status: 'active', businessName: 'מסעדת הוותיקים', contactName: 'רון', phone: '0539999999', assignedTo: SH, interactionLogs: [], createdAt: '2026-01-01T10:00:00.000Z' },
  },
});
T.setNav('sales', 'leads');

const LEAD_NAME = 'בר הבדיקה';
const leadDoc = () => T.docsWhere('crm_customers', d => d.businessName === LEAD_NAME)[0];
const panel = () => T.byId('lead-panel-close')?.closest('.fixed');
const quoteModal = () => T.modalWithTitle('מחולל הצעת מחיר');
const approvalModal = () => T.byId('quote-approve-submit')?.closest('.fixed');

async function pickCustomerInQuote(name) {
  const input = T.byId('customer-combobox-input', quoteModal());
  await T.focus(input);
  await T.type(input, name);
  const option = T.$$('div', quoteModal()).find(d => d.children.length === 0 && d.textContent.includes(name));
  await T.mouseDown(option || T.$$('*', quoteModal()).find(d => d.textContent.trim().startsWith(name)));
}

async function openApproval(quoteId) {
  await T.selectAction(T.byId(`quote-status-${quoteId}`), 'approved');
  return !!approvalModal();
}
async function submitApproval({ city = 'חיפה' } = {}) {
  const cityInput = T.$$('input', approvalModal()).find(i => (i.placeholder || '').includes('עיר'));
  if (cityInput && city) {
    await T.focus(cityInput);
    await T.type(cityInput, city);
    const opt = T.$$('button', approvalModal()).find(b => b.textContent.trim() === city);
    if (opt) await T.click(opt);
  }
  await T.click(T.byId('quote-approve-submit'));
}

async function approveQuote(quoteId, { city = 'חיפה', pickup = false } = {}) {
  await T.selectAction(T.byId(`quote-status-${quoteId}`), 'approved');
  if (!approvalModal()) return false;
  if (pickup) {
    await T.select(T.fieldByLabel('אופן מסירה', approvalModal()), 'pickup');
    await T.click(T.byId('quote-approve-submit'));
    return true;
  }
  const cityInput = T.$$('input', approvalModal()).find(i => (i.placeholder || '').includes('עיר'));
  if (cityInput && city) {
    await T.focus(cityInput);
    await T.type(cityInput, city);
    const opt = T.$$('button', approvalModal()).find(b => b.textContent.trim() === city);
    if (opt) await T.click(opt);
  }
  await T.click(T.byId('quote-approve-submit'));
  return true;
}

(async () => {
  await T.mountApp(App);

  // ───────────── 1. ליד חדש ─────────────
  T.describe('1. יצירת ליד חדש ידנית');
  await T.click(T.byId('lead-new'));
  const form = document.getElementById('customerForm');
  T.check(!!form, 'טופס הליד לא נפתח');
  await T.type(T.$('input[placeholder="לדוגמה: הבר של משה"]', form), LEAD_NAME);
  await T.type(T.$('input[placeholder="050-0000000"]', form), '052-123-4567');
  await T.type(T.$('input[placeholder="לדוגמה: משה כהן"]', form), 'יעל');
  await T.submit(form);
  let L = leadDoc();
  T.check(!!L, 'הליד לא נשמר ב-Firestore');
  T.check(L?.status === 'lead' && L?.createdBy === SH && L?.assignedTo === SH, `שדות הליד שגויים: ${JSON.stringify({ s: L?.status, c: L?.createdBy, a: L?.assignedTo })}`);
  T.check(Array.isArray(L?.interactionLogs) && L.interactionLogs.length === 0 && L?.possibleDuplicateOfId === null, 'יומן/קישור כפילות לא אותחלו');
  T.check(T.allById('lead-row').some(r => r.textContent.includes(LEAD_NAME)), 'הליד לא מופיע ברשימת הלידים');
  T.knownBug('SALES-4', 'ליד ידני נוצר בלי leadStage (מוצג "חדש" אבל אזהרת "עדיין חדש" בסגירה לא עובדת עליו)', !!L?.leadStage);

  // ───────────── 2. שלבים ותזכורת אוטומטית ─────────────
  T.describe('2. שינוי שלב ותזכורת מעקב אוטומטית');
  await T.click(T.allById('lead-row').find(r => r.textContent.includes(LEAD_NAME)));
  T.check(!!panel(), 'תיק הליד לא נפתח');
  await T.click(T.byId('lead-stage-contacted', panel()));
  L = leadDoc();
  T.check(L.leadStage === 'contacted' && !L.followUpDate, 'שלב "יצירת קשר" לא נשמר / קבע תזכורת שלא אמורה להיקבע');
  T.check(L.interactionLogs.some(l => l.type === 'system' && l.text.includes('יצירת קשר')), 'שינוי השלב לא נרשם ביומן');
  await T.click(T.byId('lead-stage-callback', panel()));
  L = leadDoc();
  T.check(L.leadStage === 'callback', 'שלב "חזרה ללקוח" לא נשמר');
  T.check(L.followUpDate === PLUS_3_BUSINESS_DAYS, `תזכורת אוטומטית: צפוי ${PLUS_3_BUSINESS_DAYS} (3 ימי עסקים, בלי שישי-שבת), התקבל ${L.followUpDate}`);
  T.check((L.followUpNote || '').includes('מעקב אוטומטי'), 'הערת התזכורת האוטומטית חסרה');
  T.check(L.interactionLogs.filter(l => l.type === 'system').length === 2, 'צפויות 2 רשומות מערכת (שני שינויי שלב)');

  // ───────────── 3. הערה ─────────────
  T.describe('3. הוספת הערה ליומן');
  await T.type(T.byId('lead-note-input', panel()), 'ביקשה הצעה לבר של 3 מטר');
  await T.click(T.byId('lead-note-save', panel()));
  L = leadDoc();
  T.check(L.interactionLogs.some(l => l.text === 'ביקשה הצעה לבר של 3 מטר' && l.user === SH), 'ההערה לא נשמרה ביומן');
  T.check(T.text(panel()).includes('ביקשה הצעה לבר של 3 מטר'), 'ההערה לא מוצגת בתיק');

  // ───────────── 4. עריכת פרטים ─────────────
  T.describe('4. עריכת פרטי הליד');
  await T.click(T.byId('lead-panel-edit', panel()));
  await T.type(T.$('input[placeholder="email@example.com"]', document.getElementById('customerForm')), 'yael@bar.co.il');
  await T.submit(document.getElementById('customerForm'));
  L = leadDoc();
  T.check(L.email === 'yael@bar.co.il', 'המייל לא נשמר');
  T.check(L.interactionLogs.length === 3 && L.leadStage === 'callback', 'עריכת הפרטים פגעה ביומן/בשלב');
  T.check(T.text(panel()).includes('yael@bar.co.il'), 'התיק לא מציג את המייל המעודכן');
  T.knownBug('SALES-5', 'שמירת טופס העריכה כותבת את השדה id לתוך מסמך הליד', !('id' in L));
  await T.click(T.byId('lead-panel-close'));

  // ───────────── 5. הצעת מחיר ─────────────
  T.describe('5. הצעת מחיר ללקוח');
  await T.nav('quotes');
  await T.click(T.byId('quote-new'));
  T.check(!!quoteModal(), 'מחולל הצעת המחיר לא נפתח');
  await pickCustomerInQuote(LEAD_NAME);
  await T.type(T.fieldByLabel('הנחה (₪)', quoteModal()), 500);
  await T.type(T.fieldByLabel('עלות משלוח כוללת', quoteModal()), 350);
  const saveBtn = T.byId('quote-save');
  T.check(saveBtn && !saveBtn.disabled, 'כפתור השמירה לא הופעל אחרי בחירת לקוח');
  const pdfBefore = globalThis.__pdf.saves.length;
  await T.click(saveBtn);
  const leadId = leadDoc().id;
  const quotes = T.docsWhere('crm_quotes', q => q.customerId === leadId);
  T.check(quotes.length === 1, `צפויה הצעה אחת, נמצאו ${quotes.length}`);
  const Q = quotes[0] || {};
  T.check(Q.status === 'pending' && Q.items?.[0]?.model === 'Prime' && Q.items?.[0]?.modelId === 'm_prime', `שדות ההצעה שגויים: ${JSON.stringify(Q.items)}`);
  T.check(Number(Q.items?.[0]?.listPrice) === 9500 && Number(Q.items?.[0]?.discount) === 500 && Number(Q.shippingCost) === 350, `מחיר/הנחה/משלוח בהצעה שגויים: ${JSON.stringify({ l: Q.items?.[0]?.listPrice, d: Q.items?.[0]?.discount, s: Q.shippingCost })}`);
  T.check(globalThis.__pdf.saves.length === pdfBefore + 1, 'קובץ ה-PDF לא הורד');
  L = leadDoc();
  T.check(L.leadStage === 'quote_sent', `הליד לא קודם ל"הצעה נשלחה": ${L.leadStage}`);
  T.check(L.followUpDate === PLUS_3_BUSINESS_DAYS, 'קידום השלב דרס תזכורת קיימת');
  T.check(!quoteModal(), 'המחולל לא נסגר אחרי שמירה');

  // ───────────── 6. אישור הצעה — גריעת מלאי והפיכה ללקוח ─────────────
  T.describe('6. אישור הצעה: גריעת מלאי, לקוח פעיל, יצירת הובלה');
  T.check(await approveQuote(Q.id), 'חלון אישור ההצעה לא נפתח');
  const sold = T.docsWhere('crm_items', i => i.customerId === leadId);
  T.check(sold.length === 1 && sold[0].status === 'sold' && sold[0].model === 'Prime', `צפוי פריט Prime אחד שנמכר ללקוח: ${JSON.stringify(sold.map(s => s.id))}`);
  T.check(sold[0]?.awaitingDelivery === true && sold[0]?.warrantyStartDate === null, 'הפריט לא סומן "ממתין להובלה" / אחריות התחילה לפני מסירה');
  T.check(T.docs('crm_items').N1.status === 'in_warehouse', 'נגרע פריט מדגם אחר');
  const Qa = T.docs('crm_quotes')[Q.id];
  T.check(Qa.status === 'approved' && (Qa.approvedItemIds || []).length === 1, 'ההצעה לא סומנה כמאושרת עם הפריט שנגרע');
  T.check(Number(sold[0]?.salePrice) === 9000 && Number(sold[0]?.discountAmount) === 500, `מחיר המכירה על הפריט צריך להיות 9,500 פחות הנחה 500 = 9,000: ${JSON.stringify({ p: sold[0]?.salePrice, d: sold[0]?.discountAmount })}`);
  T.check(Number(Qa.approvedShippingCost) === 350, `עלות המשלוח המאושרת צריכה להיות 350: ${Qa.approvedShippingCost}`);
  L = leadDoc();
  T.check(L.status === 'active', `הלקוח לא הפך לפעיל: ${L.status}`);
  const deliveries = T.docsWhere('crm_customer_deliveries', d => d.customerId === leadId);
  T.check(deliveries.length === 1 && deliveries[0].deliveryStatus === 'awaiting' && deliveries[0].deliveryCity === 'חיפה', `הובלה לא נוצרה כראוי: ${JSON.stringify(deliveries)}`);
  T.check(Number(deliveries[0]?.deliveryCost) === 350 && deliveries[0]?.deliveryMethod === 'delivery', `עלות/אופן ההובלה שגויים: ${JSON.stringify({ c: deliveries[0]?.deliveryCost, m: deliveries[0]?.deliveryMethod })}`);
  T.check(JSON.stringify(deliveries[0]?.itemIds) === JSON.stringify([sold[0]?.id]), 'ההובלה לא מקושרת לפריט שנמכר');
  T.check(T.ui.fetches.length === 0, 'בוצעה קריאה ל-Morning למרות שאין מפתחות');
  await T.nav('leads');
  T.check(!T.allById('lead-row').some(r => r.textContent.includes(LEAD_NAME)), 'לקוח פעיל עדיין מופיע ברשימת הלידים');
  await T.nav('customers');
  T.check(T.allById('customer-card').some(c => c.textContent.includes(LEAD_NAME)), 'הלקוח לא מופיע ברשימת הלקוחות');

  // ───────────── 7. תעודת משלוח ואישור הגעה ─────────────
  T.describe('7. תעודת משלוח ואישור הגעה (תחילת אחריות)');
  await T.nav('customer_deliveries');
  const D = deliveries[0];
  await T.click(T.byId(`delivery-note-${D.id}`));
  await T.sleep(450); // התעודה נוצרת אחרי השהיה של 350ms בקוד
  let Dd = T.docs('crm_customer_deliveries')[D.id];
  T.check(Dd.deliveryNoteNumber === 1 && Dd.deliveryNoteSnapshot?.number === 1, `מספר תעודה צפוי 1: ${Dd.deliveryNoteNumber}`);
  T.check(T.docs('crm_settings').delivery_note_counter?.next === 2, 'מונה התעודות לא קודם ל-2');
  T.check(globalThis.__pdf.saves.length === pdfBefore + 2, 'קובץ תעודת המשלוח לא הורד');
  T.answerConfirms(true);
  await T.click(T.byId(`delivery-arrived-${D.id}`));
  Dd = T.docs('crm_customer_deliveries')[D.id];
  T.check(Dd.deliveryStatus === 'delivered' && Dd.deliveredBy === SH, 'ההובלה לא סומנה כנמסרה');
  const item = T.docs('crm_items')[sold[0].id];
  T.check(item.awaitingDelivery === false && !!item.warrantyStartDate, 'האחריות לא התחילה במסירה');
  T.check(item.warrantyStartDate === ISRAEL_TODAY, `SALES-3: תאריך תחילת אחריות נרשם לפי UTC — בין 00:00 ל-03:00 בלילה נרשם אתמול (צפוי ${ISRAEL_TODAY}, נרשם ${item.warrantyStartDate})`);

  // ───────────── 8. תרחישי קצה ─────────────
  T.describe('8. הצעה עם שתי שורות מאותו דגם כשיש רק יחידה אחת במלאי');
  // נשאר P במלאי: יחידה אחת. הצעה ללקוח C9 עם שתי שורות Prime (כמות 1 כל אחת) = 2 יחידות.
  await T.nav('quotes');
  await T.click(T.byId('quote-new'));
  await pickCustomerInQuote('מסעדת הוותיקים');
  await T.click(T.buttonByText('הוסף פריט', quoteModal()));
  await T.click(T.byId('quote-save'));
  const q2 = T.docsWhere('crm_quotes', q => q.customerId === 'C9')[0];
  T.check(q2 && q2.items.length === 2, 'הצעה עם שתי שורות לא נשמרה');
  const alertsBefore = T.ui.alerts.length;
  T.check(await approveQuote(q2.id), 'תרחיש SALES-2 לא רץ: חלון האישור לא נפתח');
  const primeSoldToC9 = T.docsWhere('crm_items', i => i.customerId === 'C9');
  const approvedIds = T.docs('crm_quotes')[q2.id].approvedItemIds || [];
  const blocked = T.ui.alerts.slice(alertsBefore).some(a => a.includes('אין מספיק'));
  T.check(blocked || approvedIds.length > 0, 'תרחיש SALES-2 לא רץ: לא נחסם ולא אושר');
  T.check(blocked && T.ui.alerts.slice(alertsBefore).some(a => a.includes('נדרש: 2, פנוי: 1')), `SALES-2: הצעה עם שתי שורות מאותו דגם כשבמלאי יחידה אחת לא נחסמה עם הודעה "נדרש: 2, פנוי: 1" (מזהים באישור: ${JSON.stringify(approvedIds)})`);
  T.check(primeSoldToC9.length === 0 && T.docs('crm_quotes')[q2.id].status === 'pending', `SALES-2: למרות החסימה נגרעו ${primeSoldToC9.length} יחידות / ההצעה סומנה כמאושרת`);

  T.describe('9. כשל ביצירת PDF ואז ניסיון חוזר');
  await T.nav('quotes');
  await T.click(T.byId('quote-new'));
  await pickCustomerInQuote('מסעדת הוותיקים');
  const quotesBefore = T.docsWhere('crm_quotes', q => q.customerId === 'C9').length;
  globalThis.__pdfFailNext = true; // הניסיון הראשון נכשל ביצירת ה-PDF
  await T.click(T.byId('quote-save'));
  if (quoteModal()) await T.click(T.byId('quote-save'));
  const quotesAfter = T.docsWhere('crm_quotes', q => q.customerId === 'C9').length - quotesBefore;
  T.knownBug('SALES-1', `כשל ב-PDF ואז "נסה שוב" יוצר הצעת מחיר כפולה (נוצרו ${quotesAfter} במקום 1)`, quotesAfter === 1);

  // ───────────── 10. איסוף עצמי ומספור תעודות ─────────────
  T.describe('10. אישור עם איסוף עצמי ותעודת משלוח שנייה');
  if (quoteModal()) await T.click(T.buttonByText('ביטול', quoteModal()) || T.buttonByText('סגור', quoteModal()));
  await T.nav('quotes');
  await T.click(T.byId('quote-new'));
  await pickCustomerInQuote('מסעדת הוותיקים');
  await T.select(T.fieldByLabel('דגם', quoteModal()), 'Night');
  await T.type(T.fieldByLabel('עלות משלוח כוללת', quoteModal()), 200);
  await T.click(T.byId('quote-save'));
  const q3 = T.docsWhere('crm_quotes', q => q.customerId === 'C9' && q.items?.[0]?.model === 'Night')[0];
  T.check(!!q3, 'הצעה ל-Night לא נשמרה');
  T.check(await approveQuote(q3.id, { pickup: true }), 'חלון האישור לא נפתח (איסוף עצמי)');
  const q3a = T.docs('crm_quotes')[q3.id];
  T.check(q3a.status === 'approved' && Number(q3a.approvedShippingCost) === 0, `באיסוף עצמי עלות המשלוח צריכה להתאפס: ${q3a.approvedShippingCost}`);
  T.check(T.docs('crm_items').N1.status === 'sold' && T.docs('crm_items').N1.customerId === 'C9', 'יחידת Night לא נגרעה');
  const d2 = T.docsWhere('crm_customer_deliveries', d => d.quoteId === q3.id)[0];
  T.check(d2 && d2.deliveryMethod === 'pickup' && Number(d2.deliveryCost) === 0, `הובלת איסוף עצמי לא נוצרה כראוי: ${JSON.stringify(d2)}`);
  await T.nav('customer_deliveries');
  await T.click(T.byId(`delivery-note-${d2.id}`));
  await T.sleep(450);
  T.check(T.docs('crm_customer_deliveries')[d2.id].deliveryNoteNumber === 2 && T.docs('crm_settings').delivery_note_counter?.next === 3, 'התעודה השנייה לא קיבלה את המספר 2 / המונה לא התקדם');
  await T.click(T.byId(`delivery-note-again-${d2.id}`));
  await T.sleep(450);
  T.check(T.docs('crm_customer_deliveries')[d2.id].deliveryNoteNumber === 2 && T.docs('crm_settings').delivery_note_counter?.next === 3, 'הורדה חוזרת של תעודה קיימת שינתה את מספרה / קידמה את המונה');

  // ───────────── 11. אישור בלי גריעת מלאי ─────────────
  T.describe('11. אישור הצעה ללא גריעת מלאי');
  await T.nav('quotes');
  const statusesBefore = JSON.stringify(Object.entries(T.docs('crm_items')).map(([id, i]) => [id, i.status]));
  const q4 = T.docsWhere('crm_quotes', q => q.customerId === 'C9' && q.status === 'pending')[0];
  T.check(!!q4, 'אין הצעה ממתינה לבדיקה');
  await T.selectAction(T.byId(`quote-status-${q4.id}`), 'approved_no_stock');
  T.check(T.docs('crm_quotes')[q4.id].status === 'approved_no_stock', 'הסטטוס "אושר ללא גריעה" לא נשמר');
  T.check(JSON.stringify(Object.entries(T.docs('crm_items')).map(([id, i]) => [id, i.status])) === statusesBefore, 'אישור ללא גריעה שינה את המלאי');

  // ───────────── 12. ביטול אישור ─────────────
  T.describe('12. ביטול אישור של הזמנה שכבר נמסרה / שהונפקה לה תעודה — נחסם');
  const confirmsBefore12 = T.ui.confirms.length;
  let alertsBefore12 = T.ui.alerts.length;
  await T.selectAction(T.byId(`quote-status-${Q.id}`), 'pending');
  const Qr = T.docs('crm_quotes')[Q.id];
  T.check(Qr.status === 'approved' && (Qr.approvedItemIds || []).length === 1, `SALES-6: ביטול אישור של הזמנה שנמסרה לא נחסם: ${Qr.status}`);
  const itemStays = T.docs('crm_items')[sold[0].id];
  T.check(itemStays.status === 'sold' && itemStays.customerId === leadId && !!itemStays.warrantyStartDate, 'SALES-6: יחידה שנמצאת אצל הלקוח חזרה למלאי');
  const deliveryKept = T.docs('crm_customer_deliveries')[D.id];
  T.check(deliveryKept && deliveryKept.deliveryNoteNumber === 1 && deliveryKept.deliveryStatus === 'delivered', 'SALES-6: ההובלה/תעודת המשלוח הממוספרת נמחקה');
  T.check(leadDoc().status === 'active', 'SALES-6: הלקוח הוחזר לליד למרות שהביטול נחסם');
  // הבדיקה רצה אחרי שאלת האישור (בכוונה — כדי לתפוס גם מסירה שסומנה בזמן שהחלון פתוח)
  T.check(T.ui.alerts.slice(alertsBefore12).some(a => a.includes('כבר נמסרה')) && T.ui.confirms.length === confirmsBefore12 + 1, 'לא הוצגה הודעה ברורה שההזמנה נמסרה');
  // תעודה הונפקה אבל ההזמנה עוד לא נמסרה (איסוף עצמי, תעודה 00002)
  alertsBefore12 = T.ui.alerts.length;
  await T.selectAction(T.byId(`quote-status-${q3.id}`), 'pending');
  T.check(T.docs('crm_quotes')[q3.id].status === 'approved' && T.docs('crm_items').N1.status === 'sold' && T.docs('crm_customer_deliveries')[d2.id]?.deliveryNoteNumber === 2, 'SALES-6: ביטול אישור אחרי הנפקת תעודה ממוספרת לא נחסם');
  T.check(T.ui.alerts.slice(alertsBefore12).some(a => a.includes('תעודת משלוח') && a.includes('00002')), 'לא הוצגה הודעה שכבר הונפקה תעודה 00002');

  // ───────────── 13. שתי שורות מאותו דגם כשיש מלאי, וביטול לפני מסירה ─────────────
  T.describe('13. שתי שורות מאותו דגם (יש מלאי) וביטול אישור לפני מסירה');
  await T.act(async () => { await T.api().setDoc(T.api().doc(null, 'crm_items', 'P3'), { model: 'Prime', modelId: 'm_prime', status: 'in_warehouse', factoryUnitCostUSD: 1000, createdAt: '2026-10-01T10:00:00.000Z', shipmentId: '' }); });
  await T.flush(4);
  const primeFree = () => T.docsWhere('crm_items', i => i.modelId === 'm_prime' && i.status === 'in_warehouse');
  const freeBefore = primeFree().length;
  T.check(freeBefore >= 2, `צפויות לפחות 2 יחידות Prime פנויות לתרחיש: ${freeBefore}`);
  await T.nav('quotes');
  const quoteKeysBefore = Object.keys(T.docs('crm_quotes'));
  await T.click(T.byId('quote-new'));
  await pickCustomerInQuote('מסעדת הוותיקים');
  await T.type(T.fieldByLabel('הנחה (₪)', quoteModal()), 300);
  await T.click(T.buttonByText('הוסף פריט', quoteModal()));
  await T.click(T.byId('quote-save'));
  const q5Id = Object.keys(T.docs('crm_quotes')).find(k => !quoteKeysBefore.includes(k));
  const q5 = q5Id ? { id: q5Id, ...T.docs('crm_quotes')[q5Id] } : null;
  T.check(q5 && q5.items.length === 2, 'הצעה עם שתי שורות Prime לא נשמרה');
  T.check(await approveQuote(q5.id), 'חלון האישור לא נפתח');
  const q5a = T.docs('crm_quotes')[q5.id];
  const q5ids = q5a.approvedItemIds || [];
  T.check(q5a.status === 'approved' && q5ids.length === 2 && new Set(q5ids).size === 2, `SALES-2: שתי שורות מאותו דגם צריכות לגרוע שתי יחידות שונות: ${JSON.stringify(q5ids)}`);
  T.check(q5ids.every(id => T.docs('crm_items')[id]?.status === 'sold' && T.docs('crm_items')[id]?.customerId === 'C9') && primeFree().length === freeBefore - 2, 'היחידות לא סומנו כנמכרות ללקוח');
  const q5delivery = T.docsWhere('crm_customer_deliveries', d => d.quoteId === q5.id)[0];
  T.check(q5delivery && JSON.stringify(q5delivery.itemIds) === JSON.stringify(q5ids), 'ההובלה לא נוצרה עם שתי היחידות');
  T.check(q5ids.some(id => Number(T.docs('crm_items')[id].discountAmount) === 300), 'ההנחה לא נרשמה על הפריט');
  // "אישור בדיקה" על הצעה שכבר אושרה עם גריעה — נחסם (אחרת אישור חוזר גורע יחידות נוספות)
  let alertsBefore13 = T.ui.alerts.length;
  await T.selectAction(T.byId(`quote-status-${q5.id}`), 'approved_test');
  T.check(T.docs('crm_quotes')[q5.id].status === 'approved' && T.ui.alerts.slice(alertsBefore13).some(a => a.includes('בדיקה')), 'הצעה שאושרה עם גריעה עברה ל"אישור בדיקה" — אישור חוזר יגרע יחידות פעמיים');
  // דניאל מסמן מסירה בזמן שחלון "לבטל את האישור?" פתוח — הביטול חייב להיחסם
  const q5DeliveryId = T.docsWhere('crm_customer_deliveries', d => d.quoteId === q5.id)[0]?.id;
  alertsBefore13 = T.ui.alerts.length;
  T.answerConfirms(() => { T.api().updateDoc(T.api().doc(null, 'crm_customer_deliveries', q5DeliveryId), { deliveryStatus: 'delivered', deliveredAt: '2026-10-07T08:00:00.000Z' }); return true; });
  await T.selectAction(T.byId(`quote-status-${q5.id}`), 'pending');
  T.check(T.docs('crm_quotes')[q5.id].status === 'approved' && q5ids.every(id => T.docs('crm_items')[id].status === 'sold') && !!T.docs('crm_customer_deliveries')[q5DeliveryId], 'SALES-6: הזמנה שסומנה כנמסרה בזמן שחלון האישור היה פתוח — בכל זאת בוטלה');
  T.check(T.ui.alerts.slice(alertsBefore13).some(a => a.includes('כבר נמסרה')), 'לא הוצגה הודעה שההזמנה נמסרה בינתיים');
  await T.act(async () => { await T.api().updateDoc(T.api().doc(null, 'crm_customer_deliveries', q5DeliveryId), { deliveryStatus: 'awaiting', deliveredAt: null }); });
  await T.flush(4);
  // ביטול לפני שהונפקה תעודה — מותר, וכל היחידות חוזרות נקיות למלאי
  T.answerConfirms(true);
  await T.selectAction(T.byId(`quote-status-${q5.id}`), 'pending');
  T.check(T.docs('crm_quotes')[q5.id].status === 'pending', 'ביטול אישור לפני מסירה לא בוצע');
  const back = q5ids.map(id => T.docs('crm_items')[id]);
  T.check(back.every(i => i.status === 'in_warehouse' && !i.customerId), 'היחידות לא חזרו למלאי בביטול');
  T.check(back.every(i => !Number(i.discountAmount)), `SALES-7: ביטול אישור לא ניקה את "הנחה" מהפריט שחזר למלאי: ${back.map(i => i.discountAmount).join(',')}`);
  T.check(!T.docsWhere('crm_customer_deliveries', d => d.quoteId === q5.id).length, 'הובלה שלא יצאה לדרך לא נמחקה בביטול');

  // ───────────── 14. יחידה שנמכרה ממכשיר אחר ברגע האישור ─────────────
  T.describe('14. אישור הצעה כשהמלאי השתנה ממכשיר אחר (עוד לא הגיע למסך)');
  await T.nav('quotes');
  T.check(await openApproval(q5.id), 'חלון האישור לא נפתח');
  T.api().holdSnapshots(true);
  // דניאל מוכר מהמכשיר שלו את שתי היחידות הפנויות — המסך כאן עוד לא יודע
  for (const it of primeFree()) await T.api().updateDoc(T.api().doc(null, 'crm_items', it.id), { status: 'sold', customerId: 'C_DANIEL' });
  const soldByDaniel = T.docsWhere('crm_items', i => i.customerId === 'C_DANIEL').map(i => i.id);
  const alertsBeforeRace = T.ui.alerts.length;
  await submitApproval();
  await T.act(async () => { T.api().holdSnapshots(false); });
  await T.flush(6);
  T.check(soldByDaniel.length >= 2 && soldByDaniel.every(id => T.docs('crm_items')[id].customerId === 'C_DANIEL'), 'יחידה שנמכרה ממכשיר אחר נמכרה שוב (נדרסה)');
  T.check(T.docs('crm_quotes')[q5.id].status === 'pending' && !T.docsWhere('crm_customer_deliveries', d => d.quoteId === q5.id).length, 'האישור נשמר חלקית למרות שהמלאי כבר לא פנוי');
  T.check(T.ui.alerts.slice(alertsBeforeRace).some(a => a.includes('המלאי השתנה')), `לא הוצגה הודעה שהמלאי השתנה: ${T.ui.alerts.slice(alertsBeforeRace).join(' | ')}`);

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
