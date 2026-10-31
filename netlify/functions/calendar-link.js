// netlify/functions/calendar-link.js
//
// מחזיר לנציג המחובר את קישור המנוי האישי שלו ליומן התזכורות (calendar-feed).
//
// למה פונקציה ולא קבוע בקוד: הקישור עצמו *הוא* ההרשאה לפיד (שמות, טלפונים והערות של לידים).
// קוד הפרונט נטען לכל מי שפותח את האתר עוד לפני התחברות — ולכן הקישורים לא יכולים להיות בו.
// כאן הקישור נמסר רק למי שמציג מזהה התחברות (Firebase ID token) תקף, ורק את הקישור שלו.
//
// משתני סביבה ב-Netlify:
//   FIREBASE_SERVICE_ACCOUNT  - קיים כבר (calendar-feed / website-lead / lead-notifier)
//   CALENDAR_FEED_TOKENS      - אותו JSON של calendar-feed: { "<טוקן>": { "email": "...", "name": "..." } }
//   URL                       - Netlify מגדיר לבד (כתובת האתר הראשית)

const { initializeApp, getApps, getApp: getExistingApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

let app;
function getApp() {
  if (app) return app;
  if (getApps().length) {
    app = getExistingApp();
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('חסר משתנה הסביבה FIREBASE_SERVICE_ACCOUNT');
  const creds = JSON.parse(raw);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  app = initializeApp({ credential: cert(creds) });
  return app;
}

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });

  const h = event.headers || {};
  const m = /^Bearer\s+(\S+)$/.exec(h.authorization || h.Authorization || '');
  if (!m) return reply(401, { error: 'לא מחובר' });

  let email;
  try {
    const decoded = await getAuth(getApp()).verifyIdToken(m[1]);
    email = String(decoded.email || '').toLowerCase();
  } catch (e) {
    return reply(401, { error: 'התחברות לא תקפה' });
  }

  let tokenMap = {};
  try {
    tokenMap = JSON.parse(process.env.CALENDAR_FEED_TOKENS || '{}');
  } catch (e) {
    return reply(500, { error: 'שגיאת הגדרות שרת (CALENDAR_FEED_TOKENS)' });
  }

  const hit = Object.entries(tokenMap).find(([, a]) => a && String(a.email || '').toLowerCase() === email);
  if (!email || !hit) return reply(404, { error: 'לא נמצא קישור יומן עבור המשתמש הזה' });

  const base = (process.env.URL || 'https://dslogistic.netlify.app').replace(/\/+$/, '');
  return reply(200, { name: hit[1].name || '', url: `${base}/.netlify/functions/calendar-feed?t=${hit[0]}` });
};
