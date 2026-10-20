// הובלות ללקוחות: שינוי שם/טלפון בכרטיס הלקוח חייב להופיע במסך ההובלות.
// רשומת ההובלה שומרת עותק (customerName/Phone/Address) מרגע פתיחתה, ולכן שינוי בכרטיס הלקוח
// לא הגיע אליה. הכלל החדש: השם נקרא תמיד מהלקוח (id), טלפון וכתובת חיים בהובלות ממתינות
// וקפואים (snapshot) בהובלות שכבר נמסרו. הובלה של לקוח שנמחק נשארת עם העותק השמור.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

T.freezeTime('2026-10-14T08:00:00.000Z');

T.seed({
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: '', deliveryDescription: '' } } } },
  crm_customers: {
    C1: { status: 'active', businessName: 'בר הים החדש', contactName: 'דני', phone: '0501111111', address: 'חיפה, הנמל 5', interactionLogs: [], createdAt: '2026-01-01T10:00:00.000Z' },
  },
  crm_customer_deliveries: {
    D1: { customerId: 'C1', customerName: 'בר הים הישן', customerPhone: '0509999999', customerAddress: 'כתובת ישנה', deliveryStatus: 'awaiting', deliveryMethod: 'delivery', shippingTiming: 'immediate', deliveryCity: 'חיפה', deliveryCost: 350, lines: [{ model: 'Prime', qty: 1 }], itemIds: [], createdAt: '2026-10-10T10:00:00.000Z' },
    D2: { customerId: 'C1', customerName: 'בר הים הישן', customerPhone: '0508888888', customerAddress: 'כתובת ישנה', deliveryStatus: 'delivered', deliveredAt: '2026-10-01T10:00:00.000Z', deliveryMethod: 'delivery', shippingTiming: 'immediate', deliveryCity: 'חיפה', deliveryCost: 350, lines: [{ model: 'Prime', qty: 1 }], itemIds: [], createdAt: '2026-09-25T10:00:00.000Z' },
    D3: { customerId: 'GONE', customerName: 'לקוח שנמחק בע"מ', customerPhone: '0507777777', customerAddress: '', deliveryStatus: 'awaiting', deliveryMethod: 'delivery', shippingTiming: 'immediate', deliveryCity: 'חיפה', deliveryCost: 350, lines: [{ model: 'Prime', qty: 1 }], itemIds: [], createdAt: '2026-10-09T10:00:00.000Z' },
  },
});
T.setNav('sales', 'customer_deliveries');

(async () => {
  await T.mountApp(App);
  const page = () => document.body.textContent;
  const cards = () => T.$$('.bg-white.border.rounded-lg.p-4');

  T.describe('1. הובלה ממתינה: השם והטלפון נקראים מהלקוח');
  T.check(page().includes('בר הים החדש'), 'השם החדש מכרטיס הלקוח לא מוצג בהובלה הממתינה');
  T.check(!page().includes('בר הים הישן'), 'השם הישן (העותק השמור) עדיין מוצג בהובלה');
  T.check(page().includes('0501111111') && !page().includes('0509999999'), 'הטלפון החי לא מוצג בהובלה הממתינה');

  T.describe('2. לקוח שנמחק: נשאר העותק השמור');
  T.check(page().includes('לקוח שנמחק בע"מ'), 'הובלה של לקוח שנמחק איבדה את השם השמור');

  T.describe('3. הובלה שנמסרה: שם חי, טלפון קפוא');
  await T.click(T.buttonByText('נשלחו בהצלחה'));
  T.check(page().includes('בר הים החדש'), 'השם החדש לא מוצג בהובלה שנמסרה');
  T.check(page().includes('0508888888') && !page().includes('0501111111'), 'הטלפון בהובלה שנמסרה אמור להישאר כפי שנשמר בעת המסירה');

  T.describe('4. שינוי שם חי בזמן שהמסך פתוח');
  await T.click(T.buttonByText('ממתינים להובלה'));
  await T.act(async () => { await T.api().updateDoc(T.api().doc(null, 'crm_customers', 'C1'), { businessName: 'בר הים — שם שלישי' }); });
  await T.flush();
  T.check(page().includes('בר הים — שם שלישי'), 'שינוי שם שבוצע בזמן שהמסך פתוח לא הופיע בהובלה');
  T.check(cards().length >= 2, 'מסך ההובלות לא הציג את ההובלות הממתינות');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); T.finish(); });
