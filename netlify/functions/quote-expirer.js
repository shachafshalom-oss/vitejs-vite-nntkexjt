// ==========================================
// Steel & Spirit — דחייה אוטומטית של הצעות מחיר שפג תוקפן
// ==========================================
// רץ פעם ביום (03:00 שעון ישראל, ההגדרה ב-netlify.toml).
// כלל (שחף, 4.11.2026): ב-PDF מודפס תוקף של validDays (10) ימים. אחרי עוד graceDays (3) ימים
// שקטים — כלומר ביום ה-13 מתאריך ההצעה — הצעה שעדיין "ממתינה" הופכת ל"נדחתה".
// • רק הצעות שנוצרו אחרי autoRejectFrom (הצעות ישנות לא נוגעים בהן).
// • הצעה שכבר נדחתה אוטומטית פעם אחת והוחזרה ידנית ל"ממתינה" — לא נדחית שוב (autoRejectedAt נשאר).
// • אצל הלקוח לא משתנה כלום (בלי יומן, בלי תזכורת, בלי שינוי שלב).
// • כל הצעה נבדקת שוב בתוך טרנזקציה — הצעה שאושרה באותו רגע לא נדחית.
//
// ⚠️ ייבוא מודולרי של firebase-admin (v13 הסיר את ה-namespace API) — כמו ב-lead-notifier.
const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const POLICY = require('../../src/lib/quote-policy.json');

const TZ = 'Asia/Jerusalem';
const DAY_MS = 86400000;

let cachedApp;
function getFirebaseApp() {
  if (cachedApp) return cachedApp;
  if (getApps().length) { cachedApp = getApp(); return cachedApp; }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('חסר משתנה הסביבה FIREBASE_SERVICE_ACCOUNT');
  const creds = JSON.parse(raw);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  cachedApp = initializeApp({ credential: cert(creds) });
  return cachedApp;
}

// היום בשעון ישראל (YYYY-MM-DD) — דרך Intl, לא בהיסט קבוע (שעון קיץ/חורף)
function israelToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
// הפרש ימים קלנדריים בין שני תאריכי YYYY-MM-DD
function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(toYmd + 'T00:00:00Z') - Date.parse(fromYmd + 'T00:00:00Z')) / DAY_MS);
}
const REJECT_AFTER_DAYS = Number(POLICY.validDays) + Number(POLICY.graceDays);

// האם הצעה עומדת בכל התנאים לדחייה אוטומטית היום
function isExpired(q, today) {
  if (!q || (q.status || 'pending') !== 'pending') return false;
  if (q.autoRejectedAt) return false; // נפתחה מחדש ידנית אחרי דחייה אוטומטית
  if (!q.createdAt || String(q.createdAt) < POLICY.autoRejectFrom) return false;
  const date = String(q.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return daysBetween(date, today) >= REJECT_AFTER_DAYS;
}

exports.isExpired = isExpired;
exports.handler = async () => {
  const db = getFirestore(getFirebaseApp());
  const today = israelToday();
  const nowIso = new Date().toISOString();
  const snap = await db.collection('crm_quotes').where('status', '==', 'pending').get();
  const candidates = snap.docs.filter(d => isExpired(d.data(), today));
  let rejected = 0, skipped = 0;
  for (const d of candidates) {
    const ref = db.collection('crm_quotes').doc(d.id);
    try {
      const done = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists || !isExpired(fresh.data(), today)) return false;
        tx.update(ref, { status: 'rejected', rejectReason: 'expired', autoRejectedAt: nowIso, updatedAt: nowIso });
        return true;
      });
      done ? rejected++ : skipped++;
    } catch (err) {
      skipped++;
      console.error('quote-expirer: נכשל בהצעה', d.id, err && err.message);
    }
  }
  const result = { today, checked: snap.docs.length, rejected, skipped, rejectAfterDays: REJECT_AFTER_DAYS };
  console.log('quote-expirer', JSON.stringify(result));
  return { statusCode: 200, body: JSON.stringify(result) };
};
