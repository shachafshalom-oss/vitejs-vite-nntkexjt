// netlify/functions/website-lead.js
//
// מקבל פנייה מטופס האתר של Steel & Spirit (Base44) וכותב אותה כליד חדש
// ל-crm_customers ב-Firestore, כולל שיוך נציג round-robin מאוזן.
//
// משתני סביבה נדרשים ב-Netlify:
//   FIREBASE_SA_LEADS        - תוכן קובץ ה-JSON של Service Account (מחרוזת אחת)
//   WEBSITE_LEAD_SECRET       - מפתח סודי שהאתר שולח בכותרת x-api-key
//   ALLOWED_ORIGIN            - דומיין/ים מורשים, מופרדים בפסיק

const admin = require('firebase-admin');

// --- אתחול Firebase Admin (פעם אחת לכל instance) ---
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SA_LEADS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// אותה רשימת נציגים כמו ב-CRM (AGENTS)
const AGENTS = [
  { name: 'שחף', email: 'shachafshalom@gmail.com' },
  { name: 'דניאל', email: 'danielyos205@gmail.com' },
];

// נרמול טלפון: +9725... -> 05...
function normalizePhone(raw) {
  return String(raw || '').replace(/^\+972/, '0').replace(/[\s-]/g, '');
}

// ALLOWED_ORIGIN יכול להכיל כמה דומיינים מופרדים בפסיק.
// כך אפשר להגדיר כבר עכשיו גם את הדומיין הנוכחי וגם את העתידי,
// בלי לחזור ולערוך את המשתנה ביום שהאתר החדש עולה.
function corsHeaders(requestOrigin) {
  const allowed = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // מחזירים את מקור הבקשה רק אם הוא ברשימה המורשית
  const origin = allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || '';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin || '';

  // preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(requestOrigin), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(requestOrigin),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // --- אימות מפתח סודי ---
  const providedKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
  if (!process.env.WEBSITE_LEAD_SECRET || providedKey !== process.env.WEBSITE_LEAD_SECRET) {
    return {
      statusCode: 401,
      headers: corsHeaders(requestOrigin),
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    const contactName = String(payload.fullName || '').trim();
    const phone = normalizePhone(payload.phone);
    const businessName = String(payload.businessName || '').trim();

    // --- ולידציה ---
    if (!contactName || !phone) {
      return {
        statusCode: 400,
        headers: corsHeaders(requestOrigin),
        body: JSON.stringify({ error: 'חסרים שדות חובה: שם מלא וטלפון' }),
      };
    }

    const customersRef = db.collection('crm_customers');

    // --- בדיקת כפילות לפי טלפון ---
    // נטען את כלל הלידים פעם אחת: משמש גם לכפילות וגם לספירת האיזון.
    const allSnap = await customersRef.get();

    const duplicate = allSnap.docs.find(
      (d) => normalizePhone(d.data().phone) === phone
    );
    if (duplicate) {
      return {
        statusCode: 200,
        headers: corsHeaders(requestOrigin),
        body: JSON.stringify({
          ok: true,
          duplicate: true,
          id: duplicate.id,
          message: 'ליד עם טלפון זהה כבר קיים במערכת',
        }),
      };
    }

    // --- שיוך round-robin מאוזן כולל ---
    // בניגוד לייבוא מפייסבוק שסופר רק source==='facebook',
    // כאן סופרים את כלל הלידים של כל נציג (כל המקורות) ומקצים למי שיש לו הכי מעט.
    // כך התמונה הכוללת בין שחף לדניאל נשארת מאוזנת.
    const counts = AGENTS.map(
      (a) => allSnap.docs.filter((d) => d.data().assignedTo === a.email).length
    );
    const assignedTo = AGENTS[counts.indexOf(Math.min(...counts))].email;

    // --- יצירת הליד ---
    const now = new Date().toISOString();
    const leadDoc = {
      contactName,
      businessName: businessName || contactName,
      phone,
      email: '',
      status: 'lead',
      leadStage: 'new',
      businessType: 'bar',
      source: 'website',
      campaignId: '',
      assignedTo,
      address: '',
      notes: '',
      createdAt: now,
      updatedAt: now,
      interactionLogs: [],
    };

    const created = await customersRef.add(leadDoc);

    return {
      statusCode: 200,
      headers: corsHeaders(requestOrigin),
      body: JSON.stringify({
        ok: true,
        id: created.id,
        assignedTo,
      }),
    };
  } catch (err) {
    console.error('website-lead error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(requestOrigin),
      body: JSON.stringify({ error: 'שגיאת שרת ביצירת הליד' }),
    };
  }
};
