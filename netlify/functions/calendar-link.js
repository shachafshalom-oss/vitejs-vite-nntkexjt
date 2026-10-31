// netlify/functions/calendar-link.js
//
// מחזיר לנציג המחובר את קישור המנוי האישי שלו ליומן התזכורות (calendar-feed).
//
// למה פונקציה ולא קבוע בקוד: הקישור עצמו *הוא* ההרשאה לפיד (שמות, טלפונים והערות של לידים).
// קוד הפרונט נטען לכל מי שפותח את האתר עוד לפני התחברות — ולכן הקישורים לא יכולים להיות בו.
// כאן הקישור נמסר רק למי שמציג מזהה התחברות (Firebase ID token) תקף, ורק את הקישור שלו.
//
// אימות המזהה נעשה ידנית לפי התיעוד של Firebase ("Verify ID tokens using a third-party JWT library"):
// חתימת RS256 מול המפתחות הציבוריים של Google, aud/iss של הפרויקט, ותוקף.
// לא דרך firebase-admin/auth: הוא מושך את jose 6 (ESM בלבד), והפונקציה קרסה ב-Netlify (502) בטעינה.
//
// משתני סביבה ב-Netlify:
//   FIREBASE_SERVICE_ACCOUNT  - קיים כבר; נלקח ממנו רק project_id
//   CALENDAR_FEED_TOKENS      - אותו JSON של calendar-feed: { "<טוקן>": { "email": "...", "name": "..." } }
//   URL                       - Netlify מגדיר לבד (כתובת האתר הראשית)

const crypto = require('crypto');

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache = { certs: null, until: 0 };

async function googleCerts(now) {
  if (certCache.certs && now < certCache.until) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const certs = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  certCache = { certs, until: now + (m ? Number(m[1]) : 3600) * 1000 };
  return certs;
}

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** Returns the token's claims, or throws. */
async function verifyIdToken(token, projectId, now = Date.now()) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = b64json(parts[0]);
  const claims = b64json(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  const certs = await googleCerts(now);
  const pem = certs[header.kid];
  if (!pem) throw new Error('kid');
  const ok = crypto.createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(pem, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('signature');
  const sec = Math.floor(now / 1000);
  const skew = 300;
  if (claims.aud !== projectId) throw new Error('aud');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('iss');
  if (!(claims.exp > sec - skew)) throw new Error('expired');
  if (!(claims.iat <= sec + skew)) throw new Error('iat');
  if (!(claims.auth_time <= sec + skew)) throw new Error('auth_time');
  if (!claims.sub || typeof claims.sub !== 'string') throw new Error('sub');
  return claims;
}

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

async function handler(event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });

  const h = event.headers || {};
  const m = /^Bearer\s+(\S+)$/.exec(h.authorization || h.Authorization || '');
  if (!m) return reply(401, { error: 'לא מחובר' });

  let projectId;
  try {
    projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}').project_id;
  } catch (e) {
    projectId = undefined;
  }
  if (!projectId) return reply(500, { error: 'שגיאת הגדרות שרת (FIREBASE_SERVICE_ACCOUNT)' });

  let email;
  try {
    const claims = await verifyIdToken(m[1], projectId);
    email = String(claims.email || '').toLowerCase();
  } catch (e) {
    console.log('calendar-link: token rejected:', e && e.message);
    return reply(401, { error: 'התחברות לא תקפה, נסה להתחבר מחדש' });
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
}

exports.handler = handler;
// for tests only
exports.__verifyIdToken = verifyIdToken;
exports.__resetCerts = () => { certCache = { certs: null, until: 0 }; };
