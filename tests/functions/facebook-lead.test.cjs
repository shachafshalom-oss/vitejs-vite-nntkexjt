// פונקציית facebook-lead: webhook של Meta Lead Ads → crm_customers.
// אימות כתובת, חתימה, שמירה לפני תשובה, שליפה מ-Graph (מדומה), בלי כפילויות, קמפיין, round-robin,
// כפילות לפי טלפון, אינסטגרם, וכשל בשליפה — מול Firestore מדומה (firebase-admin).
const crypto = require('crypto');
const T = require('../harness/checks.cjs');
const admin = require('firebase-admin/app'); // מוחלף במוק ע"י ה-runner
const store = () => globalThis.__admin.store;

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test', private_key: 'x\\ny', client_email: 'x@test' });
process.env.FB_VERIFY_TOKEN = 'verify-123';
process.env.FB_APP_SECRET = 'app-secret';
process.env.FB_PAGE_ACCESS_TOKEN = 'page-token';
process.env.FB_PAGE_ID = 'PAGE1';
delete process.env.META_GRAPH_VERSION;

const { handler } = require('../../netlify/functions/facebook-lead.js');

// --- Graph API מדומה ---
const LEADS = {};
const graphCalls = [];
globalThis.fetch = async (url, opts) => {
  graphCalls.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
  const id = decodeURIComponent(String(url).split('?')[0].split('/').pop());
  const lead = LEADS[id];
  if (!lead) return { ok: false, status: 400, json: async () => ({ error: { message: 'Unsupported get request', code: 100 } }) };
  return { ok: true, status: 200, json: async () => lead };
};

const sign = (body, secret = 'app-secret') => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
const post = (payload, { secret, badSig, rawOverride } = {}) => {
  const body = rawOverride || JSON.stringify(payload);
  return handler({ httpMethod: 'POST', headers: { 'x-hub-signature-256': badSig || sign(body, secret) }, body });
};
const webhook = (ids, page = 'PAGE1') => ({ object: 'page', entry: [{ id: page, time: 1, changes: ids.map(id => ({ field: 'leadgen', value: { leadgen_id: id, page_id: page, form_id: 'FORM1', ad_id: 'AD1', created_time: 1 } })) }] });
const fd = (o) => Object.entries(o).map(([name, v]) => ({ name, values: [v] }));
const cust = (id) => store().crm_customers[id];

(async () => {
  admin.__reset && admin.__reset();
  store().crm_customers = {
    OLD: { status: 'active', businessName: 'לקוח ותיק', phone: '0525551234', assignedTo: 'danielyos205@gmail.com' },
    D2: { status: 'lead', phone: '0500000002', assignedTo: 'danielyos205@gmail.com' },
  };
  store().crm_campaigns = { C_MAN: { name: 'קמפיין ידני', metaCampaignId: '120000000000001' } };

  T.describe('1. אימות הכתובת מול Meta (GET)');
  const ok = await handler({ httpMethod: 'GET', queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-123', 'hub.challenge': 'CH42' } });
  T.check(ok.statusCode === 200 && ok.body === 'CH42', `challenge תקין: ${ok.statusCode} ${ok.body}`);
  const bad = await handler({ httpMethod: 'GET', queryStringParameters: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'CH42' } });
  T.check(bad.statusCode === 403, 'verify token שגוי נדחה');
  T.check((await handler({ httpMethod: 'PUT' })).statusCode === 405, 'מתודה לא נתמכת');

  T.describe('2. חתימה');
  T.check((await post(webhook(['L1']), { badSig: 'sha256=' + 'a'.repeat(64) })).statusCode === 403, 'חתימה מזויפת נדחית');
  T.check((await post(webhook(['L1']), { secret: 'other-secret' })).statusCode === 403, 'חתימה בסוד אחר נדחית');
  T.check((await handler({ httpMethod: 'POST', headers: {}, body: '{}' })).statusCode === 403, 'בלי חתימה נדחה');
  T.check(!store().crm_meta_lead_events && Object.keys(store().crm_customers).length === 2, 'בקשה שנדחתה לא כתבה כלום');

  T.describe('3. ליד תקין מפייסבוק');
  LEADS.L1 = {
    id: 'L1', created_time: '2026-10-31T19:00:00+0000', platform: 'fb', is_organic: false,
    campaign_id: '120000000000002', campaign_name: 'קמפיין לידים 11.26', adset_name: 'ברים ת"א', ad_id: 'AD1', ad_name: 'וידאו Prime', form_id: 'FORM1',
    field_data: fd({ full_name: 'אבי כהן', phone_number: '+972 52-777-0001', email: 'avi@bar.co.il', 'סוג_העסק': 'בר', 'מתי_פותחים?': 'תוך חודש' }),
  };
  const r1 = await post(webhook(['L1']));
  T.check(r1.statusCode === 200, `ליד תקין: ${r1.statusCode} ${r1.body}`);
  const c1 = cust('fb_L1') || {};
  T.check(c1.status === 'lead' && c1.leadStage === 'new' && c1.source === 'facebook' && c1.businessType === 'bar', `שדות בסיס: ${JSON.stringify(c1).slice(0, 200)}`);
  T.check(c1.contactName === 'אבי כהן' && c1.businessName === 'אבי כהן' && c1.phone === '0527770001' && c1.email === 'avi@bar.co.il', 'שם, טלפון מנורמל ואימייל (כמו בייבוא הידני)');
  T.check(c1.metaPlatform === 'fb' && c1.metaLeadgenId === 'L1' && c1.createdAt === '2026-10-31T19:00:00.000Z', 'פלטפורמה, מזהה ליד ותאריך הליד המקורי');
  T.check(c1.notes.includes('סוג העסק: בר') && c1.notes.includes('מתי פותחים?: תוך חודש'), `שאלות נוספות בטופס נכנסות להערות: ${c1.notes}`);
  T.check(c1.assignedTo === 'shachafshalom@gmail.com', `round-robin: לשחף 0 מול 2 לדניאל → שחף: ${c1.assignedTo}`);
  T.check(c1.possibleDuplicateOfId === null && Array.isArray(c1.interactionLogs) && !('pushSentAt' in c1), 'בלי כפילות, יומן ריק, ופוש יישלח ע"י lead-notifier');
  T.check(c1.campaignId === 'meta_120000000000002' && store().crm_campaigns.meta_120000000000002?.name === 'קמפיין לידים 11.26' && store().crm_campaigns.meta_120000000000002?.autoCreated, 'קמפיין חדש נוצר ומקושר');
  T.check(c1.attribution.adset_name === 'ברים ת"א' && c1.attribution.ad_name === 'וידאו Prime' && c1.attribution.form_id === 'FORM1', 'ייחוס: קבוצת מודעות, מודעה, טופס');
  const ev1 = store().crm_meta_lead_events.L1;
  T.check(ev1.status === 'done' && ev1.customerId === 'fb_L1' && ev1.pageId === 'PAGE1', `אירוע נשמר ונסגר: ${JSON.stringify(ev1)}`);
  T.check(graphCalls[0].url.includes('/v26.0/L1?') && graphCalls[0].url.includes('appsecret_proof=') && graphCalls[0].auth === 'Bearer page-token', 'Graph v26.0, Page token בכותרת, appsecret_proof');
  T.check(!graphCalls[0].url.includes('page-token'), 'הטוקן לא מופיע בכתובת (לא נרשם בלוגים)');

  T.describe('4. אותו ליד נשלח שוב — בלי כפילות');
  const before = Object.keys(store().crm_customers).length;
  const callsBefore = graphCalls.length;
  T.check((await post(webhook(['L1']))).statusCode === 200, 'שליחה חוזרת מקבלת 200');
  T.check(Object.keys(store().crm_customers).length === before && graphCalls.length === callsBefore, 'לא נוצר כרטיס שני ולא נשלפה שוב');

  T.describe('5. אינסטגרם, קמפיין קיים וכפילות לפי טלפון');
  LEADS.L2 = { id: 'L2', created_time: '2026-10-31T19:05:00+0000', platform: 'ig', campaign_id: '120000000000001', campaign_name: 'שם אחר', field_data: fd({ first_name: 'רונית', last_name: 'לוי', phone_number: '052-555-1234' }) };
  T.check((await post(webhook(['L2']))).statusCode === 200, 'ליד מאינסטגרם התקבל');
  const c2 = cust('fb_L2') || {};
  T.check(c2.metaPlatform === 'ig' && c2.source === 'facebook' && c2.contactName === 'רונית לוי', `אינסטגרם: מקור פייסבוק/אינסטגרם, פלטפורמה ig, שם מפרטי+משפחה: ${c2.contactName}`);
  T.check(c2.campaignId === 'C_MAN', 'קמפיין שכבר קיים ב-CRM (לפי מזהה Meta) מקושר ולא נוצר כפול');
  T.check(c2.possibleDuplicateOfId === 'OLD', 'טלפון של לקוח קיים מסומן ככפילות אפשרית (לא חוסם)');
  T.check(c2.assignedTo === 'shachafshalom@gmail.com', `round-robin שני: שחף 1 מול 2 → שחף: ${c2.assignedTo}`);

  T.describe('6. כשל בשליפה — האירוע נשמר לרשת הביטחון');
  const r3 = await post(webhook(['L3_MISSING']));
  T.check(r3.statusCode === 200, 'כשל בשליפה לא מחזיר שגיאה ל-Meta (האירוע שמור)');
  const ev3 = store().crm_meta_lead_events.L3_MISSING;
  T.check(ev3.status === 'error' && ev3.attempts === 1 && ev3.error.includes('Graph 400'), `אירוע במצב שגיאה עם ניסיון אחד: ${JSON.stringify(ev3)}`);
  T.check(!cust('fb_L3_MISSING'), 'לא נוצר ליד ריק');
  LEADS.L3_MISSING = { id: 'L3_MISSING', platform: 'fb', field_data: fd({ full_name: 'דנה', phone_number: '0501112233' }) };
  await post(webhook(['L3_MISSING']));
  T.check(store().crm_meta_lead_events.L3_MISSING.status === 'done' && !!cust('fb_L3_MISSING'), 'שליחה חוזרת של Meta משלימה אירוע שנכשל');

  T.describe('7. סינון ומצבים מיוחדים');
  T.check((await post(webhook(['LX'], 'OTHER_PAGE'))).statusCode === 200 && !store().crm_meta_lead_events.LX, 'ליד מדף אחר מתעלמים ממנו');
  T.check((await post({ object: 'instagram', entry: [] })).statusCode === 200, 'אובייקט שאינו page — 200 בלי עיבוד');
  const multi = await post(webhook(['L4', 'L5']));
  LEADS.L4 = LEADS.L5 = undefined;
  T.check(multi.statusCode === 200 && store().crm_meta_lead_events.L4 && store().crm_meta_lead_events.L5, 'כמה לידים בהודעה אחת — כולם נשמרים');
  const saved = process.env.FB_APP_SECRET;
  delete process.env.FB_APP_SECRET;
  T.check((await post(webhook(['L6']))).statusCode === 503, 'לפני שלב 0 (בלי App Secret) — הכול נדחה');
  process.env.FB_APP_SECRET = saved;
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  LEADS.L7 = { id: 'L7', field_data: fd({ full_name: 'ללא טוקן', phone_number: '0500000777' }) };
  await post(webhook(['L7']));
  T.check(store().crm_meta_lead_events.L7?.status === 'error' && store().crm_meta_lead_events.L7.error.includes('FB_PAGE_ACCESS_TOKEN'), 'בלי Page token — האירוע נשמר עם שגיאה ברורה');

  T.finish();
})().catch(T.crash);
