// פונקציית morning-proxy: שידור דרישת תשלום ל-Morning (חשבונית ירוקה).
// ב-14.10.2026 Morning חסמה את תשתית ה-API הישנה והחליפה את האימות ל-OAuth 2.0:
//   POST https://api.morning.co/idp/v1/oauth/token  עם {grant_type, client_id, client_secret}
//   התשובה: {accessToken, tokenType, expiresAt}   (במקום {token} מהבקשה הישנה {id, secret})
// הבדיקה הזו מדמה את Morning החדשה: מי שפונה בפורמט הישן מקבל 404 ריק — בדיוק מה שקרה בייצור.
const T = require('../harness/checks.cjs');

const TOKEN_URL = 'https://api.morning.co/idp/v1/oauth/token';
const DOCS_URL = 'https://api.greeninvoice.co.il/api/v1/documents';
const KEY_ID = 'client-id-123';
const KEY_SECRET = 'super-secret-value';
const GOOD_TOKEN = 'jwt.access.token';

const { handler } = require('../../netlify/functions/morning-proxy.js');

const json = (status, obj) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(obj),
});
const empty = (status) => ({ ok: false, status, text: async () => '' });

let calls = [];
let tokenMode = 'ok'; // ok | invalid_client | unauthorized_client | invalid_grant | down
let docsMode = 'ok';  // ok | errors | no-url

globalThis.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: String(url), method: opts.method, headers: opts.headers || {}, body });

  if (String(url) === TOKEN_URL) {
    if (opts.method !== 'POST') return empty(405);
    if (tokenMode === 'down') return empty(404);
    if (!body || body.grant_type !== 'client_credentials') return json(400, { error: 'invalid_request', error_description: 'Missing grant_type parameter' });
    if (tokenMode === 'invalid_client') return json(401, { error: 'invalid_client', error_description: 'Missing or incorrect client_id/client_secret' });
    if (tokenMode === 'unauthorized_client') return json(400, { error: 'unauthorized_client', error_description: 'No active subscription' });
    if (tokenMode === 'invalid_grant') return json(400, { error: 'invalid_grant', error_description: 'API key privilege is expired, revoked, or pending' });
    if (body.client_id !== KEY_ID || body.client_secret !== KEY_SECRET) return json(401, { error: 'invalid_client' });
    return json(200, { accessToken: GOOD_TOKEN, tokenType: 'Bearer', expiresAt: 1771317327 });
  }

  if (String(url) === DOCS_URL) {
    const auth = (opts.headers || {}).Authorization;
    if (auth !== `Bearer ${GOOD_TOKEN}`) return json(401, { errorMessage: 'unauthorized' });
    if (docsMode === 'errors') return json(400, [{ code: 1105, message: 'שדה חסר' }, { code: 1106, message: 'סכום שגוי' }]);
    if (docsMode === 'no-url') return json(201, { id: 'doc-1', number: 40034 });
    return json(201, { id: 'doc-1', number: 40034, url: { origin: 'https://m/origin.pdf', he: 'https://m/he.pdf', en: 'https://m/en.pdf' } });
  }

  // כתובת ישנה/לא מוכרת: 404 ריק, כמו ה-gateway של Morning אחרי החסימה
  return empty(404);
};

const call = (payload, method = 'POST') => handler({ httpMethod: method, body: JSON.stringify(payload) });
const docBody = { type: 300, lang: 'he', currency: 'ILS', vatType: 0, income: [{ description: 'עמדה', quantity: 1, price: 9500 }] };
const parse = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

(async () => {
  T.describe('1. קלט');
  T.check((await call({}, 'GET')).statusCode === 405, 'GET לא נחסם ב-405');
  const noKeys = parse(await call({ body: docBody }));
  T.check(/מפתחות/.test(noKeys.error || ''), `חסרים מפתחות: ציפינו להודעה בעברית, התקבל ${JSON.stringify(noKeys)}`);
  T.check(calls.length === 0, 'בלי מפתחות נשלחה בקשה ל-Morning');

  T.describe('2. אימות OAuth 2.0 ושידור מוצלח');
  calls = []; tokenMode = 'ok'; docsMode = 'ok';
  const ok = await call({ body: docBody, keyId: KEY_ID, keySecret: KEY_SECRET });
  const okBody = parse(ok);
  T.check(ok.statusCode === 200 && okBody.status === 1 && okBody.data === 'https://m/he.pdf', `שידור תקין נכשל: ${ok.statusCode} ${ok.body}`);
  const tokenCall = calls.find((c) => c.url === TOKEN_URL);
  T.check(!!tokenCall, 'לא נשלחה בקשת אימות לכתובת החדשה api.morning.co/idp/v1/oauth/token');
  T.check(tokenCall && tokenCall.method === 'POST' && /application\/json/.test(tokenCall.headers['Content-Type'] || ''), 'בקשת האימות חייבת להיות POST עם Content-Type: application/json');
  T.check(tokenCall && tokenCall.body.grant_type === 'client_credentials' && tokenCall.body.client_id === KEY_ID && tokenCall.body.client_secret === KEY_SECRET, 'גוף בקשת האימות שגוי (grant_type / client_id / client_secret)');
  T.check(tokenCall && tokenCall.body.id === undefined && tokenCall.body.secret === undefined, 'נשלחו שדות id/secret הישנים');
  const docCall = calls.find((c) => c.url === DOCS_URL);
  T.check(!!docCall && docCall.headers.Authorization === `Bearer ${GOOD_TOKEN}`, 'קריאת יצירת המסמך לא נשלחה עם Bearer של ה-accessToken');
  T.check(docCall && JSON.stringify(docCall.body) === JSON.stringify(docBody), 'גוף המסמך הועבר ל-Morning בשינוי');
  T.check(calls.length === 2, `צפויות בדיוק 2 קריאות (אימות + מסמך), נשלחו ${calls.length}`);

  T.describe('3. כשלי אימות — הודעות ברורות, בלי סודות, ובלי ליצור מסמך');
  for (const [mode, needle] of [['invalid_client', /invalid_client/], ['unauthorized_client', /unauthorized_client/], ['invalid_grant', /invalid_grant/]]) {
    calls = []; tokenMode = mode;
    const r = await call({ body: docBody, keyId: KEY_ID, keySecret: KEY_SECRET });
    const b = parse(r);
    T.check(typeof b.error === 'string' && b.error.startsWith('אימות מול Morning נכשל'), `${mode}: ההודעה לא פותחת ב"אימות מול Morning נכשל": ${r.body}`);
    T.check(needle.test(b.error || '') && /[א-ת]{3,}/.test((b.error || '').replace('אימות מול Morning נכשל', '')), `${mode}: חסר קוד השגיאה או הסבר בעברית: ${b.error}`);
    T.check(!(r.body || '').includes(KEY_SECRET), `${mode}: ה-secret דלף לתשובה`);
    T.check(!calls.some((c) => c.url === DOCS_URL), `${mode}: נשלחה קריאת מסמך למרות כשל אימות`);
  }

  T.describe('4. כתובת האימות לא זמינה (404 ריק)');
  calls = []; tokenMode = 'down';
  const down = await call({ body: docBody, keyId: KEY_ID, keySecret: KEY_SECRET });
  const downBody = parse(down);
  T.check(/404/.test(downBody.error || '') && /api\.morning\.co/.test(downBody.error || ''), `404 ריק חייב להציג סטטוס וכתובת, התקבל: ${downBody.error}`);
  T.check(!(down.body || '').includes(KEY_SECRET), '404: ה-secret דלף לתשובה');

  T.describe('5. כשלי יצירת מסמך');
  calls = []; tokenMode = 'ok'; docsMode = 'errors';
  const bad = parse(await call({ body: docBody, keyId: KEY_ID, keySecret: KEY_SECRET }));
  T.check(/שגיאת Morning ביצירת מסמך/.test(bad.error || '') && /1105/.test(bad.error) && /סכום שגוי/.test(bad.error), `שגיאות Morning ביצירת מסמך לא הוצגו: ${bad.error}`);
  docsMode = 'no-url';
  const noUrl = parse(await call({ body: docBody, keyId: KEY_ID, keySecret: KEY_SECRET }));
  T.check(/המסמך נוצר ב-Morning אך לא התקבל קישור/.test(noUrl.error || ''), `מסמך בלי url צריך להתריע שנוצר: ${noUrl.error}`);

  T.finish();
})().catch(T.crash);
