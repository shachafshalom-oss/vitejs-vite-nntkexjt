// פונקציית calendar-link: קישור היומן נמסר רק לנציג מחובר, ורק הקישור שלו.
// רקע: הקישורים היו קבועים בקוד הפרונט, שנטען לכל מבקר באתר עוד לפני התחברות — כל מי שחיפש
// בקוד יכול היה לפתוח את פיד הלידים (שמות, טלפונים, הערות). הבדיקה האחרונה מוודאת שלא יחזרו לשם.
//
// מזהה ההתחברות נבדק כמו ש-Firebase מנפיק אותו: JWT בחתימת RS256. כאן נוצר זוג מפתחות לבדיקה,
// ו-fetch של המפתחות הציבוריים של Google מוחלף במפתח הבדיקה.
// בלי firebase-admin/auth: בגרסה הראשונה הפונקציה קרסה ב-Netlify (502) בטעינת המודול הזה.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('../harness/checks.cjs');

const PROJECT = 'ds-logistics-crm';
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT, private_key: 'x', client_email: 'x@test' });
process.env.CALENDAR_FEED_TOKENS = JSON.stringify({
  'tok-sh': { email: 'shachafshalom@gmail.com', name: 'שחף' },
  'tok-dn': { email: 'danielyos205@gmail.com', name: 'דניאל' },
});
process.env.URL = 'https://dslogistic.netlify.app';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pub = publicKey.export({ type: 'spki', format: 'pem' });
let certFetches = 0;
globalThis.fetch = async (url) => {
  certFetches++;
  if (!String(url).includes('securetoken@system.gserviceaccount.com')) throw new Error('unexpected fetch ' + url);
  return { ok: true, json: async () => ({ k1: pub }), headers: { get: () => 'public, max-age=3600' } };
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(over = {}, { key = privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'u1', auth_time: now - 60, iat: now - 60, exp: now + 3000, email: 'ShachafShalom@gmail.com', ...over };
  const head = b64({ alg, kid, typ: 'JWT' });
  const body = b64(claims);
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const fn = require('../../netlify/functions/calendar-link.js');
const call = (auth, method = 'POST') => fn.handler({ httpMethod: method, headers: auth ? { authorization: auth } : {} });
const json = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

(async () => {
  T.describe('1. הרשאות');
  T.check((await call('Bearer ' + idToken(), 'GET')).statusCode === 405, 'GET לא נחסם ב-405');
  T.check((await call('')).statusCode === 401, 'בקשה בלי התחברות לא נחסמה ב-401');
  T.check((await call('Bearer forged')).statusCode === 401, 'מזהה שאינו JWT לא נחסם ב-401');
  T.check((await call('Bearer ' + idToken({}, { key: other.privateKey }))).statusCode === 401, 'מזהה חתום במפתח זר התקבל');
  T.check((await call('Bearer ' + idToken({ aud: 'another-project' }))).statusCode === 401, 'מזהה של פרויקט Firebase אחר התקבל');
  T.check((await call('Bearer ' + idToken({ iss: 'https://evil.example' }))).statusCode === 401, 'מזהה עם מנפיק זר התקבל');
  T.check((await call('Bearer ' + idToken({ exp: Math.floor(Date.now() / 1000) - 3600 }))).statusCode === 401, 'מזהה שפג תוקפו התקבל');
  T.check((await call('Bearer ' + idToken({}, { kid: 'nope' }))).statusCode === 401, 'מזהה עם מפתח לא מוכר התקבל');
  T.check((await call('Bearer ' + idToken({}, { alg: 'none' }))).statusCode === 401, 'מזהה בלי חתימה (alg none) התקבל');
  const tampered = idToken().split('.');
  tampered[1] = b64({ ...JSON.parse(Buffer.from(tampered[1], 'base64url')), email: 'danielyos205@gmail.com' });
  T.check((await call('Bearer ' + tampered.join('.'))).statusCode === 401, 'מזהה שהמייל בו שונה אחרי החתימה התקבל');
  T.check((await call('Bearer ' + idToken({ email: 'someone@else.com' }))).statusCode === 404, 'משתמש שאינו נציג קיבל קישור');

  T.describe('2. הקישור הנכון');
  const r = await call('Bearer ' + idToken());
  const b = json(r);
  T.check(r.statusCode === 200 && b.name === 'שחף', 'שחף לא קיבל את הקישור שלו');
  T.check(b.url === 'https://dslogistic.netlify.app/.netlify/functions/calendar-feed?t=tok-sh', 'כתובת הקישור שגויה');
  T.check(!r.body.includes('tok-dn'), 'הקישור של דניאל נמסר לשחף');
  T.check(r.headers['Cache-Control'] === 'no-store', 'התשובה ניתנת לשמירה במטמון');
  T.check(certFetches === 1, `המפתחות של Google לא נשמרו במטמון (${certFetches} הורדות)`);

  T.describe('3. אין קישורי יומן בקוד הפרונט, והפונקציה לא תלויה ב-firebase-admin/auth');
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/App.tsx'), 'utf8');
  T.check(!/calendar-feed\?t=/.test(src), 'קישור יומן עם טוקן חזר לקוד הפרונט (נטען לכל מבקר באתר)');
  const fnSrc = fs.readFileSync(path.resolve(__dirname, '../../netlify/functions/calendar-link.js'), 'utf8');
  T.check(!/require\(['"]firebase-admin/.test(fnSrc), 'calendar-link טוען שוב את firebase-admin (קרס ב-Netlify)');

  T.finish();
})().catch(T.crash);
