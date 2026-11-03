// מכירה ממשלוח "בדרך לארץ" (3.11.2026), והקמת דגם חדש מתוך שורת משלוח.
// כללים: מחסן קודם ואז בדרך; "בייצור בסין" לא נמכר; ביטול מחזיר יחידה לסטטוס המשלוח שלה;
// תעודת משלוח ומסירה רק אחרי שהמשלוח הגיע; משלוח עם יחידות שנמכרו לא נמחק.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

T.freezeTime('2026-11-03T10:00:00.000Z');

const unit = (model, modelId, status, shipmentId, created) => ({ model, modelId, status, shipmentId, factoryUnitCostUSD: 900, serialNumber: '', repairCost: 0, addOnCost: 0, salePrice: 0, addOnPrice: 0, campaignId: '', createdAt: created });
const line = (model, modelId) => ({ model, modelId, qty: 1, listPrice: 9500, discount: 0, finalPrice: 9500, price: 9500, customNotes: '' });

T.seed({
  crm_settings: { general_settings: { models: {
    Prime: { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: '', deliveryDescription: '' },
    Night: { id: 'm_night', cbm: 1, listPrice: 7800, videoUrl: '', supplierId: '', deliveryDescription: '' },
  } } },
  crm_shipments: {
    SH_SEA: { name: 'משלוח נובמבר', date: '2026-10-10', status: 'in_transit', exchangeRate: 3.7, shippingCostUSD: 0, shippingCostILS: 0, totalCbm: 0, lines: [{ model: 'Prime', modelId: 'm_prime', qty: 2, unitCostUSD: 900 }], createdAt: '2026-10-10T10:00:00.000Z' },
    SH_FAB: { name: 'משלוח דצמבר', date: '2026-10-20', status: 'ordered', exchangeRate: 3.7, shippingCostUSD: 0, shippingCostILS: 0, totalCbm: 0, lines: [{ model: 'Night', modelId: 'm_night', qty: 1, unitCostUSD: 800 }], createdAt: '2026-10-20T10:00:00.000Z' },
  },
  crm_items: {
    W1: { ...unit('Prime', 'm_prime', 'in_warehouse', '', '2026-09-01T10:00:00.000Z'), source: 'local' },
    T1: unit('Prime', 'm_prime', 'in_transit', 'SH_SEA', '2026-10-10T10:00:00.000Z'),
    T2: unit('Prime', 'm_prime', 'in_transit', 'SH_SEA', '2026-10-10T10:00:01.000Z'),
    O1: unit('Night', 'm_night', 'ordered', 'SH_FAB', '2026-10-20T10:00:00.000Z'),
  },
  crm_customers: {
    C1: { status: 'lead', leadStage: 'quote_sent', businessName: 'בר הים', contactName: 'עדי', phone: '0523333333', city: 'חיפה', interactionLogs: [], createdAt: '2026-10-01T10:00:00.000Z' },
  },
  crm_quotes: {
    Q1: { customerId: 'C1', date: '2026-11-03', status: 'pending', items: [{ ...line('Prime', 'm_prime'), qty: 2 }], shippingCost: 0, warrantyMonths: 12, campaignId: '', createdAt: '2026-11-03T09:00:00.000Z' },
    Q2: { customerId: 'C1', date: '2026-11-03', status: 'pending', items: [line('Night', 'm_night')], shippingCost: 0, warrantyMonths: 12, campaignId: '', createdAt: '2026-11-03T09:05:00.000Z' },
  },
});
T.setNav('sales', 'quotes');

const approvalModal = () => T.byId('quote-approve-submit')?.closest('.fixed');
const it = (id) => T.docs('crm_items')[id];

(async () => {
  await T.mountApp(App);

  // ───────────── 1. אישור עם יחידה מהמחסן + יחידה מהים ─────────────
  T.describe('1. אישור: מחסן קודם, ואז משלוח "בדרך לארץ"');
  await T.selectAction(T.byId('quote-status-Q1'), 'approved');
  T.check(!!approvalModal(), 'חלון האישור לא נפתח');
  const note = T.byId('quote-approve-transit-note', approvalModal());
  T.check(!!note && T.text(note).includes('משלוח נובמבר') && T.text(note).includes('1 × Prime'), `חלון האישור לא ציין שיחידה אחת באה ממשלוח נובמבר: ${T.text(note)}`);
  T.check(T.text(note).includes('מועד אספקה בכתב'), 'חסרה התזכורת לתאם מועד אספקה בכתב');
  await T.click(T.byId('quote-approve-submit'));
  const ids = T.docs('crm_quotes').Q1.approvedItemIds || [];
  T.check(T.docs('crm_quotes').Q1.status === 'approved' && ids.length === 2, `ההצעה לא אושרה עם 2 יחידות: ${JSON.stringify(ids)}`);
  T.check(ids.includes('W1'), 'יחידת המחסן לא נבחרה ראשונה');
  const seaSold = ids.find(id => id !== 'W1');
  const seaFree = seaSold === 'T1' ? 'T2' : 'T1';
  T.check(['T1', 'T2'].includes(seaSold) && it(seaSold).status === 'sold' && it(seaSold).customerId === 'C1', 'היחידה מהמשלוח לא נמכרה');
  T.check(it(seaFree).status === 'in_transit' && !it(seaFree).customerId, 'יחידה שנייה מהמשלוח נגרעה בלי צורך');

  T.describe('2. "בייצור בסין" לא נמכר');
  const alerts2 = T.ui.alerts.length;
  await T.selectAction(T.byId('quote-status-Q2'), 'approved');
  if (approvalModal()) await T.click(T.byId('quote-approve-submit'));
  T.check(T.docs('crm_quotes').Q2.status === 'pending' && it('O1').status === 'ordered', 'נמכרה יחידה שעוד בייצור');
  T.check(T.ui.alerts.slice(alerts2).some(a => a.includes('פנוי: 0')), 'לא הוסבר שאין יחידת Night פנויה');
  if (approvalModal()) await T.click(T.$$('button', approvalModal()).find(b => b.querySelector('svg') && !b.textContent.trim()));

  // ───────────── 3. הובלה חסומה עד הגעת המשלוח ─────────────
  T.describe('3. תעודת משלוח ומסירה חסומות עד שהמשלוח הגיע');
  await T.nav('customer_deliveries');
  const D = T.docsWhere('crm_customer_deliveries', d => d.quoteId === 'Q1')[0];
  T.check(!!D && !!T.byId(`delivery-waiting-shipment-${D.id}`) && T.text(T.byId(`delivery-waiting-shipment-${D.id}`)).includes('משלוח נובמבר'), 'ההובלה לא מסומנת "ממתין למשלוח"');
  const alerts3 = T.ui.alerts.length;
  await T.click(T.byId(`delivery-note-${D.id}`));
  await T.sleep(450);
  T.check(!T.docs('crm_customer_deliveries')[D.id].deliveryNoteNumber && !T.docs('crm_settings').delivery_note_counter, 'הונפקה תעודת משלוח לסחורה שעוד בים');
  T.answerConfirms(true);
  await T.click(T.byId(`delivery-arrived-${D.id}`));
  T.check(T.docs('crm_customer_deliveries')[D.id].deliveryStatus === 'awaiting' && !it(seaSold).warrantyStartDate, 'ההזמנה סומנה כנמסרה לפני שהמשלוח הגיע');
  T.check(T.ui.alerts.slice(alerts3).filter(a => a.includes('עוד לא הגיעו')).length === 2, 'לא הוסבר למה התעודה/המסירה חסומות');

  // ───────────── 4. ביטול אישור ─────────────
  T.describe('4. ביטול אישור: יחידה מהים חוזרת ל"בדרך", לא למחסן');
  await T.nav('quotes');
  T.answerConfirms(true);
  await T.selectAction(T.byId('quote-status-Q1'), 'pending');
  T.check(it('W1').status === 'in_warehouse', 'יחידת המחסן לא חזרה למחסן');
  T.check(it(seaSold).status === 'in_transit' && !it(seaSold).customerId && it(seaSold).arrivalDate === null, `יחידה שבים חזרה ל"${it(seaSold).status}" במקום ל"בדרך"`);

  // ───────────── 5. מחיקת משלוח עם יחידה שנמכרה ─────────────
  T.describe('5. מחיקת משלוח שיש בו יחידה שנמכרה — נחסמת');
  await T.selectAction(T.byId('quote-status-Q1'), 'approved');
  await T.click(T.byId('quote-approve-submit'));
  const ids5 = T.docs('crm_quotes').Q1.approvedItemIds || [];
  const sea5 = ids5.find(id => id !== 'W1');
  T.check(ids5.length === 2 && it(sea5).status === 'sold', 'אישור חוזר לא גרע את היחידות');
  await T.click(T.byId('space-operations'));
  await T.nav('shipments');
  T.answerConfirms(true);
  const alerts5 = T.ui.alerts.length;
  await T.click(T.byId('shipment-delete-SH_SEA'));
  T.check(!!T.docs('crm_shipments').SH_SEA && !!it(sea5), 'משלוח עם יחידה שנמכרה נמחק יחד עם היחידה');
  T.check(T.ui.alerts.slice(alerts5).some(a => a.includes('כבר נמכרו')), 'לא הוסבר למה אי אפשר למחוק');

  // ───────────── 6. הגעת המשלוח ─────────────
  T.describe('6. המשלוח מגיע: היחידה שנמכרה נשארת של הלקוח, ואז אפשר להנפיק תעודה');
  await T.selectAction(T.byId('shipment-status-SH_SEA'), 'in_warehouse');
  const arrival = T.byId('shipment-arrival-confirm')?.closest('.fixed');
  await T.type(T.$('input[type="date"]', arrival), '2026-11-03');
  await T.click(T.byId('shipment-arrival-confirm'));
  T.check(it(sea5).status === 'sold' && it(sea5).customerId === 'C1', 'הגעת המשלוח החזירה למחסן יחידה שכבר נמכרה');
  const other = sea5 === 'T1' ? 'T2' : 'T1';
  T.check(it(other).status === 'in_warehouse', 'היחידה הפנויה מהמשלוח לא עברה למחסן');
  await T.click(T.byId('space-sales'));
  await T.nav('customer_deliveries');
  const D6 = T.docsWhere('crm_customer_deliveries', d => d.quoteId === 'Q1')[0];
  T.check(!T.byId(`delivery-waiting-shipment-${D6.id}`), 'ההובלה עדיין מסומנת "ממתין למשלוח" אחרי ההגעה');
  await T.click(T.byId(`delivery-note-${D6.id}`));
  await T.sleep(450);
  T.check(T.docs('crm_customer_deliveries')[D6.id].deliveryNoteNumber === 1, 'אחרי הגעת המשלוח התעודה עדיין חסומה');

  // ───────────── 7. דגם חדש מתוך שורת משלוח ─────────────
  T.describe('7. "+ דגם חדש…" מתוך שורת משלוח');
  await T.click(T.byId('space-operations'));
  await T.nav('shipments');
  await T.click(T.byId('shipment-new'));
  await T.selectAction(T.byId('shipment-line-model-0'), '__new__');
  T.check(!!T.byId('quick-model-modal'), 'חלון "דגם חדש" לא נפתח');
  await T.type(T.byId('quick-model-name'), 'Event');
  await T.type(T.byId('quick-model-price'), 5200);
  await T.type(T.byId('quick-model-cbm'), 0.8);
  await T.click(T.byId('quick-model-save'));
  const ev = T.docs('crm_settings').general_settings.models.Event;
  T.check(!!ev && Number(ev.listPrice) === 5200 && Number(ev.cbm) === 0.8 && !!ev.id, `הדגם לא נשמר בקטלוג כראוי: ${JSON.stringify(ev)}`);
  T.check(!T.byId('quick-model-modal') && T.byId('shipment-line-model-0')?.value === 'Event', `הדגם החדש לא נבחר בשורה: ${T.byId('shipment-line-model-0')?.value}`);
  // שם קיים — נחסם (ההגנה של הקטלוג), ושום דבר לא נדרס
  await T.click(T.byId('shipment-add-line'));
  await T.selectAction(T.byId('shipment-line-model-1'), '__new__');
  await T.type(T.byId('quick-model-name'), 'Prime');
  const alerts7 = T.ui.alerts.length;
  await T.click(T.byId('quick-model-save'));
  T.check(T.ui.alerts.slice(alerts7).some(a => a.includes('כבר קיים')) && T.docs('crm_settings').general_settings.models.Prime.id === 'm_prime', 'דגם בשם קיים נוצר / דרס את הדגם הקיים');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
