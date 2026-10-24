// הסכם תכנון ו-Bar Planner — התהליך מתחיל בליד:
//  • "שלח הסכם תכנון" בתיק הליד פותח את Bar Planner להפקת ההסכם (#/agreement?lead=<id>) — בלי פרויקט.
//  • חתימה בקישור (bp_shares/<token>/signatures/<n>) נרשמת בליד כשהתיק נפתח.
//  • "התקבלו דמי תכנון": דרישת תשלום אחת ל-Morning (לבדיקה לפני חשבונית מס) ← הליד מסומן ששולם
//    ← נפתח פרויקט קסטום (בלי שורות, מקדמה 50%, דמי התכנון כהכנסה) ← כפתור לפתיחת התכנון.
//  • כשל ב-Morning: לא מסומן תשלום ולא נפתח פרויקט.
//  • בפרויקט עצמו דמי התכנון לקריאה בלבד — אין שם כפתור תשלום.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com';
const PLANNER = 'https://steelandspirit-bar-planner.netlify.app';
T.freezeTime('2026-10-24T09:00:00.000Z');

const morningCalls = [];
let morningFails = false;
globalThis.fetch = window.fetch = async (url, opts) => {
  T.ui.fetches.push({ url: String(url), opts });
  if (String(url).includes('morning-proxy')) {
    morningCalls.push(JSON.parse(opts.body).body);
    const payload = morningFails ? { errorCode: 2401, errorMessage: 'בדיקה: Morning סירב' } : { status: 1, data: `https://morning.test/doc/${morningCalls.length}` };
    return { ok: !morningFails, status: morningFails ? 400 : 200, text: async () => JSON.stringify(payload), json: async () => payload };
  }
  return { ok: false, status: 503, text: async () => 'network disabled in tests', json: async () => ({}) };
};

const PARAMS = { exchangeRate: 3.774, containerShippingUSD: 0, customsPercent: 0, portFeesILS: 0, localTransportILS: 0, installationILS: 0 };
const AGREEMENT = { token: 'tokA1234567890abcdef', url: `${PLANNER}/#/v/tokA1234567890abcdef`, n: 2, feeIls: 2500, vatPct: 18, totalIls: 2950, sentAt: '2026-10-22T10:00:00.000Z' };
const lead = (extra) => ({ status: 'lead', leadStage: 'new', assignedTo: SH, interactionLogs: [], createdAt: '2026-10-01T10:00:00.000Z', ...extra });

T.seed({
  crm_settings: { general_settings: { models: {}, morningApiKeyId: 'kid', morningApiKeySecret: 'ksecret' } },
  crm_customers: {
    C1: lead({ businessName: 'בר על הגג', companyName: 'גג בע"מ', hp: '512345678', contactName: 'מאיה', phone: '0541234567', designAgreement: AGREEMENT }),
    C2: lead({ businessName: 'פאב חדש', contactName: 'דנה', phone: '0521111111' }),
    C3: lead({ businessName: 'בר נכשל', contactName: 'רון', phone: '0531111111', designAgreement: { ...AGREEMENT, token: 'tokC3xxxxxxxxxxxxxxxx', n: 1 } }),
  },
  'bp_shares/tokA1234567890abcdef/signatures': { 2: { version: 2, name: 'מאיה כהן', signedAt: 1761300000000, docHash: 'ab'.repeat(32) } },
  crm_custom_projects: {
    P2: { name: 'פרויקט רגיל', clientName: 'בר על הגג', customerId: 'C1', date: '2026-10-20', status: 'preparation', params: PARAMS, marginPercent: 30, products: [], salePriceOverrides: {}, notes: '', createdAt: '2026-10-20T10:00:00.000Z' },
  },
});
T.setNav('sales', 'leads');

const cust = (id) => T.docs('crm_customers')[id];
const projects = () => T.docs('crm_custom_projects');
const detail = () => T.byId('cp-detail-close')?.closest('.fixed');
async function openLead(name) {
  if (T.byId('lead-panel-close')) await T.click(T.byId('lead-panel-close'));
  const row = T.allById('lead-row').find((r) => r.textContent.includes(name));
  if (row) await T.click(row);
  await T.flush(8);
  return !!T.byId('lead-design');
}
async function openDetail(id) {
  if (detail()) await T.click(T.byId('cp-detail-close'));
  await T.click(T.byId(`cp-status-${id}`).closest('[data-testid="cp-card"]'));
  await T.flush(6);
  return !!detail();
}

(async () => {
  await T.mountApp(App);

  // =====================================================================
  T.describe('1. ליד בלי הסכם — שליחה פותחת את Bar Planner, בלי פרויקט');
  T.check(await openLead('פאב חדש'), 'אין אזור "הסכם תכנון" בתיק הליד');
  T.check(!T.byId('customer-panel-barplanner'), 'הכפתור הישן "פתח ב-Bar Planner" עדיין בתיק הליד');
  let opened = T.ui.opened.length;
  await T.click(T.byId('lead-design-send'));
  T.check(T.ui.opened.slice(opened).includes(`${PLANNER}/#/agreement?lead=C2`), `נפתח: ${T.ui.opened.slice(opened).join(' | ')}`);
  T.check(Object.keys(projects()).length === 1, 'שליחת הסכם פתחה פרויקט');
  T.check(!T.byId('lead-design-paid'), 'כפתור תשלום מופיע לפני שנשלח הסכם');

  // =====================================================================
  T.describe('2. חתימה בקישור נרשמת בליד');
  T.check(await openLead('בר על הגג'), 'תיק הליד לא נפתח');
  await T.flush(10);
  const da1 = cust('C1').designAgreement;
  T.check(da1.signedAt === 1761300000000 && da1.signerName === 'מאיה כהן' && da1.docHash === 'ab'.repeat(32), `החתימה לא נרשמה בליד: ${JSON.stringify(da1)}`);
  T.check((T.byId('lead-design-state')?.textContent || '').includes('נחתם ✓'), `מצב ההסכם: ${T.byId('lead-design-state')?.textContent}`);
  T.check(da1.token === AGREEMENT.token && da1.n === 2 && da1.feeIls === 2500, 'רישום החתימה דרס את פרטי ההסכם');

  // =====================================================================
  T.describe('3. "התקבלו דמי תכנון": Morning ← שולם ← פרויקט');
  T.answerConfirms(true);
  await T.click(T.byId('lead-design-paid'));
  await T.flush(12);
  T.ui.confirmAnswers.length = 0;
  T.check(morningCalls.length === 1, `מספר שידורים ל-Morning: ${morningCalls.length}`);
  const income = morningCalls[0]?.income || [];
  T.check(income.length === 1 && income[0].price === 2500 && income[0].quantity === 1 && String(income[0].description).includes('תכנון'), `שורות המסמך: ${JSON.stringify(income)}`);
  T.check(morningCalls[0]?.type === 300, `סוג המסמך: ${morningCalls[0]?.type} (צפוי חשבון עסקה 300)`);
  const da2 = cust('C1').designAgreement;
  T.check(String(da2.paidAt).startsWith('2026-10-24T') && da2.morningUrl === 'https://morning.test/doc/1', `הליד לא סומן ששולם: ${JSON.stringify(da2)}`);
  const newIds = Object.keys(projects()).filter((id) => id !== 'P2');
  T.check(newIds.length === 1 && da2.customProjectId === newIds[0], `פרויקט חדש: ${newIds.join(',')} · בליד: ${da2.customProjectId}`);
  const np = projects()[newIds[0]] || {};
  T.check(np.customerId === 'C1' && np.status === 'preparation' && Array.isArray(np.products) && np.products.length === 0, `הפרויקט החדש: ${JSON.stringify({ c: np.customerId, s: np.status, p: np.products })}`);
  T.check(np.depositType === 'percent' && np.depositValue === 50 && np.params?.customsPercent === 0, 'מקדמה 50% / מכס 0 בפרויקט החדש');
  T.check(np.designFee?.feeIls === 2500 && np.designFee?.agreementVersion === 2 && !!np.designFee?.paidAt && np.designFee?.morningUrl === 'https://morning.test/doc/1' && np.designFee?.signerName === 'מאיה כהן', `designFee: ${JSON.stringify(np.designFee)}`);
  T.check((np.bpDocuments || []).length === 1 && np.bpDocuments[0].kind === 'agreement' && np.bpDocuments[0].version === 2, `מסמכים: ${JSON.stringify(np.bpDocuments)}`);
  T.check(!T.byId('lead-design-paid'), 'כפתור התשלום נשאר אחרי שסומן');
  opened = T.ui.opened.length;
  await T.click(T.byId('lead-design-open'));
  T.check(T.ui.opened.slice(opened).includes(`${PLANNER}/#/new?cp=${newIds[0]}`), `פתיחת התכנון: ${T.ui.opened.slice(opened).join(' | ')}`);

  // =====================================================================
  T.describe('4. כשל ב-Morning — לא שולם, אין פרויקט');
  T.check(await openLead('בר נכשל'), 'תיק הליד לא נפתח');
  morningFails = true;
  T.answerConfirms(true, true);
  await T.click(T.byId('lead-design-paid'));
  await T.flush(12);
  morningFails = false;
  T.ui.confirmAnswers.length = 0;
  const da3 = cust('C3').designAgreement;
  T.check(!da3.paidAt && !da3.customProjectId && !!da3.morningError, `אחרי כשל: ${JSON.stringify(da3)}`);
  T.check(Object.keys(projects()).length === 2, `נפתח פרויקט למרות הכשל: ${Object.keys(projects()).length}`);
  T.check(T.ui.confirms.some((c) => c.includes('עוד לא נחתם')), 'אין אזהרה על הסכם שלא נחתם');
  await T.click(T.byId('lead-panel-close'));

  // =====================================================================
  T.describe('5. בפרויקט: דמי התכנון לקריאה, פתיחת התכנון');
  T.setNav('sales', 'custom_projects');
  await T.nav('custom_projects');
  await T.flush(6);
  T.check(await openDetail(newIds[0]), 'דוח הפרויקט החדש לא נפתח');
  const box = T.byId('cp-bp-box');
  T.check(!!box && T.amountShown(2500, T.byId('cp-bp-fee')) && box.textContent.includes('שולם ✓'), `תיבת התכנון: ${box?.textContent?.slice(0, 120)}`);
  T.check(!T.byId('cp-bp-design-send') && !T.byId('cp-bp-design-paid'), 'יש עדיין כפתור תשלום / סימון שולם בפרויקט');
  T.check((T.byId('cp-bp-docs')?.textContent || '').includes('הסכם שירות תכנון'), 'המסמך החתום לא מוצג');
  opened = T.ui.opened.length;
  await T.click(T.byId('cp-bp-open-new'));
  T.check(T.ui.opened.slice(opened).includes(`${PLANNER}/#/new?cp=${newIds[0]}`), 'הכפתור בפרויקט לא פותח את התכנון');
  // אחרי ש-Bar Planner פתח את הפרויקט: קישור ותג
  await T.api().updateDoc(T.api().doc({}, 'crm_custom_projects', newIds[0]), { barPlanner: { projectId: 'bp1', code: 'BP-2026-009', url: `${PLANNER}/#/p/bp1` } });
  await T.flush(6);
  T.check(T.byId('cp-bp-open')?.getAttribute('href') === `${PLANNER}/#/p/bp1`, 'אין קישור לתכנון אחרי שנפתח');
  await T.click(T.byId('cp-detail-close'));
  T.check((T.byId(`cp-bp-badge-${newIds[0]}`)?.textContent || '').includes('BP-2026-009') && !T.byId('cp-bp-badge-P2'), 'תג Bar Planner בכרטיס הפרויקט');
  T.check(await openDetail('P2'), 'הפרויקט הרגיל לא נפתח');
  T.check(!T.byId('cp-bp-box'), 'תיבת Bar Planner בפרויקט רגיל');

  T.finish();
})().catch(T.crash);
