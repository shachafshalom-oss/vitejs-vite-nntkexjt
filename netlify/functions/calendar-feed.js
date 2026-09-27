// netlify/functions/calendar-feed.js
//
// פיד יומן מנוי (ICS/webcal) לתזכורות המשך של לידים — נבנה לפי בקשת שחף:
// כל נציג מקבל קישור אישי אחד, מנוי עליו פעם אחת באפליקציית היומן של הטלפון,
// והיומן מתעדכן ברקע לבד (לא לינק חד-פעמי לכל תזכורת, ולא OAuth מול Google Calendar).
//
// מבנה זהה במכוון ל-website-lead.js (אותו דפוס אתחול Firebase Admin מודולרי).
//
// אבטחה: אין כאן משתמש/סיסמה — כמו קישור "יומן פרטי" של גוגל, האסימון בכתובת
// עצמה *הוא* ההרשאה. הוא ארוך (256 סיביות) ובלתי-ניחוש, וזה בדיוק אותו דגם
// אבטחה שאפליקציות יומן משתמשות בו כברירת מחדל לפידים מנויים — הן לא תומכות
// בשליחת כותרות/הזדהות מותאמות, אז לא הייתה אפשרות "אמיתית" יותר.
//
// משתנה סביבה נדרש ב-Netlify:
//   FIREBASE_SERVICE_ACCOUNT   - קיים כבר (משמש גם website-lead.js / lead-notifier.js)
//   CALENDAR_FEED_TOKENS       - JSON: { "<טוקן ארוך>": { "email": "...", "name": "..." }, ... }
//                                 מיפוי טוקן -> נציג. הטוקן עצמו קובע גם איזה נציג וגם
//                                 שהבקשה מורשית — לא צריך פרמטר email נפרד בכתובת.

const { initializeApp, getApps, getApp: getExistingApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

// --- עזרי ICS (RFC 5545) ---

// escape לטקסט חופשי בתוך שדה ICS: backslash קודם לכל, אח"כ פסיק/נקודה-פסיק, ואז שורות חדשות.
function icsEscape(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

// קיפול שורות ל-75 אוקטטים לכל שורה (המשך שורה מתחיל ברווח בודד), כנדרש בתקן.
function foldLine(line) {
  const limit = 74; // משאיר מקום לרווח ההמשך בשורה הבאה
  if (line.length <= limit) return line;
  let result = line.slice(0, limit);
  let rest = line.slice(limit);
  while (rest.length > 0) {
    const chunk = rest.slice(0, limit - 1);
    result += '\r\n ' + chunk;
    rest = rest.slice(limit - 1);
  }
  return result;
}

function todayCompactUTC() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Method Not Allowed' };
  }

  const token = (event.queryStringParameters || {}).t || '';

  let tokenMap = {};
  try {
    tokenMap = JSON.parse(process.env.CALENDAR_FEED_TOKENS || '{}');
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'שגיאת הגדרות שרת (CALENDAR_FEED_TOKENS)' };
  }

  const agent = tokenMap[token];
  if (!token || !agent || !agent.email) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'קישור לא תקין' };
  }

  try {
    const db = getFirestore(getApp());
    const snap = await db.collection('crm_customers').where('assignedTo', '==', agent.email).get();

    const leads = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d && d.followUpDate) leads.push({ id: doc.id, ...d });
    });

    const dtstamp = todayCompactUTC();
    const lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//Steel & Spirit//CRM Follow-ups//HE');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push(foldLine('X-WR-CALNAME:' + icsEscape(`מעקב לידים - ${agent.name || ''}`)));
    lines.push('X-WR-TIMEZONE:Asia/Jerusalem');
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    lines.push('X-PUBLISHED-TTL:PT1H');

    for (const lead of leads) {
      const dateCompact = String(lead.followUpDate).replace(/-/g, '');
      if (!/^\d{8}$/.test(dateCompact)) continue; // תאריך פגום — מדלגים בלי להפיל את כל הפיד

      const displayName = lead.businessName || lead.contactName || lead.name || 'ליד ללא שם';
      const summary = `מעקב: ${displayName}`;
      const descParts = [];
      if (lead.followUpNote) descParts.push(lead.followUpNote);
      if (lead.phone) descParts.push(`טלפון: ${lead.phone}`);
      const description = descParts.join('\n');

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:lead-${lead.id}@steelandspirit.com`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      lines.push(foldLine('SUMMARY:' + icsEscape(summary)));
      if (description) lines.push(foldLine('DESCRIPTION:' + icsEscape(description)));
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="steel-spirit-followups.ics"',
        'Cache-Control': 'public, max-age=900',
      },
      body: lines.join('\r\n') + '\r\n',
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'שגיאת שרת: ' + (e && e.message ? e.message : String(e)) };
  }
};
