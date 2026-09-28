// פונקציית lead-notifier (רצה כל 5 דקות): התראת "ליד חדש" לנציג, שעות שקט, וסיכום בוקר ב-09:00.
const T = require('../harness/checks.cjs');
const admin = require('firebase-admin/app'); // מוחלף במוק ע"י ה-runner
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test', private_key: 'x', client_email: 'x@test' });
const { handler } = require('../../netlify/functions/lead-notifier.js');

const SH = 'shachafshalom@gmail.com', DN = 'danielyos205@gmail.com';
const A = () => globalThis.__admin;
const run = async (isoUtc) => { T.freezeTime(isoUtc); return JSON.parse((await handler()).body); };

function seed() {
  admin.__reset();
  A().store = {
    crm_push_tokens: { tokSh1: { email: SH }, tokSh2: { email: SH }, tokDn: { email: DN } },
    crm_customers: {
      NEW1: { status: 'lead', businessName: 'בר חדש', phone: '0501', source: 'website', assignedTo: SH, leadStage: 'new', createdAt: '2026-10-07T05:00:00Z', interactionLogs: [] },
      SENT: { status: 'lead', businessName: 'כבר נשלח', assignedTo: SH, pushSentAt: '2026-10-06T10:00:00Z', leadStage: 'contacted', createdAt: '2026-10-06T10:00:00Z', interactionLogs: [] },
      NOAG: { status: 'lead', businessName: 'בלי נציג', assignedTo: '', createdAt: '2026-10-06T10:00:00Z', interactionLogs: [] },
      ACT: { status: 'active', businessName: 'לקוח פעיל', assignedTo: SH, createdAt: '2026-10-06T10:00:00Z' },
      DUE: { status: 'lead', businessName: 'תזכורת היום', assignedTo: DN, pushSentAt: 'x', leadStage: 'callback', followUpDate: '2026-10-07', createdAt: '2026-10-05T10:00:00Z', interactionLogs: [{ date: '2026-10-06T10:00:00Z', text: 'שיחה' }] },
      STALE: { status: 'lead', businessName: 'תקוע', assignedTo: DN, pushSentAt: 'x', leadStage: 'contacted', createdAt: '2026-09-01T10:00:00Z', interactionLogs: [{ date: '2026-09-20T10:00:00Z', text: 'שיחה ישנה' }] },
      NR: { status: 'lead', businessName: 'לא רלוונטי', assignedTo: DN, pushSentAt: 'x', leadStage: 'not_relevant', followUpDate: '2026-10-01', createdAt: '2026-09-01T10:00:00Z', interactionLogs: [] },
    },
  };
}

(async () => {
  T.describe('1. שעות שקט (01:30 בלילה)');
  seed();
  let r = await run('2026-10-06T22:30:00Z'); // 01:30 שעון ישראל
  T.check(r.newLeads.skipped === 'שעות שקט' && A().sent.length === 0, 'נשלחה התראה בשעות השקט');
  T.check(!A().store.crm_customers.NEW1.pushSentAt, 'ליד סומן כ"נשלח" בזמן שעות השקט — ההתראה תאבד');

  T.describe('2. ליד חדש ב-10:00');
  seed();
  A().messagingFailTokens = { tokSh2: 'messaging/registration-token-not-registered' };
  r = await run('2026-10-07T07:00:00Z'); // 10:00 שעון ישראל
  const pushes = A().sent.filter(s => s.data.title === 'ליד חדש הוקצה אליך');
  T.check(pushes.length === 1 && pushes[0].tokens.sort().join() === 'tokSh1,tokSh2', `צפויה התראה אחת לשני המכשירים של שחף: ${JSON.stringify(pushes)}`);
  T.check(pushes[0]?.data.body.includes('בר חדש') && pushes[0]?.data.body.includes('(אתר)'), 'תוכן ההתראה חסר שם/מקור');
  T.check(!!A().store.crm_customers.NEW1.pushSentAt, 'הליד לא סומן כ"נשלח" — יישלח שוב כל 5 דקות');
  T.check(A().store.crm_push_tokens.tokSh2 === undefined && !!A().store.crm_push_tokens.tokSh1, 'טוקן של מכשיר מת לא נוקה / נמחק טוקן תקין');
  T.check(!A().sent.some(s => s.data.body.includes('כבר נשלח') || s.data.body.includes('לקוח פעיל') || s.data.body.includes('בלי נציג')), 'נשלחה התראה על ליד שכבר נשלח / לקוח פעיל / ליד בלי נציג');
  const again = A().sent.length;
  await run('2026-10-07T07:05:00Z');
  T.check(A().sent.length === again, 'ריצה חוזרת אחרי 5 דקות שלחה שוב את אותה התראה');

  T.describe('3. סיכום בוקר ב-09:00');
  seed();
  A().store.crm_customers.NEW1.pushSentAt = 'x';
  r = await run('2026-10-07T06:10:00Z'); // 09:10 שעון ישראל
  const digest = A().sent.filter(s => s.data.tag === 'daily-digest');
  T.check(digest.length === 1 && digest[0].tokens.join() === 'tokDn', `צפוי סיכום אחד לדניאל בלבד (לשחף אין תזכורות/תקועים): ${JSON.stringify(digest.map(d => d.tokens))}`);
  T.check(digest[0]?.data.body.includes('1 תזכורות מעקב להיום') && digest[0]?.data.body.includes('1 לידים ללא קשר'), `תוכן הסיכום שגוי (צפוי: תזכורת 1, תקוע 1, בלי "לא רלוונטי"): ${digest[0]?.data.body}`);
  await run('2026-10-07T06:30:00Z');
  T.check(A().sent.filter(s => s.data.tag === 'daily-digest').length === 1, 'הסיכום נשלח פעמיים באותו בוקר');
  seed();
  A().store.crm_customers.NEW1.pushSentAt = 'x';
  await run('2026-10-07T08:10:00Z'); // 11:10 — לא שעת סיכום
  T.check(A().sent.filter(s => s.data.tag === 'daily-digest').length === 0, 'סיכום נשלח שלא בשעה 09');

  T.finish();
})().catch(T.crash);
