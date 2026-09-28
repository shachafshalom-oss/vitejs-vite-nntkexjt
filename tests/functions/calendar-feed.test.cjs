// פונקציית calendar-feed: פיד ICS אישי לתזכורות מעקב.
const T = require('../harness/checks.cjs');
require('firebase-admin/app').__reset();
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test', private_key: 'x', client_email: 'x@test' });
process.env.CALENDAR_FEED_TOKENS = JSON.stringify({ 'tok-sh': { email: 'shachafshalom@gmail.com', name: 'שחף' } });
const { handler } = require('../../netlify/functions/calendar-feed.js');

globalThis.__admin.store.crm_customers = {
  A: { assignedTo: 'shachafshalom@gmail.com', followUpDate: '2026-10-05', businessName: 'הבר, של "משה"; ניסיון \\ מוזר', followUpNote: 'להתקשר\nולוודא תשלום', phone: '0500000001' },
  B: { assignedTo: 'shachafshalom@gmail.com', followUpDate: '2026-10-06', businessName: 'בר רגיל', followUpNote: '', phone: '0500000002' },
  C: { assignedTo: 'shachafshalom@gmail.com', followUpDate: null, businessName: 'בלי תזכורת' },
  D: { assignedTo: 'danielyos205@gmail.com', followUpDate: '2026-10-07', businessName: 'של דניאל' },
  E: { assignedTo: 'shachafshalom@gmail.com', followUpDate: 'פגום', businessName: 'תאריך פגום' },
};

(async () => {
  T.describe('1. הרשאות');
  T.check((await handler({ httpMethod: 'GET', queryStringParameters: { t: 'wrong' } })).statusCode === 403, 'טוקן שגוי לא נחסם ב-403');
  T.check((await handler({ httpMethod: 'POST', queryStringParameters: {} })).statusCode === 405, 'POST לא נחסם ב-405');

  T.describe('2. תוכן הפיד');
  const res = await handler({ httpMethod: 'GET', queryStringParameters: { t: 'tok-sh' } });
  const body = res.body || '';
  T.check(res.statusCode === 200 && res.headers['Content-Type'] === 'text/calendar; charset=utf-8', 'הפיד לא הוחזר כ-ICS');
  T.check(body.startsWith('BEGIN:VCALENDAR\r\n') && body.trim().endsWith('END:VCALENDAR'), 'מבנה ICS שגוי');
  T.check((body.match(/BEGIN:VEVENT/g) || []).length === 2, 'צפויים בדיוק 2 אירועים (A, B)');
  T.check(!body.includes('lead-D@') && !body.includes('lead-C@') && !body.includes('lead-E@'), 'הופיע ליד של נציג אחר / בלי תזכורת / עם תאריך פגום');
  T.check(body.includes('UID:lead-A@steelandspirit.com') && body.includes('DTSTART;VALUE=DATE:20261005'), 'UID/תאריך שגויים');
  T.check(body.includes('הבר\\, של "משה"\\; ניסיון \\\\ מוזר') && body.includes('להתקשר\\nולוודא תשלום'), 'escaping שגוי לפי RFC 5545');
  T.check(body.split('\r\n').every(l => l.length <= 75 || l.startsWith(' ')), 'שורה ארוכה מ-75 תווים בלי קיפול');

  T.finish();
})().catch(T.crash);
