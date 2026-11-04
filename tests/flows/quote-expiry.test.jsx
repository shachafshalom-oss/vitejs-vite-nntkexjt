// הצעות שנדחו אוטומטית (quote-expirer, 4.11.2026): תגית ברשימה, פתיחה מחדש שומרת את הסימון
// (כדי שהפונקציה לא תדחה שוב), וה-PDF מציג את מספר ימי התוקף מאותו קבוע.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

T.freezeTime('2026-11-18T08:00:00.000Z');
T.seed({
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500 } } } },
  crm_customers: { C1: { status: 'lead', leadStage: 'quote_sent', businessName: 'בר שתק', phone: '0506660000', interactionLogs: [], createdAt: '2026-11-01T08:00:00.000Z' } },
  crm_quotes: {
    QX: { customerId: 'C1', date: '2026-11-05', status: 'rejected', rejectReason: 'expired', autoRejectedAt: '2026-11-18T01:00:00.000Z', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], shippingCost: 0, createdAt: '2026-11-05T08:00:00.000Z' },
    QM: { customerId: 'C1', date: '2026-11-05', status: 'rejected', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], shippingCost: 0, createdAt: '2026-11-05T09:00:00.000Z' },
  },
});
T.setNav('sales', 'quotes');

(async () => {
  await T.mountApp(App);

  T.describe('1. תגית "נדחתה אוטומטית" רק להצעה שפג תוקפה');
  T.check(T.text(T.byId('quote-auto-rejected-QX')).includes('נדחתה אוטומטית') && T.text(T.byId('quote-auto-rejected-QX')).includes('13'), 'חסרה תגית "נדחתה אוטומטית (יום 13)"');
  T.check(!T.byId('quote-auto-rejected-QM'), 'תגית אוטומטית הופיעה על הצעה שנדחתה ידנית');

  T.describe('2. פתיחה מחדש ידנית — הסימון נשמר (הפונקציה לא תדחה שוב)');
  await T.selectAction(T.byId('quote-status-QX'), 'pending');
  const QX = T.docs('crm_quotes').QX;
  T.check(QX.status === 'pending' && !!QX.autoRejectedAt, `הסימון נמחק בפתיחה מחדש — ההצעה תידחה שוב בלילה: ${JSON.stringify(QX)}`);
  T.check(!T.byId('quote-auto-rejected-QX'), 'התגית נשארה אחרי פתיחה מחדש');

  T.describe('3. ה-PDF מציג 10 ימי תוקף מהקבוע המשותף');
  await T.click(T.byId('quote-new'));
  const modal = T.modalWithTitle('מחולל הצעת מחיר');
  T.check(T.text(modal).includes('תקפה ל-10 ימים בלבד'), 'נוסח התוקף ב-PDF השתנה / לא מהקבוע');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
