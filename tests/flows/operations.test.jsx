// תהליך תפעול מלא, על הקוד האמיתי של App.tsx:
// משלוח מסין ← פריטי מלאי ← קליטה במחסן ← עלות נחיתה ← מכירה (ליד הופך ללקוח) ←
// ביטול מכירה ← מכירה מה-FAB ← עריכת משלוח אחרי מכירות.
//
// מספרי הבדיקה (עלות נחיתה/רווח) מחושבים ידנית מהנוסחה שבקוד:
//   מפעל: 1000$ × 3.7 = 3,700₪ ליחידה
//   שילוח: 500$ × 3.7 = 1,850₪ למשלוח ÷ 2.4 CBM = 770.83₪ ל-CBM × 1.2 CBM ליחידה = 925₪
//   עלות נחיתה ליחידה: 4,625₪ | שתי יחידות במלאי: 9,250₪
//   מכירה ב-6,000₪ + תוספת 200₪ = הכנסה 6,200₪ → רווח 1,575₪
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com';
T.freezeTime('2026-10-07T09:00:00.000Z'); // רביעי 12:00 שעון ישראל
const TODAY = '2026-10-07';

T.seed({
  crm_settings: { general_settings: { models: {
    Prime: { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: '', deliveryDescription: '' },
    Night: { id: 'm_night', cbm: 1, listPrice: 7800, videoUrl: '', supplierId: '', deliveryDescription: '' },
  } } },
  crm_shipments: {
    S_NIGHT: { name: 'משלוח לילה', date: '2026-09-01', status: 'ordered', exchangeRate: 3.7, shippingCostUSD: 0, shippingCostILS: 0, totalCbm: 0, lines: [{ model: 'Night', modelId: 'm_night', qty: 1, unitCostUSD: 800 }], createdAt: '2026-09-01T10:00:00.000Z' },
  },
  crm_items: {
    NX: { model: 'Night', modelId: 'm_night', status: 'ordered', shipmentId: 'S_NIGHT', factoryUnitCostUSD: 800, serialNumber: '', repairCost: 0, addOnCost: 0, salePrice: 0, addOnPrice: 0, campaignId: '', createdAt: '2026-09-01T10:00:00.000Z' },
  },
  crm_customers: {
    L1: { status: 'lead', leadStage: 'quote_sent', businessName: 'פאב המבחן', contactName: 'דנה', phone: '0541112222', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-20T10:00:00.000Z' },
  },
});
T.setNav('operations', 'shipments');

const shipmentModal = () => T.byId('shipment-save')?.closest('.fixed');
const itemModal = () => T.byId('item-save')?.closest('.fixed');
const primeItems = () => T.docsWhere('crm_items', i => i.modelId === 'm_prime');

async function openInventoryGroup(model) {
  await T.nav('inventory');
  // פותח את כל הקבוצות של הדגם (לפי משלוח/סטטוס). מצב הפתיחה נשמר בין מעברי טאב,
  // ולכן לוחצים רק על קבוצה שהשורה הבאה אחריה עדיין אינה שורת פריטים.
  for (const r of T.allById('inv-group').filter(r => r.textContent.includes(model))) {
    const expanded = r.nextElementSibling && r.nextElementSibling.querySelector('[data-testid^="item-edit-"]');
    if (!expanded) await T.click(r);
  }
}

(async () => {
  await T.mountApp(App);

  // ───────────── 1. משלוח חדש ─────────────
  T.describe('1. יצירת משלוח מסין');
  await T.click(T.byId('shipment-new'));
  const m = shipmentModal();
  T.check(!!m, 'טופס המשלוח לא נפתח');
  await T.type(T.fieldByLabel('שם המשלוח', m), 'משלוח אוקטובר');
  await T.type(T.fieldByLabel('עלות שילוח ($)', m), 500);
  await T.type(T.fieldByLabel('סה"כ CBM', m), 2.4);
  await T.type(T.fieldByLabel('כמות', m), 2);
  await T.type(T.fieldByLabel('עלות יחידה ($)', m), 1000);
  await T.click(T.byId('shipment-save'));
  const ships = T.docsWhere('crm_shipments', s => s.name === 'משלוח אוקטובר');
  T.check(ships.length === 1, 'המשלוח לא נשמר');
  const S = ships[0] || {};
  T.check(S.status === 'ordered' && S.exchangeRate === 3.7 && S.lines?.[0]?.modelId === 'm_prime' && Number(S.lines?.[0]?.qty) === 2, `שדות המשלוח שגויים: ${JSON.stringify({ st: S.status, r: S.exchangeRate, l: S.lines })}`);
  let items = primeItems();
  T.check(items.length === 2 && items.every(i => i.status === 'ordered' && i.shipmentId === S.id && i.factoryUnitCostUSD === 1000), `צפויים 2 פריטים "בהזמנה": ${JSON.stringify(items.map(i => i.status))}`);

  // ───────────── 2. קליטה במחסן ─────────────
  T.describe('2. הגעת המשלוח למחסן');
  await T.selectAction(T.byId(`shipment-status-${S.id}`), 'in_warehouse');
  const arrival = T.byId('shipment-arrival-confirm')?.closest('.fixed');
  T.check(!!arrival, 'חלון קליטת המשלוח לא נפתח');
  await T.type(T.$('input[type="date"]', arrival), TODAY);
  await T.click(T.byId('shipment-arrival-confirm'));
  await T.flush(10); // העדכון לא ממתין (fire-and-forget) — נותנים לו להסתיים
  T.check(T.docs('crm_shipments')[S.id].status === 'in_warehouse' && T.docs('crm_shipments')[S.id].arrivalDate === TODAY, 'המשלוח לא סומן כ"הגיע למחסן"');
  items = primeItems();
  T.check(items.every(i => i.status === 'in_warehouse' && i.arrivalDate === TODAY), `הפריטים לא עברו למחסן: ${JSON.stringify(items.map(i => [i.status, i.arrivalDate]))}`);

  // ───────────── 3. עלויות ─────────────
  T.describe('3. עלות נחיתה ושווי מלאי');
  await openInventoryGroup('Prime');
  T.check(T.amountShown(4625), 'עלות הנחיתה ליחידה (4,625₪) לא מוצגת במלאי');
  await T.nav('operations_dashboard');
  T.check(T.amountShown(9250), 'שווי המלאי (9,250₪) לא מוצג בדשבורד');

  // ───────────── 4. מכירה ללקוח ─────────────
  T.describe('4. מכירת יחידה לליד (הליד הופך ללקוח)');
  await openInventoryGroup('Prime');
  const unit = primeItems()[0];
  await T.click(T.byId(`item-edit-${unit.id}`));
  T.check(!!itemModal(), 'חלון עריכת הפריט לא נפתח');
  await T.select(T.fieldByLabel('סטטוס', itemModal()), 'sold');
  await T.type(T.fieldByLabel('מחיר מכירה', itemModal()), 6000);
  await T.type(T.fieldByLabel('תוספות', itemModal()), 200);
  await T.select(T.fieldByLabel('שיוך ללקוח', itemModal()), 'L1');
  await T.click(T.byId('item-save'));
  let U = T.docs('crm_items')[unit.id];
  T.check(U.status === 'sold' && U.customerId === 'L1' && Number(U.salePrice) === 6000 && U.saleDate === TODAY, `המכירה לא נשמרה: ${JSON.stringify({ s: U.status, c: U.customerId, p: U.salePrice, d: U.saleDate })}`);
  T.check(T.docs('crm_customers').L1.status === 'active' && T.docs('crm_customers').L1.previousStatusBeforeActive === 'lead', `הליד לא הפך ללקוח פעיל: ${JSON.stringify(T.docs('crm_customers').L1)}`);
  T.knownBug('OPS-1', `שמירת פריט כותבת ל-Firestore שדות מחושבים (${['totalLandedCost', 'profit', 'customerName', 'shipmentName', 'id', 'isGlobalSale'].filter(k => k in U).join(', ') || '—'})`,
    !['totalLandedCost', 'profit', 'customerName', 'shipmentName', 'id', 'isGlobalSale'].some(k => k in U));
  await T.nav('operations_dashboard');
  T.check(T.amountShown(4625), 'שווי המלאי אחרי המכירה (4,625₪) שגוי');
  T.check(T.amountShown(1575), 'הרווח מהמכירה (1,575₪ = 6,200 − 4,625) לא מוצג');

  // ───────────── 5. ביטול מכירה ─────────────
  T.describe('5. ביטול המכירה מחזיר את הלקוח לליד');
  await openInventoryGroup('Prime');
  await T.click(T.byId(`item-edit-${unit.id}`));
  await T.select(T.fieldByLabel('סטטוס', itemModal()), 'in_warehouse');
  await T.click(T.byId('item-save'));
  U = T.docs('crm_items')[unit.id];
  T.check(U.status === 'in_warehouse' && !U.customerId && !U.salePrice && !U.saleDate, 'נתוני המכירה לא נוקו בביטול');
  T.check(T.docs('crm_customers').L1.status === 'lead', `הלקוח לא חזר לסטטוס הקודם (ליד) אחרי ביטול: ${T.docs('crm_customers').L1.status}`);
  T.check(!Number(U.addOnPrice) && !Number(U.discountAmount), `OPS-2: ביטול מכירה השאיר על הפריט תוספות/הנחה (${U.addOnPrice}/${U.discountAmount})`);

  // ───────────── 6. מכירה מה-FAB ─────────────
  T.describe('6. מכירה מהירה מה-FAB (גריעה אוטומטית מהמלאי)');
  await T.click(T.byId('fab-toggle'));
  await T.click(T.byId('fab-global-sale'));
  T.check(!!itemModal(), 'חלון המכירה המהירה לא נפתח');
  await T.click(T.byId('item-save'));
  let soldNow = primeItems().filter(i => i.status === 'sold');
  T.check(soldNow.length === 1, `צפויה יחידה אחת שנמכרה: ${soldNow.length}`);
  T.check(Number(soldNow[0]?.salePrice) === 9500, `מחיר ברירת המחדל צפוי להיות מחיר המחירון (9,500): ${soldNow[0]?.salePrice}`);
  await T.click(T.byId('fab-toggle'));
  await T.click(T.byId('fab-global-sale'));
  await T.click(T.byId('item-save'));
  soldNow = primeItems().filter(i => i.status === 'sold');
  T.check(soldNow.length === 2, 'המכירה השנייה לא גרעה את היחידה האחרונה');
  await T.click(T.byId('fab-toggle'));
  await T.click(T.byId('fab-global-sale'));
  if (itemModal()) await T.click(T.byId('item-save'));
  T.check(primeItems().filter(i => i.status === 'sold').length === 2, 'נמכרה יחידה שלא קיימת במלאי');

  // ───────────── 6ב. החזרת משלוח ל"בדרך" ─────────────
  T.describe('6ב. החזרת משלוח שכל יחידותיו נמכרו לסטטוס "בדרך לארץ"');
  if (itemModal()) await T.click(T.buttonByText('ביטול', itemModal()));
  await T.nav('shipments');
  T.answerConfirms(true);
  await T.selectAction(T.byId(`shipment-status-${S.id}`), 'in_transit');
  await T.flush(10);
  T.check(T.docs('crm_shipments')[S.id].status === 'in_transit' && T.docs('crm_shipments')[S.id].arrivalDate === null, 'המשלוח לא חזר ל"בדרך" / תאריך ההגעה לא נוקה');
  T.check(primeItems().filter(i => i.status === 'sold').length === 2, 'שינוי סטטוס המשלוח שינה פריטים שכבר נמכרו');

  // ───────────── 7. עריכת משלוח אחרי מכירות ─────────────
  T.describe('7. עריכת כמויות במשלוח שיש בו יחידות שנמכרו');
  if (itemModal()) await T.click(T.buttonByText('ביטול', itemModal()));
  await T.nav('shipments');
  const sold2 = () => primeItems().filter(i => i.status === 'sold').map(i => i.id).sort().join(',');
  const soldBefore7 = sold2();
  const editShipment = async () => { await T.click(T.byId(`shipment-edit-${S.id}`)); return !!shipmentModal(); };
  const closeShipment = async () => { if (shipmentModal()) await T.click(T.buttonByText('ביטול', shipmentModal()) || T.$('button', shipmentModal())); };
  // 7א. הגדלה ל-3 ואז הקטנה ל-2 — נמחקת רק היחידה שלא נמכרה
  T.check(await editShipment(), 'חלון עריכת המשלוח לא נפתח');
  await T.type(T.fieldByLabel('כמות', shipmentModal()), 3);
  await T.click(T.byId('shipment-save'));
  T.check(primeItems().length === 3 && sold2() === soldBefore7, `הגדלה ל-3 לא יצרה יחידה חדשה אחת: ${primeItems().length}`);
  await editShipment();
  await T.type(T.fieldByLabel('כמות', shipmentModal()), 2);
  await T.click(T.byId('shipment-save'));
  T.check(primeItems().length === 2 && sold2() === soldBefore7 && Number(T.docs('crm_shipments')[S.id].lines?.[0]?.qty) === 2, 'הקטנה ל-2 לא מחקה בדיוק את היחידה שלא נמכרה');
  // 7ב. הקטנה מתחת למספר היחידות שנמכרו — נחסם, שום דבר לא נכתב
  const seqBefore = T.seq();
  let alertsBefore7 = T.ui.alerts.length;
  await editShipment();
  await T.type(T.fieldByLabel('כמות', shipmentModal()), 1);
  await T.click(T.byId('shipment-save'));
  T.check(sold2() === soldBefore7 && primeItems().length === 2, `OPS-4: הקטנת כמות במשלוח מחקה יחידה שכבר נמכרה (נשארו: ${sold2()})`);
  T.check(Number(T.docs('crm_shipments')[S.id].lines?.[0]?.qty) === 2 && T.writesSince(seqBefore).length === 0, 'OPS-4: השמירה נחסמה חלקית — המשלוח/המלאי עודכנו');
  T.check(T.ui.alerts.slice(alertsBefore7).some(a => a.includes('כבר נמכרו') && a.includes('Prime')), 'לא הוצגה הודעה שיחידות Prime כבר נמכרו');
  await closeShipment();
  // 7ג. הסרת שורת הדגם כולה (והוספת דגם אחר במקומה) — נחסם, ולא נוצרה יחידה של הדגם החדש
  alertsBefore7 = T.ui.alerts.length;
  const nightBefore = T.docsWhere('crm_items', i => i.modelId === 'm_night').length;
  await editShipment();
  await T.click(T.byId('shipment-add-line'));
  const modelSelects = T.$$('select', shipmentModal()).filter(el => T.$$('option', el).some(o => o.value === 'Night'));
  await T.select(modelSelects[modelSelects.length - 1], 'Night');
  await T.click(T.byId('shipment-remove-line-0'));
  await T.click(T.byId('shipment-save'));
  T.check(sold2() === soldBefore7 && T.docs('crm_shipments')[S.id].lines?.length === 1 && T.docs('crm_shipments')[S.id].lines[0].model === 'Prime', 'OPS-4: הסרת שורת דגם שיש בה יחידות שנמכרו לא נחסמה');
  T.check(T.docsWhere('crm_items', i => i.modelId === 'm_night').length === nightBefore, 'השמירה החסומה בכל זאת יצרה יחידת Night');
  T.check(T.ui.alerts.slice(alertsBefore7).some(a => a.includes('אי אפשר להסיר')), 'לא הוצגה הודעה שאי אפשר להסיר את הדגם');
  await closeShipment();

  // ───────────── 7ד. שורה אחת לכל דגם במשלוח ─────────────
  T.describe('7ד. שורה אחת לכל דגם במשלוח');
  await editShipment();
  await T.click(T.byId('shipment-add-line'));
  T.check(T.byId('shipment-line-model-1')?.value === 'Night', `"הוסף שורה" בחר דגם שכבר יש לו שורה (צפוי Night): ${T.byId('shipment-line-model-1')?.value}`);
  const primeOpt = T.$$('option', T.byId('shipment-line-model-1')).find(o => o.value === 'Prime');
  T.check(!!primeOpt && primeOpt.disabled, 'בשורה השנייה אפשר לבחור את Prime למרות שכבר יש לו שורה');
  // הגנה אחרונה: גם אם כפילות נוצרה (למשל נתונים ישנים) — השמירה נחסמת ושום דבר לא נכתב
  await T.select(T.byId('shipment-line-model-1'), 'Prime');
  const seqDup = T.seq();
  alertsBefore7 = T.ui.alerts.length;
  await T.click(T.byId('shipment-save'));
  T.check(T.writesSince(seqDup).length === 0 && primeItems().length === 2 && sold2() === soldBefore7, `משלוח עם אותו דגם פעמיים נשמר / שינה מלאי: ${T.writesSince(seqDup).map(w => w.op + ':' + w.col).join(',')}`);
  T.check(T.ui.alerts.slice(alertsBefore7).some(a => a.includes('מופיע פעמיים') && a.includes('Prime')), 'לא הוצגה הודעה שהדגם מופיע פעמיים');
  await closeShipment();

  // ───────────── 8. פעולות בלילה (00:00–03:00) ─────────────
  T.describe('8. קליטה ומכירה בשעה 01:30 בלילה (שעון ישראל)');
  T.freezeTime('2026-10-07T22:30:00.000Z'); // חמישי 8.10, 01:30 שעון ישראל = עדיין 7.10 ב-UTC
  const NIGHT_TODAY = '2026-10-08';
  await T.nav('shipments');
  await T.selectAction(T.byId('shipment-status-S_NIGHT'), 'in_warehouse');
  const arrivalNight = T.byId('shipment-arrival-confirm')?.closest('.fixed');
  T.check(!!arrivalNight, 'חלון קליטת משלוח הלילה לא נפתח');
  const defaultArrival = T.$('input[type="date"]', arrivalNight)?.value;
  await T.click(T.byId('shipment-arrival-confirm')); // בלי להקליד — תאריך ברירת המחדל
  await T.flush(10);
  const nightArrival = T.docs('crm_shipments').S_NIGHT.arrivalDate;
  T.check(T.docs('crm_items').NX.status === 'in_warehouse', 'פריט משלוח הלילה לא נקלט');
  T.knownBug('DATE-1', `תאריך הגעה ברירת מחדל נקבע לפי UTC — בלילה נרשם אתמול (צפוי ${NIGHT_TODAY}, בחלון ${defaultArrival}, נשמר ${nightArrival})`, nightArrival === NIGHT_TODAY);
  await T.click(T.byId('fab-toggle'));
  await T.click(T.byId('fab-global-sale'));
  await T.select(T.fieldByLabel('בחר דגם למכירה', itemModal()), 'Night');
  await T.click(T.byId('item-save'));
  const NX = T.docs('crm_items').NX;
  T.check(NX.status === 'sold', 'מכירת הלילה לא בוצעה');
  T.knownBug('DATE-2', `תאריך מכירה במכירה מהירה נקבע לפי UTC — בלילה נרשם אתמול, והמכירה נספרת בדוחות ביום (ולעיתים בחודש) הקודם (צפוי ${NIGHT_TODAY}, נשמר ${NX.saleDate})`, NX.saleDate === NIGHT_TODAY);

  // ───────────── 9. מיזוג דגמים שנמצאים באותו משלוח ─────────────
  T.describe('9. מיזוג דגמים כששניהם באותו משלוח — שורה אחת, ושמירה לא מוחקת יחידות');
  await T.nav('shipments');
  await editShipment();
  await T.click(T.byId('shipment-add-line'));
  const line1 = T.byId('shipment-line-model-1').closest('div.flex');
  await T.type(T.fieldByLabel('כמות', line1), 1);
  await T.type(T.fieldByLabel('עלות יחידה ($)', line1), 700);
  await T.click(T.byId('shipment-save'));
  const inS = () => T.docsWhere('crm_items', i => i.shipmentId === S.id);
  T.check(inS().length === 3 && inS().filter(i => i.modelId === 'm_night').length === 1, `הוספת שורת Night למשלוח לא יצרה יחידה: ${inS().length}`);
  await T.nav('models');
  const nightRow = T.allById('model-row').find(r => r.textContent.includes('Night'));
  await T.click(nightRow);
  const modelPanel = () => T.byId('model-card-save')?.closest('.fixed');
  await T.click(T.buttonByText('מזג', modelPanel()));
  const mergeSel = T.$$('select', modelPanel()).find(x => x.textContent.includes('בחר דגם יעד'));
  await T.select(mergeSel, 'Prime');
  T.answerConfirms(true);
  await T.click(T.buttonByText('בצע מיזוג'));
  const SL = T.docs('crm_shipments')[S.id].lines || [];
  T.check(SL.length === 1 && SL[0].model === 'Prime' && Number(SL[0].qty) === 3, `אחרי המיזוג במשלוח צפויה שורה אחת של Prime × 3: ${JSON.stringify(SL)}`);
  T.check(Math.abs(Number(SL[0].unitCostUSD) - 900) < 0.01, `מחיר השורה המאוחדת צריך להיות ממוצע משוקלל (2×1000 + 1×700) / 3 = 900: ${SL[0]?.unitCostUSD}`);
  T.check(inS().length === 3 && inS().every(i => i.modelId === 'm_prime'), 'המיזוג שינה את מספר היחידות במשלוח');
  // השמירה הבאה של המשלוח (בלי שינוי) — אסור שתמחק יחידות
  await T.nav('shipments');
  await editShipment();
  await T.click(T.byId('shipment-save'));
  T.check(inS().length === 3 && inS().filter(i => i.status === 'sold').length === 2, `שמירת המשלוח אחרי מיזוג מחקה יחידות: נשארו ${inS().length}`);
  // שמירה בלי שינוי מחיר לא כותבת מחדש את עלות היחידות (היחידות שנמכרו נשארות ב-1,000$, זו שמוזגה ב-700$)
  T.check(inS().map(i => Number(i.factoryUnitCostUSD)).sort((a, b) => a - b).join(',') === '700,1000,1000', `שמירת המשלוח שינתה את עלות היחידות לממוצע: ${inS().map(i => i.factoryUnitCostUSD).join(',')}`);
  // שינוי מחיר מכוון בשורה — כן מעדכן את כל היחידות
  await editShipment();
  await T.type(T.fieldByLabel('עלות יחידה ($)', shipmentModal()), 950);
  await T.click(T.byId('shipment-save'));
  T.check(inS().every(i => Number(i.factoryUnitCostUSD) === 950), `שינוי מחיר מכוון בשורה לא עדכן את היחידות: ${inS().map(i => i.factoryUnitCostUSD).join(',')}`);

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
