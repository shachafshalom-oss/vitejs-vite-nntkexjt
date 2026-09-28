// פונקציית website-lead: ליד מטופס האתר → crm_customers.
// בודק את שכבות ההגנה (מפתח, דומיין, honeypot, הגבלת קצב, ולידציה), זיהוי כפילות לפי טלפון,
// שיוך נציג מאוזן, ושיוך קמפיין מטא — מול Firestore מדומה (firebase-admin).
const T = require('../harness/checks.cjs');
const admin = require('firebase-admin/app'); // מוחלף במוק ע"י ה-runner
const store = () => globalThis.__admin.store;

process.env.WEBSITE_LEAD_SECRET = 'site-key';
process.env.ALLOWED_ORIGIN = 'https://steelandspirit.com,https://www.steelandspirit.com';
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test', private_key: 'x\\ny', client_email: 'x@test' });
delete process.env.META_CAPI_TOKEN;

const { handler } = require('../../netlify/functions/website-lead.js');

let ipCounter = 1;
const call = (body, { key = 'site-key', origin = 'https://steelandspirit.com', method = 'POST', ip } = {}) => handler({
  httpMethod: method,
  headers: { origin, 'x-api-key': key, 'x-nf-client-connection-ip': ip || `10.0.0.${ipCounter++}`, 'user-agent': 'test' },
  body: JSON.stringify(body),
});
const leads = () => Object.entries(store().crm_customers || {}).map(([id, d]) => ({ id, ...d }));
const good = (over = {}) => ({ fullName: 'אבי כהן', phone: '052-555-1234', businessName: 'בר אבי', ...over });

(async () => {
  admin.__reset && admin.__reset();
  globalThis.__admin.store.crm_customers = {
    OLD: { status: 'active', businessName: 'לקוח ותיק', phone: '0525551234', assignedTo: 'danielyos205@gmail.com' },
    D2: { status: 'lead', phone: '0500000002', assignedTo: 'danielyos205@gmail.com' },
  };

  T.describe('1. שכבות הגנה');
  T.check((await call({}, { method: 'OPTIONS' })).statusCode === 204, 'OPTIONS (preflight) לא החזיר 204');
  T.check((await call({}, { method: 'GET' })).statusCode === 405, 'GET לא נחסם ב-405');
  T.check((await call(good(), { key: 'wrong' })).statusCode === 401, 'מפתח שגוי לא נחסם ב-401');
  T.check((await call(good(), { origin: 'https://evil.example' })).statusCode === 403, 'דומיין זר לא נחסם ב-403');
  const hp = await call(good({ website: 'http://spam' }));
  T.check(hp.statusCode === 200 && leads().length === 2, 'honeypot: בוט אמור לקבל 200 בלי שנכתב ליד');
  T.check((await call(good({ phone: '123' }))).statusCode === 400, 'טלפון לא תקין לא נחסם ב-400');
  T.check((await call(good({ fullName: '' }))).statusCode === 400, 'שם חסר לא נחסם ב-400');
  T.check(leads().length === 2, 'בקשה שנדחתה בכל זאת כתבה ליד');

  T.describe('2. ליד תקין, כפילות ושיוך נציג');
  const r = await call(good());
  const body = JSON.parse(r.body);
  T.check(r.statusCode === 200 && body.ok && body.id, `ליד תקין לא נשמר: ${r.statusCode} ${r.body}`);
  const L = store().crm_customers[body.id] || {};
  T.check(L.status === 'lead' && L.leadStage === 'new' && L.source === 'website' && L.phone === '0525551234', `שדות הליד שגויים: ${JSON.stringify(L)}`);
  T.check(L.possibleDuplicateOfId === 'OLD' && body.duplicate === true, 'פנייה חוזרת (אותו טלפון בפורמט אחר) לא זוהתה');
  T.check(L.assignedTo === 'shachafshalom@gmail.com', `שיוך נציג: לשחף 0 רשומות ולדניאל 2 — צפוי שחף, התקבל ${L.assignedTo}`);
  T.check(Array.isArray(L.interactionLogs) && L.capiStatus === 'skipped:no-token', 'יומן/סטטוס CAPI לא אותחלו');
  const r2 = JSON.parse((await call(good({ phone: '0529998888', fullName: 'שני' }))).body);
  const L2 = store().crm_customers[r2.id] || {};
  T.check(L2.possibleDuplicateOfId === null && r2.duplicate === false, 'טלפון חדש סומן בטעות ככפילות');
  T.check(L2.assignedTo === 'shachafshalom@gmail.com', 'שיוך נציג שני: עדיין לשחף פחות (1 מול 2)');
  const r3 = JSON.parse((await call(good({ phone: '0527776666' }))).body);
  T.check((store().crm_customers[r3.id] || {}).assignedTo === 'danielyos205@gmail.com' || (store().crm_customers[r3.id] || {}).assignedTo === 'shachafshalom@gmail.com', 'שיוך נציג שלישי לא תקין');

  T.describe('3. הגבלת קצב לפי IP');
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await call(good({ phone: `05400000${10 + i}` }), { ip: '9.9.9.9' })).statusCode);
  T.check(statuses.slice(0, 5).every(s => s === 200) && statuses[5] === 429, `5 פניות לשעה מותרות, השישית נחסמת: ${statuses.join(',')}`);
  const blockedDocs = Object.entries(store().crm_rate_limits || {}).filter(([, d]) => d.blockedCount);
  T.check(blockedDocs.length === 1 && blockedDocs[0][1].blockedCount === 1, 'החסימה לא נספרה פעם אחת במסמך של אותה כתובת');
  T.check(!JSON.stringify(store().crm_rate_limits).includes('9.9.9.9'), 'כתובת ה-IP נשמרה גלויה (צריכה להישמר כגיבוב בלבד)');

  T.describe('4. שיוך קמפיין מטא');
  const withUtm = (id, source = 'facebook') => good({ phone: `05811${String(ipCounter).padStart(5, '0')}`, attribution: { utm_source: source, utm_id: id, utm_campaign: 'קמפיין סתיו' } });
  const c1 = JSON.parse((await call(withUtm('120210000000001'))).body);
  const c2 = JSON.parse((await call(withUtm('120210000000001'))).body);
  const camp = (store().crm_campaigns || {})['meta_120210000000001'];
  T.check(camp && camp.name === 'קמפיין סתיו' && camp.autoCreated === true, 'קמפיין מטא חדש לא נוצר');
  T.check(Object.keys(store().crm_campaigns || {}).length === 1, 'אותו קמפיין נוצר פעמיים');
  T.check(store().crm_customers[c1.id].campaignId === 'meta_120210000000001' && store().crm_customers[c2.id].campaignId === 'meta_120210000000001', 'הלידים לא שויכו לקמפיין');
  const g = JSON.parse((await call(withUtm('555', 'google'))).body);
  const macro = JSON.parse((await call(withUtm('{{campaign.id}}'))).body);
  T.check(store().crm_customers[g.id].campaignId === '' && store().crm_customers[macro.id].campaignId === '', 'מקור לא-מטא או מאקרו לא מוחלף יצר/שייך קמפיין');
  T.check(Object.keys(store().crm_campaigns || {}).length === 1, 'נוצר קמפיין זבל');

  T.finish();
})().catch(T.crash);
