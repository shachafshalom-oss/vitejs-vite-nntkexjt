// ==========================================
// Steel & Spirit — שולח התראות Push ללידים
// ==========================================
// רץ כל 5 דקות ומטפל בשני דברים:
//   1. ליד חדש שהוקצה לנציג וטרם נשלחה עליו התראה.
//   2. דיגסט בוקר יומי בשעה 09:00 (שעון ישראל) — תזכורות להיום + לידים תקועים.
//
// למה בדיקה כל 5 דקות ולא טריגר מיידי: טריגר אמיתי דורש Firebase Cloud Functions
// ותוכנית Blaze בתשלום. חלון של 5 דקות עדיין בתוך הטווח הקריטי לתגובה ללקוח.
//
// ⚠️ התזמון מוגדר ב-netlify.toml ולא בקובץ הזה.
// הגדרת schedule בתוך קוד CommonJS אינה נקראת על ידי Netlify — היא נתמכת
// רק בפורמט המודרני (ESM). כל עוד ההגדרה הייתה כאן בלבד, הפונקציה נרשמה
// כפונקציית HTTP רגילה ולא רצה מעולם.

const admin = require('firebase-admin');

// ---------- קבועים עסקיים ----------
const QUIET_START_HOUR = 23; // מ-23:00
const QUIET_END_HOUR = 7;    // עד 07:00 — לא שולחים התראות
const DIGEST_HOUR = 9;       // דיגסט יומי ב-09:00
const STALE_DAYS = 7;        // ליד ללא קשר מעל 7 ימים נחשב תקוע
const TZ = 'Asia/Jerusalem';

// ---------- אתחול Firebase Admin ----------
// המפתח מגיע ממשתנה סביבה ולא מהקוד. השורה עם private_key חיונית:
// Netlify שומר מעברי שורה כ-\n מילולי, ובלי ההמרה החתימה נכשלת.
//
// ⚠️ לא משתמשים ב-admin.apps.length — המאפיין הזה הוסר ב-firebase-admin v13
// וזרק "Cannot read properties of undefined (reading 'length')".
// admin.app() זורק כשאין אפליקציה מאותחלת, ולכן try/catch עובד בכל הגרסאות.
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

// ---------- עזרי זמן בשעון ישראל ----------
// מחושב דרך Intl ולא בהיסט קבוע, כדי שהמעבר לשעון קיץ/חורף לא יזיז את הדיגסט בשעה.
function israelNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function isQuietHours(hour) {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

// ---------- שליחה בפועל ----------
// שולח data-only ולא notification, כדי שה-Service Worker יציג את ההתראה פעם אחת בלבד.
// עם notification הדפדפן מציג בעצמו וגם ההנדלר רץ — התוצאה היא התראה כפולה.
async function sendToAgent(db, messaging, email, { title, body, url, tag }) {
  const snap = await db.collection('crm_push_tokens').where('email', '==', email).get();
  if (snap.empty) return { sent: 0, removed: 0 };

  const tokens = snap.docs.map(d => d.id);
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: { title, body, url: url || '/', tag: tag || 'ss-crm' },
    android: { priority: 'high' },
    webpush: { headers: { Urgency: 'high' } },
  });

  // ניקוי טוקנים מתים — בלי זה ה-collection מתמלא במכשירים שכבר לא קיימים
  // וכל שליחה נהיית איטית יותר עם הזמן.
  let removed = 0;
  await Promise.all(res.responses.map(async (r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
      await db.collection('crm_push_tokens').doc(tokens[i]).delete().catch(() => {});
      removed++;
    }
  }));

  return { sent: res.successCount, removed };
}

// ---------- 1. לידים חדשים ----------
async function notifyNewLeads(db, messaging, now) {
  if (isQuietHours(now.hour)) return { skipped: 'שעות שקט' };

  const snap = await db.collection('crm_customers').where('status', '==', 'lead').get();
  const pending = snap.docs.filter(d => {
    const x = d.data();
    return x.assignedTo && !x.pushSentAt;
  });

  let sent = 0;
  for (const docSnap of pending) {
    const lead = docSnap.data();
    const name = lead.businessName || lead.contactName || 'ליד חדש';
    const via = lead.source === 'facebook' ? ' (פייסבוק)'
              : lead.source === 'website' ? ' (אתר)'
              : '';
    const result = await sendToAgent(db, messaging, lead.assignedTo, {
      title: 'ליד חדש הוקצה אליך',
      body: `${name}${via}${lead.phone ? ' · ' + lead.phone : ''}`,
      tag: `lead-${docSnap.id}`,
    });
    // מסמנים גם אם לא נשלח בפועל — אחרת ליד של נציג בלי מכשיר רשום
    // ייסרק מחדש כל 5 דקות לנצח.
    await docSnap.ref.update({ pushSentAt: new Date().toISOString() });
    sent += result.sent;
  }

  return { leads: pending.length, sent };
}

// ---------- 2. דיגסט בוקר ----------
async function sendDailyDigest(db, messaging, now) {
  if (now.hour !== DIGEST_HOUR) return { skipped: 'לא שעת הדיגסט' };

  // מונע שליחה כפולה: הפונקציה רצה 12 פעמים בתוך שעת הדיגסט.
  const logRef = db.collection('crm_settings').doc('push_digest_log');
  const logSnap = await logRef.get();
  if (logSnap.exists && logSnap.data().lastSentDate === now.date) {
    return { skipped: 'כבר נשלח היום' };
  }

  const snap = await db.collection('crm_customers').where('status', '==', 'lead').get();
  const byAgent = {};

  snap.docs.forEach(d => {
    const lead = d.data();
    if (!lead.assignedTo) return;
    if (lead.leadStage === 'not_relevant') return;

    if (!byAgent[lead.assignedTo]) byAgent[lead.assignedTo] = { due: 0, stale: 0 };

    // תזכורת מעקב שהגיע זמנה (כולל תזכורות שעברו ולא טופלו)
    if (lead.followUpDate && lead.followUpDate <= now.date) byAgent[lead.assignedTo].due++;

    // ליד ללא קשר מעל 7 ימים — נמדד מההערה האחרונה, ובהיעדר הערות מרגע היצירה
    const logs = Array.isArray(lead.interactionLogs) ? lead.interactionLogs : [];
    const lastMs = logs.length ? new Date(logs[logs.length - 1].date).getTime()
                 : (lead.createdAt ? new Date(lead.createdAt).getTime() : null);
    if (lastMs) {
      const days = Math.floor((Date.now() - lastMs) / 86400000);
      if (days >= STALE_DAYS) byAgent[lead.assignedTo].stale++;
    }
  });

  let sent = 0;
  for (const [email, counts] of Object.entries(byAgent)) {
    if (!counts.due && !counts.stale) continue; // אין על מה להתריע — לא שולחים רעש
    const lines = [];
    if (counts.due) lines.push(`${counts.due} תזכורות מעקב להיום`);
    if (counts.stale) lines.push(`${counts.stale} לידים ללא קשר מעל ${STALE_DAYS} ימים`);
    const result = await sendToAgent(db, messaging, email, {
      title: 'בוקר טוב — סדר היום שלך',
      body: lines.join(' · '),
      tag: 'daily-digest',
    });
    sent += result.sent;
  }

  await logRef.set({ lastSentDate: now.date, updatedAt: new Date().toISOString() }, { merge: true });
  return { agents: Object.keys(byAgent).length, sent };
}

// ---------- נקודת הכניסה ----------
exports.handler = async () => {
  // שורת חיים: מופיעה בלוגים של Netlify בכל הרצה. אם היא לא מופיעה —
  // סימן שהתזמון לא נרשם, ולא שהקוד נכשל.
  const startedAt = new Date().toISOString();
  console.log(`lead-notifier START ${startedAt}`);

  try {
    const application = getApp();
    const db = admin.firestore(application);
    const messaging = admin.messaging(application);
    const now = israelNow();

    const newLeads = await notifyNewLeads(db, messaging, now);
    const digest = await sendDailyDigest(db, messaging, now);

    console.log('lead-notifier DONE', JSON.stringify({ newLeads, digest }));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, israelTime: `${now.date} ${now.hour}:${String(now.minute).padStart(2, '0')}`, newLeads, digest }),
    };
  } catch (err) {
    console.error('lead-notifier ERROR', err && err.message, err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};

// הערה: אין כאן exports.config. התזמון מוגדר ב-netlify.toml:
//   [functions."lead-notifier"]
//     schedule = "*/5 * * * *"
