// netlify/functions/website-lead.js
//
// מקבל פנייה מטופס האתר של Steel & Spirit (Base44) וכותב אותה כליד חדש
// ל-crm_customers ב-Firestore, כולל שיוך נציג round-robin מאוזן.
//
// משתני סביבה נדרשים ב-Netlify:
//   FIREBASE_SERVICE_ACCOUNT  - קיים כבר (משמש גם את lead-notifier)
//   WEBSITE_LEAD_SECRET       - מפתח סודי שהאתר שולח בכותרת x-api-key
//   ALLOWED_ORIGIN            - דומיין/ים מורשים, מופרדים בפסיק

const admin = require('firebase-admin');

// --- אתחול Firebase Admin (פעם אחת לכל instance) ---
// משתמשים באותו משתנה סביבה שכבר קיים ומשמש את lead-notifier.
// שורת ה-private_key חיונית: Netlify שומר מעברי שורה כ-\n מילולי,
// ובלי ההמרה חתימת ההרשאה נכשלת.
//
// שים לב: לא משתמשים ב-admin.apps.length — המאפיין הזה הוסר ב-firebase-admin v13
// והיה זורק "Cannot read properties of undefined (reading 'length')".
// admin.app() זורק אם אין אפליקציה מאותחלת, ולכן try/catch עובד בכל הגרסאות.
let app;
function getApp() {
  if (app) return app;

  try {
    app = admin.app();
    return app;
  } catch (e) {
    // אין עדיין אפליקציה מאותחלת — ממשיכים לאתחול
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('חסר משתנה הסביבה FIREBASE_SERVICE_ACCOUNT');
  const creds = JSON.parse(raw);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  app = admin.initializeApp({ credential: admin.credential.cert(creds) });
  return app;
}

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

    const db = admin.firestore(getApp());
    const customersRef = db.collection('crm_customers');

    // --- זיהוי כפילות לפי טלפון (לא חוסם) ---
    // הליד תמיד ייווצר. אם קיים כבר לקוח עם אותו טלפון, מסמנים זאת בהערות
    // כדי שהנציג יראה מיד ויחליט בעצמו — לקוח שפונה שוב אינו בהכרח כפילות.
    // נטען את כלל הלידים פעם אחת: משמש גם לזיהוי הכפילות וגם לספירת האיזון.
    const allSnap = await customersRef.get();

    const duplicate = allSnap.docs.find(
      (d) => normalizePhone(d.data().phone) === phone
    );

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
      notes: duplicate
        ? `⚠️ ייתכן כפילות — קיים כבר לקוח עם טלפון זהה (מזהה: ${duplicate.id}). נוצר בכל זאת לבדיקתך.`
        : '',
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
        duplicate: Boolean(duplicate),
      }),
    };
  } catch (err) {
    console.error('website-lead error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(requestOrigin),
      body: JSON.stringify({ error: `שגיאת שרת: ${err.message}` }),
    };
  }
};
