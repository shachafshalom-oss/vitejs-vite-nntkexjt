// פונקציית quote-expirer (פעם ביום): הצעה ממתינה נדחית ביום ה-13 מתאריך ההצעה (10 תוקף + 3 גרייס),
// רק הצעות חדשות, לא נוגעים במאושרות / בישנות / בהצעה שנפתחה מחדש ידנית. אצל הלקוח לא משתנה כלום.
const T = require('../harness/checks.cjs');
const admin = require('firebase-admin/app'); // מוחלף במוק ע"י ה-runner
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test', private_key: 'x', client_email: 'x@test' });
const { handler } = require('../../netlify/functions/quote-expirer.js');
const POLICY = require('../../src/lib/quote-policy.json');

const A = () => globalThis.__admin;
const run = async (isoUtc) => { T.freezeTime(isoUtc); return JSON.parse((await handler()).body); };
const NEW = '2026-11-05T08:00:00.000Z'; // אחרי autoRejectFrom
const q = (date, extra = {}) => ({ customerId: 'C1', date, status: 'pending', createdAt: NEW, items: [], ...extra });

function seed() {
  admin.__reset();
  A().store = {
    crm_customers: { C1: { status: 'lead', leadStage: 'quote_sent', businessName: 'בר', interactionLogs: [] } },
    crm_quotes: {
      D12: q('2026-11-06'),                                   // ב-18.11 — יום 12
      D13: q('2026-11-05'),                                   // ב-18.11 — יום 13
      D20: q('2026-10-29', { createdAt: '2026-11-05T09:00:00.000Z' }), // תאריך הוקדם ידנית, נוצרה אחרי הסף
      OLD: q('2026-10-01', { createdAt: '2026-10-01T08:00:00.000Z' }), // נוצרה לפני הסף — לא נוגעים
      APR: q('2026-11-01', { status: 'approved' }),
      REJ: q('2026-11-01', { status: 'rejected' }),
      REOPEN: q('2026-11-01', { autoRejectedAt: '2026-11-14T01:00:00.000Z' }), // נדחתה אוטומטית והוחזרה ידנית
      NODATE: q(''),
    },
  };
}

(async () => {
  T.describe('0. המדיניות');
  T.check(POLICY.validDays === 10 && POLICY.graceDays === 3, `10 ימי תוקף + 3 גרייס: ${JSON.stringify(POLICY)}`);

  T.describe('1. ריצה ב-18.11 בשעה 03:00 (שעון ישראל)');
  seed();
  const r = await run('2026-11-18T01:00:00Z');
  const Q = A().store.crm_quotes;
  T.check(r.today === '2026-11-18' && r.rejectAfterDays === 13, `תאריך שעון ישראל ויום הדחייה: ${JSON.stringify(r)}`);
  T.check(Q.D12.status === 'pending', 'הצעה ביום 12 נדחתה מוקדם מדי');
  T.check(Q.D13.status === 'rejected' && Q.D13.rejectReason === 'expired' && !!Q.D13.autoRejectedAt, `הצעה ביום 13 לא נדחתה / בלי סימון: ${JSON.stringify(Q.D13)}`);
  T.check(Q.D20.status === 'rejected', 'הצעה חדשה עם תאריך ישן לא נדחתה');
  T.check(Q.OLD.status === 'pending', 'נדחתה הצעה שנוצרה לפני הכלל');
  T.check(Q.APR.status === 'approved' && Q.REJ.status === 'rejected' && !Q.REJ.autoRejectedAt, 'שונתה הצעה שאינה ממתינה');
  T.check(Q.REOPEN.status === 'pending', 'הצעה שנפתחה מחדש ידנית נדחתה שוב');
  T.check(Q.NODATE.status === 'pending', 'הצעה בלי תאריך נדחתה');
  T.check(r.rejected === 2, `צפויות 2 דחיות: ${r.rejected}`);
  const C1 = A().store.crm_customers.C1;
  T.check(C1.leadStage === 'quote_sent' && C1.interactionLogs.length === 0 && !C1.followUpDate, 'אצל הלקוח השתנה משהו (שחף: לא אמור לקרות כלום)');
  T.check(!A().log.some(l => l.col !== 'crm_quotes' && l.op !== 'get'), `נכתב לאוסף אחר מלבד הצעות: ${JSON.stringify(A().log.filter(l => l.col !== 'crm_quotes').map(l => l.col + ':' + l.op))}`);

  T.describe('2. ריצה חוזרת באותו יום — לא משנה כלום');
  const before = JSON.stringify(A().store.crm_quotes);
  const r2 = await run('2026-11-18T01:05:00Z');
  T.check(r2.rejected === 0 && JSON.stringify(A().store.crm_quotes) === before, 'ריצה חוזרת שינתה נתונים');

  T.describe('3. שעון ישראל: 23:30 UTC ב-17.11 = כבר 18.11 בישראל');
  seed();
  const r3 = await run('2026-11-17T23:30:00Z');
  T.check(r3.today === '2026-11-18' && A().store.crm_quotes.D13.status === 'rejected', `היום לפי שעון ישראל: ${r3.today}`);

  T.finish();
})().catch(e => { T.check(false, 'CRASH ' + (e && e.stack)); T.finish(); });
