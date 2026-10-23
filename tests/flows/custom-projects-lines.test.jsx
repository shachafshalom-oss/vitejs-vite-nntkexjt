// שורות בפרויקט קסטום (שלב 4א):
//  • מחיר נעול — שורה שהגיעה מ-Bar Planner נושאת את המחיר שהלקוח חתם עליו (lockedSaleILS).
//    המסך, ה-PDF, ה-Excel ו-Morning משתמשים בו, הוא לא מחושב מחדש ולא ניתן לעריכה.
//  • מחיר ידני לפי מזהה שורה (L:<lineId>) ולא לפי מספר שורה — כך שינוי סדר / הסרת שורה
//    ממקור חיצוני (סנכרון מ-Bar Planner, מכשיר אחר) לא מעביר מחיר לשורה הלא נכונה.
//  • פרויקט ישן (מחירים לפי מספר שורה) עובר למזהי שורות ברגע שנפתח, בלי לאבד אף מחיר.
import { act } from 'react';
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com';
T.freezeTime('2026-10-23T09:00:00.000Z');

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 900 ? 60 : ms === 1800 ? 20 : ms, ...a);
const AUTOSAVE_WAIT = 150;

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

const PARAMS = { exchangeRate: 3.6, containerShippingUSD: 1000, customsPercent: 0, portFeesILS: 0, localTransportILS: 0, installationILS: 0 };
const line = (lineId, id, itemHe, usd, cbm, extra = {}) => ({ lineId, id, itemHe, itemEn: '', info: '', size: '', qty: 1, unitPriceUSD: usd, cbm, images: [], noteHe: '', ...extra });
const BP_LINES = [
  line('a1', 'S1', 'עמדה 1 (Bar Planner)', 1000, 2, { lockedSaleILS: 9000, source: { kind: 'bar-planner', projectId: 'bp1', version: 3 } }),
  line('b2', 'S2', 'עמדה 2 (Bar Planner)', 800, 1.5, { lockedSaleILS: 7000, source: { kind: 'bar-planner', projectId: 'bp1', version: 3 } }),
  line('c3', 'M1', 'מדף ידני', 100, 0.2),
];
const LEGACY = [line(undefined, 'X1', 'דלפק', 1500, 2), line(undefined, 'X2', 'מדף', 300, 0.5), line(undefined, 'X3', 'כיור', 200, 0.2)].map(({ lineId: _x, ...p }) => p);

T.seed({
  crm_settings: { general_settings: { models: {}, morningApiKeyId: 'kid', morningApiKeySecret: 'ksecret' } },
  crm_customers: { C2: { status: 'active', businessName: 'מלון החוף', contactName: 'אלון', phone: '0529876543', assignedTo: SH, interactionLogs: [], createdAt: '2026-01-01T10:00:00.000Z' } },
  crm_custom_projects: {
    P5: { name: 'בר מ-Bar Planner', clientName: 'מלון החוף', customerId: 'C2', date: '2026-10-20', status: 'preparation', params: PARAMS, marginPercent: 30, products: BP_LINES, salePriceOverrides: { 'L:c3': 1234 }, notes: '', createdAt: '2026-10-20T10:00:00.000Z' },
    P6: { name: 'פרויקט ישן', clientName: 'מלון החוף', customerId: 'C2', date: '2026-09-01', status: 'preparation', params: PARAMS, marginPercent: 25, products: LEGACY, salePriceOverrides: { 1: 555, 2: 777 }, notes: '', createdAt: '2026-09-01T10:00:00.000Z' },
  },
});
T.setNav('sales', 'custom_projects');

const proj = (id) => T.docs('crm_custom_projects')[id];
const detail = () => T.byId('cp-detail-close')?.closest('.fixed');
const payModal = () => { const h = T.$$('h3').find(x => x.textContent.includes('שידור דרישת')); return h ? h.closest('.fixed') : null; };
async function openDetail(id) {
  if (detail()) await T.click(T.byId('cp-detail-close'));
  await T.click(T.byId(`cp-status-${id}`).closest('[data-testid="cp-card"]'));
  await T.flush(6);
  return !!detail();
}
async function closePayModal() { if (payModal()) await T.click(payModal().querySelector('button[aria-label="סגור"]')); }
const shownSales = (n) => Array.from({ length: n }, (_, i) => T.byId(`cp-row-sale-${i}`)?.value);
async function morningTestPrices() {
  await T.selectAction(T.byId('cp-detail-status'), 'deposit_paid');
  await T.click(T.byId('cp-pay-test'));
  await T.flush(10);
  const sent = (morningCalls[morningCalls.length - 1]?.income || []).filter(l => l.price > 0).map(l => l.price);
  await closePayModal();
  return sent.join(',');
}

(async () => {
  await T.mountApp(App);

  // =====================================================================
  T.describe('1. מחיר נעול מ-Bar Planner');
  T.check(await openDetail('P5'), 'דוח הפרויקט לא נפתח');
  T.check(shownSales(3).join(',') === '9000,7000,1234', `מחירי השורות על המסך: ${shownSales(3).join(',')} (צפוי 9000,7000,1234)`);
  T.check(T.byId('cp-row-sale-0').readOnly && T.byId('cp-row-sale-1').readOnly && !T.byId('cp-row-sale-2').readOnly, 'שורה נעולה ניתנת לעריכה / שורה ידנית נעולה');
  T.check(!!T.byId('cp-row-locked-0') && !T.byId('cp-row-locked-2'), 'אין סימון "מחיר נעול" על שורת Bar Planner');
  T.check(T.amountShown(9000 + 7000 + 1234, T.byId('cp-sale-total')), `שורת הסיכום: ${T.byId('cp-sale-total').textContent}`);
  // שינוי שער לא משנה מחיר נעול
  await T.type(T.byId('cp-param-exchangeRate'), 4.2);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(shownSales(3).join(',') === '9000,7000,1234', `שינוי שער שינה מחיר נעול/ידני: ${shownSales(3).join(',')}`);
  // שורה נעולה לא ניתנת להקלדה (readOnly), ושום כתיבה לא שמרה עליה מחיר ידני
  T.check(JSON.stringify(proj('P5').salePriceOverrides) === JSON.stringify({ 'L:c3': 1234 }) && proj('P5').products[0].lockedSaleILS === 9000, `עריכה של שורה נעולה נשמרה: ${JSON.stringify(proj('P5').salePriceOverrides)}`);
  T.check((await morningTestPrices()) === '9000,7000,1234', 'Morning לא מחייב לפי המחיר הנעול');
  await T.click(T.byId('cp-pdf-open'));
  const pdf = [0, 1, 2].map(i => T.byId(`cp-pdf-sale-${i}`));
  T.check(pdf.map(x => x?.value).join(',') === '9000,7000,1234' && pdf[0].readOnly && !pdf[2].readOnly, `חלון ה-PDF: ${pdf.map(x => x?.value).join(',')}`);
  await T.click(T.byId('cp-pdf-cancel'));

  // =====================================================================
  T.describe('2. מחיר ידני לפי מזהה שורה');
  await T.type(T.byId('cp-row-sale-2'), 1500);
  await T.sleep(AUTOSAVE_WAIT);
  T.check(JSON.stringify(proj('P5').salePriceOverrides) === JSON.stringify({ 'L:c3': 1500 }), `מחיר ידני לא נשמר לפי מזהה: ${JSON.stringify(proj('P5').salePriceOverrides)}`);
  // סנכרון חיצוני (Bar Planner / מכשיר אחר) מסיר את השורה הראשונה: המחיר הידני נשאר על המדף
  await act(async () => { await T.api().updateDoc(T.api().doc(null, 'crm_custom_projects', 'P5'), { products: [BP_LINES[1], BP_LINES[2]] }); });
  await T.flush(8);
  T.check(shownSales(2).join(',') === '7000,1500', `אחרי הסרת שורה מבחוץ המחירים זזו לשורה הלא נכונה: ${shownSales(2).join(',')}`);
  T.check((await morningTestPrices()) === '7000,1500', 'Morning אחרי הסרת שורה מבחוץ מחייב מחירים לא נכונים');
  // מחיקה מהמסך: המחיר של השורה שנמחקה יורד, האחרים לא זזים
  await T.type(T.byId('cp-row-sale-1'), 1600);
  await T.click(T.byId('cp-row-delete-0'));
  await T.sleep(AUTOSAVE_WAIT);
  T.check(proj('P5').products.length === 1 && proj('P5').products[0].lineId === 'c3', 'מחיקת שורה לא נשמרה');
  T.check(JSON.stringify(proj('P5').salePriceOverrides) === JSON.stringify({ 'L:c3': 1600 }), `אחרי מחיקה: ${JSON.stringify(proj('P5').salePriceOverrides)}`);
  // שורה חדשה מקבלת מזהה
  await T.click(T.buttonByText('הוסף פריט', detail()));
  await T.sleep(AUTOSAVE_WAIT);
  const ids = proj('P5').products.map(p => p.lineId);
  T.check(ids.length === 2 && ids.every(Boolean) && new Set(ids).size === 2, `שורה חדשה בלי מזהה ייחודי: ${JSON.stringify(ids)}`);

  // =====================================================================
  T.describe('3. פרויקט ישן עובר למזהי שורות בלי לאבד מחירים');
  T.check(await openDetail('P6'), 'הפרויקט הישן לא נפתח');
  await T.flush(6);
  const P6 = proj('P6');
  const legacyIds = P6.products.map(p => p.lineId);
  T.check(legacyIds.every(Boolean) && new Set(legacyIds).size === 3, `לא נוספו מזהי שורות: ${JSON.stringify(legacyIds)}`);
  T.check(JSON.stringify(P6.salePriceOverrides) === JSON.stringify({ [`L:${legacyIds[1]}`]: 555, [`L:${legacyIds[2]}`]: 777 }), `המחירים הישנים לא עברו למזהים: ${JSON.stringify(P6.salePriceOverrides)}`);
  const legacyShown = shownSales(3);
  T.check(legacyShown[1] === '555' && legacyShown[2] === '777', `אחרי המעבר המסך מציג: ${legacyShown.join(',')}`);
  T.check(P6.products.map(p => p.id).join(',') === 'X1,X2,X3', 'המעבר שינה את סדר/תוכן המוצרים');

  T.check(!globalThis.__unhandled, `היו ${globalThis.__unhandled} שגיאות לא מטופלות`);
  T.finish();
})().catch(T.crash);
