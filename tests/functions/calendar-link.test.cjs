// פונקציית calendar-link: קישור היומן נמסר רק לנציג מחובר, ורק הקישור שלו.
// רקע: הקישורים היו קבועים בקוד הפרונט, שנטען לכל מבקר באתר עוד לפני התחברות — כל מי שחיפש
// בקוד יכול היה לפתוח את פיד הלידים (שמות, טלפונים, הערות). הבדיקה האחרונה מוודאת שלא יחזרו לשם.
const fs = require('fs');
const path = require('path');
const T = require('../harness/checks.cjs');
require('firebase-admin/app').__reset();
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test', private_key: 'x', client_email: 'x@test' });
process.env.CALENDAR_FEED_TOKENS = JSON.stringify({
  'tok-sh': { email: 'shachafshalom@gmail.com', name: 'שחף' },
  'tok-dn': { email: 'danielyos205@gmail.com', name: 'דניאל' },
});
process.env.URL = 'https://dslogistic.netlify.app';
const { handler } = require('../../netlify/functions/calendar-link.js');

globalThis.__admin.idTokens = {
  'id-sh': { email: 'ShachafShalom@gmail.com', uid: 'u1' },
  'id-stranger': { email: 'someone@else.com', uid: 'u9' },
};
const call = (auth, method = 'POST') => handler({ httpMethod: method, headers: auth ? { authorization: auth } : {} });
const json = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

(async () => {
  T.describe('1. הרשאות');
  T.check((await call('Bearer id-sh', 'GET')).statusCode === 405, 'GET לא נחסם ב-405');
  T.check((await call('')).statusCode === 401, 'בקשה בלי התחברות לא נחסמה ב-401');
  T.check((await call('Bearer forged')).statusCode === 401, 'מזהה התחברות מזויף לא נחסם ב-401');
  T.check((await call('Bearer id-stranger')).statusCode === 404, 'משתמש שאינו נציג קיבל קישור');

  T.describe('2. הקישור הנכון');
  const r = await call('Bearer id-sh');
  const b = json(r);
  T.check(r.statusCode === 200 && b.name === 'שחף', 'שחף לא קיבל את הקישור שלו');
  T.check(b.url === 'https://dslogistic.netlify.app/.netlify/functions/calendar-feed?t=tok-sh', 'כתובת הקישור שגויה');
  T.check(!r.body.includes('tok-dn'), 'הקישור של דניאל נמסר לשחף');
  T.check(r.headers['Cache-Control'] === 'no-store', 'התשובה ניתנת לשמירה במטמון');

  T.describe('3. אין קישורי יומן בקוד הפרונט');
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/App.tsx'), 'utf8');
  T.check(!/calendar-feed\?t=/.test(src), 'קישור יומן עם טוקן חזר לקוד הפרונט (נטען לכל מבקר באתר)');

  T.finish();
})().catch(T.crash);
