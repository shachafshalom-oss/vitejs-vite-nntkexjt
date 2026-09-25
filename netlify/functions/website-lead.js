// netlify/functions/website-lead.js
//
// מקבל פנייה מטופס האתר של Steel & Spirit (Base44) וכותב אותה כליד חדש
// ל-crm_customers ב-Firestore, כולל שיוך נציג round-robin מאוזן.
//
// מאז סבב Pixel/CAPI הפונקציה גם:
//   1. מגינה מספאם: מלכודת honeypot, הגבלת קצב לפי IP, בדיקת טלפון, דחיית דומיין זר.
//   2. משייכת את הליד לקמפיין מטא לפי UTM (utm_id) — ואם הקמפיין לא קיים ב-CRM, יוצרת אותו.
//   3. שולחת אירוע Lead ל-Meta Conversions API (רק אם מוגדר טוקן).
//
// משתני סביבה ב-Netlify:
//   FIREBASE_SERVICE_ACCOUNT  - קיים (משמש גם את lead-notifier)
//   WEBSITE_LEAD_SECRET       - המפתח שהאתר שולח בכותרת x-api-key.
//                               ⚠️ הוא כתוב בקוד האתר ולכן גלוי לכל אחד — זה לא סוד
//                               ולא שכבת אבטחה. ההגנה האמיתית היא הבדיקות שבצד השרת כאן.
//   ALLOWED_ORIGIN            - דומיין/ים מורשים, מופרדים בפסיק
//   META_PIXEL_ID             - מזהה הפיקסל (1293755782256264)
//   META_CAPI_TOKEN           - טוקן Conversions API. כל עוד לא הוגדר — CAPI מדולג בשקט,
//                               והלידים ממשיכים להיכנס כרגיל.
//   META_TEST_EVENT_CODE      - אופציונלי, רק בזמן בדיקות ב-Test Events. למחוק אחרי.
//   META_GRAPH_VERSION        - אופציונלי, ברירת מחדל v26.0

// ⚠️ ייבוא מודולרי ולא require('firebase-admin') הישן.
// ב-firebase-admin v13+ הוסרה כל ה-API הישנה בסגנון namespace.
const crypto = require('crypto');
const { initializeApp, getApps, getApp: getExistingApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- אתחול Firebase Admin (פעם אחת לכל instance) ---
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

// אותה רשימת נציגים כמו ב-CRM (AGENTS)
const AGENTS = [
  { name: 'שחף', email: 'shachafshalom@gmail.com' },
  { name: 'דניאל', email: 'danielyos205@gmail.com' },
];

// --- הגבלת קצב ---
// 5 פניות לשעה לכל IP. לא הדוק יותר: ספקיות סלולר בישראל מושיבות הרבה
// לקוחות על אותה כתובת ציבורית, ולקוח אמיתי שנחסם שווה יותר מבוט שעבר.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// מקורות UTM שנחשבים Meta — רק עבורם utm_id מתפרש כ-Meta Campaign ID
const META_SOURCES = ['facebook', 'fb', 'instagram', 'ig', 'meta'];

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';

// נרמול טלפון לזיהוי פנייה חוזרת — חייב להישאר זהה ל-normalizePhone ב-src/App.tsx
// ול-isValidIsraeliPhone באתר, אחרת אותו לקוח ייחשב כפילות בערוץ אחד ולא בשני.
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-().]/g, '');
  if (!p) return '';
  p = p.replace(/^(\+|00)?972/, '');
  if (!p.startsWith('0')) p = '0' + p;
  return p;
}

// טלפון ישראלי: 0 + 8-9 ספרות (נייח 9 ספרות, נייד 10)
function isValidIsraeliPhone(normalized) {
  return /^0\d{8,9}$/.test(normalized);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// מחרוזת נקייה ומוגבלת באורך — כל מה שמגיע מהדפדפן נחשב לא אמין
function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// פרמטר דינמי של מטא שלא הוחלף (למשל בתצוגה מקדימה של מודעה) מגיע כ-"{{campaign.id}}"
function isUnresolvedMacro(value) {
  return /\{\{.*\}\}/.test(value);
}

function getClientIp(event) {
  const h = event.headers || {};
  return clean(
    h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0],
    64
  );
}

function parseAllowedOrigins() {
  return (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(requestOrigin) {
  const allowed = parseAllowedOrigins();
  const origin = allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || '';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

function respond(statusCode, requestOrigin, body) {
  return { statusCode, headers: corsHeaders(requestOrigin), body: JSON.stringify(body) };
}

// --- הגבלת קצב לפי IP ---
// ה-IP נשמר כגיבוב בלבד. כל חסימה נספרת (blockedCount) כדי שנוכל לראות
// ב-Firestore אם יש ניסיונות ספאם בפועל, ולכייל לפי נתונים ולא לפי ניחוש.
async function checkRateLimit(db, ip) {
  if (!ip) return { allowed: true };
  const salt = process.env.WEBSITE_LEAD_SECRET || '';
  const ref = db.collection('crm_rate_limits').doc(sha256(`rl:${salt}:${ip}`));
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const recent = (Array.isArray(data.hits) ? data.hits : []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    );

    if (recent.length >= RATE_LIMIT_MAX) {
      tx.set(
        ref,
        {
          hits: recent,
          blockedCount: (data.blockedCount || 0) + 1,
          lastBlockedAt: new Date(now).toISOString(),
        },
        { merge: true }
      );
      return { allowed: false };
    }

    recent.push(now);
    tx.set(ref, { hits: recent, updatedAt: new Date(now).toISOString() }, { merge: true });
    return { allowed: true };
  });
}

// --- נתוני ייחוס (UTM) ---
function readAttribution(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const pick = (k) => {
    const v = clean(a[k]);
    return isUnresolvedMacro(v) ? '' : v;
  };
  return {
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    utm_id: pick('utm_id'),
    utm_content: pick('utm_content'),
    utm_term: pick('utm_term'),
    fbclid: clean(a.fbclid, 500),
    landingPage: clean(a.landingPage, 500),
    capturedAt: Number(a.capturedAt) || null,
  };
}

// --- שיוך קמפיין (ויצירה אם חסר) ---
// רק קמפייני מטא: התאמה לפי Meta Campaign ID בלבד — לא לפי שם. שם קמפיין משתנה,
// ה-ID לעולם לא (אותו לקח כמו modelId).
// מקור אחר (גוגל, או כל utm_campaign שרירותי) לא יוצר קמפיין: המפתח באתר גלוי,
// ובוט יכול היה למלא את לשונית הקמפיינים בזבל. נתוני ה-UTM עדיין נשמרים בליד.
// מזהה מסמך קבוע + create() אטומי: שני לידים באותה שנייה מקמפיין חדש
// לא ייצרו שני קמפיינים — השני מקבל ALREADY_EXISTS ופשוט מקושר.
async function resolveCampaignId(db, attr, nowIso) {
  const source = attr.utm_source.toLowerCase();
  const isMeta = META_SOURCES.includes(source) && /^\d{6,25}$/.test(attr.utm_id);
  if (!isMeta) return '';

  const campaignsRef = db.collection('crm_campaigns');

  // קמפיין שהוקם ידנית ב-CRM ומולא לו Meta Campaign ID
  const existing = await campaignsRef.where('metaCampaignId', '==', attr.utm_id).limit(1).get();
  if (!existing.empty) return existing.docs[0].id;

  const docId = `meta_${attr.utm_id}`;
  try {
    await campaignsRef.doc(docId).create({
      metaCampaignId: attr.utm_id,
      name: attr.utm_campaign || `Meta ${attr.utm_id}`,
      platform: source,
      totalCost: 0,
      startDate: nowIso.slice(0, 10),
      endDate: '',
      autoCreated: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (err) {
    // 6 = ALREADY_EXISTS: הקמפיין כבר נוצר (בפנייה קודמת או במקביל) — פשוט מקשרים
    if (err.code !== 6 && !/already exists/i.test(err.message || '')) throw err;
  }
  return docId;
}

// --- Meta Conversions API ---
// לא זורק לעולם: כישלון מול מטא לא אמור להפיל ליד שכבר נשמר.
async function sendCapiLead({ eventId, phone, contactName, leadId, clientIp, userAgent, fbp, fbc, eventSourceUrl }) {
  const token = process.env.META_CAPI_TOKEN;
  const pixelId = process.env.META_PIXEL_ID;
  if (!token || !pixelId) return 'skipped:no-token';

  try {
    // טלפון בפורמט בינלאומי ללא +, לפי דרישת מטא: 0501234567 → 972501234567
    const e164 = phone.startsWith('0') ? `972${phone.slice(1)}` : phone;
    const [firstName, ...rest] = contactName.trim().toLowerCase().split(/\s+/);
    const lastName = rest.join(' ');

    const userData = {
      ph: [sha256(e164)],
      country: [sha256('il')],
      external_id: [sha256(leadId)],
    };
    if (firstName) userData.fn = [sha256(firstName)];
    if (lastName) userData.ln = [sha256(lastName)];
    if (clientIp) userData.client_ip_address = clientIp;
    if (userAgent) userData.client_user_agent = userAgent;
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;

    const body = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          // אותו event_id שהדפדפן שלח עם fbq — כך מטא מאחדת ולא סופרת ליד פעמיים
          event_id: eventId,
          action_source: 'website',
          event_source_url: eventSourceUrl || undefined,
          user_data: userData,
        },
      ],
    };
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = (errBody.error && errBody.error.message) || '';
      console.error('CAPI error:', res.status, msg);
      return `error:${res.status}${msg ? ' ' + msg.slice(0, 150) : ''}`;
    }
    return 'sent';
  } catch (err) {
    console.error('CAPI exception:', err);
    return `error:${String(err.message || err).slice(0, 150)}`;
  }
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const requestOrigin = headers.origin || headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(requestOrigin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, requestOrigin, { error: 'Method not allowed' });
  }

  // --- מפתח (לא סוד אמיתי — ראו הערה למעלה) ---
  const providedKey = headers['x-api-key'] || headers['X-Api-Key'];
  if (!process.env.WEBSITE_LEAD_SECRET || providedKey !== process.env.WEBSITE_LEAD_SECRET) {
    return respond(401, requestOrigin, { error: 'Unauthorized' });
  }

  // --- דחיית דומיין זר ---
  // דפדפן אמיתי תמיד שולח Origin. סקריפט יכול לזייף אותו, אבל זה עדיין מסנן עוד שכבה.
  const allowed = parseAllowedOrigins();
  if (allowed.length && !allowed.includes(requestOrigin)) {
    return respond(403, requestOrigin, { error: 'Forbidden origin' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    // --- מלכודת honeypot ---
    // שדה נסתר שאדם לא רואה ולכן לא ממלא. בוט שמילא אותו מקבל "הצלחה"
    // מזויפת — כדי שלא ילמד שנחסם — ושום דבר לא נכתב.
    if (clean(payload.website)) {
      return respond(200, requestOrigin, { ok: true });
    }

    const db = getFirestore(getApp());

    // --- הגבלת קצב (לפני ולידציה, כדי שגם הצפה של זבל תיעצר) ---
    const clientIp = getClientIp(event);
    const rate = await checkRateLimit(db, clientIp);
    if (!rate.allowed) {
      return respond(429, requestOrigin, { error: 'Too many requests' });
    }

    const contactName = clean(payload.fullName, 120);
    const phone = normalizePhone(clean(payload.phone, 40));
    const businessName = clean(payload.businessName, 120);

    // --- ולידציה ---
    if (!contactName || !phone) {
      return respond(400, requestOrigin, { error: 'חסרים שדות חובה: שם מלא וטלפון' });
    }
    if (!isValidIsraeliPhone(phone)) {
      return respond(400, requestOrigin, { error: 'מספר טלפון לא תקין' });
    }

    const customersRef = db.collection('crm_customers');

    // --- זיהוי כפילות לפי טלפון (לא חוסם) ---
    const allSnap = await customersRef.get();
    const duplicate = allSnap.docs.find(
      (d) => phone.length >= 7 && normalizePhone(d.data().phone) === phone
    );

    // --- שיוך round-robin מאוזן כולל (כל המקורות) ---
    const counts = AGENTS.map(
      (a) => allSnap.docs.filter((d) => d.data().assignedTo === a.email).length
    );
    const assignedTo = AGENTS[counts.indexOf(Math.min(...counts))].email;

    const now = new Date().toISOString();

    // --- שיוך קמפיין ---
    // כישלון כאן לא מפיל את הליד: עדיף ליד בלי קמפיין מאשר ליד שאבד.
    const attribution = readAttribution(payload.attribution);
    let campaignId = '';
    try {
      campaignId = await resolveCampaignId(db, attribution, now);
    } catch (campErr) {
      console.error('campaign resolve error:', campErr);
    }

    const eventId = /^[A-Za-z0-9_-]{8,64}$/.test(String(payload.eventId || ''))
      ? String(payload.eventId)
      : crypto.randomUUID();

    const leadDoc = {
      contactName,
      businessName: businessName || contactName,
      phone,
      email: '',
      status: 'lead',
      leadStage: 'new',
      businessType: 'bar',
      source: 'website',
      campaignId,
      attribution,
      metaEventId: eventId,
      assignedTo,
      address: '',
      notes: '',
      possibleDuplicateOfId: duplicate ? duplicate.id : null,
      possibleDuplicateAt: duplicate ? now : null,
      createdAt: now,
      updatedAt: now,
      interactionLogs: [],
    };

    const created = await customersRef.add(leadDoc);

    // --- CAPI: רק אחרי שהליד נשמר ---
    const capiStatus = await sendCapiLead({
      eventId,
      phone,
      contactName,
      leadId: created.id,
      clientIp,
      userAgent: clean(headers['user-agent'] || headers['User-Agent'], 400),
      fbp: clean(payload.fbp, 200),
      fbc: clean(payload.fbc, 500),
      eventSourceUrl: clean(payload.pageUrl, 500),
    });
    try {
      await created.update({ capiStatus });
    } catch (e) {
      console.error('capiStatus update failed:', e);
    }

    return respond(200, requestOrigin, {
      ok: true,
      id: created.id,
      assignedTo,
      duplicate: Boolean(duplicate),
    });
  } catch (err) {
    console.error('website-lead error:', err);
    return respond(500, requestOrigin, { error: `שגיאת שרת: ${err.message}` });
  }
};
