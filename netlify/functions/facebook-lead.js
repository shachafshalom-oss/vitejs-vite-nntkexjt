// netlify/functions/facebook-lead.js
//
// Webhook של Meta Lead Ads: ליד שנשלח בטופס בפייסבוק/אינסטגרם נכנס ל-CRM תוך שניות.
// החלטות (שחף, 3.10.2026 + 31.10.2026): webhook עצמאי ב-Netlify (לא Zapier), round-robin הקיים,
// רק לידים חדשים, טוקן מ-System User, סודות רק במשתני סביבה.
//
// הזרימה:
//   GET  — אימות הכתובת מול Meta (hub.challenge), רק אם FB_VERIFY_TOKEN תואם.
//   POST — 1. אימות חתימה X-Hub-Signature-256 עם FB_APP_SECRET. חתימה לא תקינה = 403.
//          2. כל leadgen_id נשמר קודם ל-crm_meta_lead_events. רק אחרי שהשמירה הצליחה עונים 200.
//             (200 לפני שמירה = Meta מחשיבה את הליד כנמסר ולא שולחת שוב — והוא אבוד.)
//          3. שליפת הליד מ-Graph API (Page Access Token) וכתיבה ל-crm_customers במזהה קבוע
//             fb_<leadgen_id> עם create() — אותו ליד שנשלח פעמיים לא יוצר כרטיס שני.
//          4. כשל בשליפה לא מפיל: האירוע נשאר ב-status 'error' עם attempts, לרשת הביטחון (שלב 4).
//   פוש על ליד חדש: lead-notifier.js כבר שולח לכל ליד עם assignedTo ובלי pushSentAt.
//
// משתני סביבה ב-Netlify (אף אחד מהם לא נשלח בצ'אט):
//   FIREBASE_SERVICE_ACCOUNT  - קיים (משותף ל-website-lead / lead-notifier)
//   FB_APP_SECRET             - App Secret של אפליקציית "Steel and spirit CRM"
//   FB_VERIFY_TOKEN           - מחרוזת שהומצאה; אותה מחרוזת מוזנת ב-Meta בהגדרת ה-webhook
//   FB_PAGE_ACCESS_TOKEN      - Page Access Token שנגזר מ-System User (לא פג)
//   FB_PAGE_ID                - אופציונלי: מתעלמים מלידים של דף אחר
//   META_GRAPH_VERSION        - אופציונלי, ברירת מחדל v26.0
const crypto = require('crypto');
const { initializeApp, getApps, getApp: getExistingApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let app;
function getApp() {
  if (app) return app;
  if (getApps().length) { app = getExistingApp(); return app; }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('חסר משתנה הסביבה FIREBASE_SERVICE_ACCOUNT');
  const creds = JSON.parse(raw);
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  app = initializeApp({ credential: cert(creds) });
  return app;
}

// אותה רשימת נציגים כמו ב-CRM (AGENTS) וב-website-lead.js
const AGENTS = [
  { name: 'שחף', email: 'shachafshalom@gmail.com' },
  { name: 'דניאל', email: 'danielyos205@gmail.com' },
];
const graphVersion = () => process.env.META_GRAPH_VERSION || 'v26.0';
const LEAD_FIELDS = 'created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic';

// חייב להישאר זהה ל-normalizePhone ב-src/App.tsx וב-website-lead.js
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-().]/g, '');
  if (!p) return '';
  p = p.replace(/^(\+|00)?972/, '');
  if (!p.startsWith('0')) p = '0' + p;
  return p;
}
const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const isAlreadyExists = (err) => err && (err.code === 6 || /already exists/i.test(err.message || ''));

function rawBody(event) {
  const b = event.body || '';
  return event.isBase64Encoded ? Buffer.from(b, 'base64').toString('utf8') : b;
}

// X-Hub-Signature-256: "sha256=" + HMAC-SHA256(App Secret, גוף הבקשה הגולמי). השוואה בזמן קבוע.
function validSignature(body, header, secret) {
  if (!header || !secret || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const a = Buffer.from(header.slice(7).toLowerCase(), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- מיפוי שדות הטופס ---
// שדות סטנדרטיים של Meta: full_name (או first_name+last_name), phone_number, email.
// כל שאלה אחרת בטופס נשמרת בהערות הליד — שם הנציג רואה אותה מיד.
function mapFields(fieldData) {
  const answers = {};
  (Array.isArray(fieldData) ? fieldData : []).forEach((f) => {
    const name = clean(f && f.name, 80);
    if (!name) return;
    answers[name] = (Array.isArray(f.values) ? f.values : []).map((v) => clean(v, 300)).filter(Boolean).join(', ');
  });
  const take = (...keys) => { for (const k of keys) if (answers[k]) { const v = answers[k]; return v; } return ''; };
  const fullName = take('full_name') || [take('first_name'), take('last_name')].filter(Boolean).join(' ');
  const phone = take('phone_number', 'phone');
  const email = take('email');
  const STANDARD = new Set(['full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'email']);
  const extra = Object.entries(answers).filter(([k, v]) => !STANDARD.has(k) && v);
  return {
    fullName: clean(fullName, 120),
    phone: normalizePhone(phone),
    email: clean(email, 160),
    extra,
  };
}

// --- שיוך קמפיין: לפי Meta Campaign ID בלבד; אם לא קיים ב-CRM — נוצר (אותה לוגיקה כמו website-lead) ---
async function resolveCampaignId(db, campaignId, campaignName, nowIso) {
  if (!/^\d{6,25}$/.test(String(campaignId || ''))) return '';
  const ref = db.collection('crm_campaigns');
  const existing = await ref.where('metaCampaignId', '==', String(campaignId)).limit(1).get();
  if (!existing.empty) return existing.docs[0].id;
  const docId = `meta_${campaignId}`;
  try {
    await ref.doc(docId).create({
      metaCampaignId: String(campaignId), name: clean(campaignName) || `Meta ${campaignId}`, platform: 'facebook',
      totalCost: 0, startDate: nowIso.slice(0, 10), endDate: '', autoCreated: true, createdAt: nowIso, updatedAt: nowIso,
    });
  } catch (err) { if (!isAlreadyExists(err)) throw err; }
  return docId;
}

async function fetchLead(leadgenId) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('חסר FB_PAGE_ACCESS_TOKEN');
  // appsecret_proof: גם אם הטוקן ידלוף, אי אפשר להשתמש בו בלי ה-App Secret
  const proof = crypto.createHmac('sha256', process.env.FB_APP_SECRET || '').update(token).digest('hex');
  const url = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(leadgenId)}?fields=${LEAD_FIELDS}&appsecret_proof=${proof}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Graph ${res.status}: ${e.message || 'unknown'}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return data;
}

// מעבד ליד אחד: שליפה → כתיבה ל-crm_customers. מחזיר את מזהה הכרטיס.
async function processLead(db, leadgenId, value) {
  const nowIso = new Date().toISOString();
  const lead = await fetchLead(leadgenId);
  const { fullName, phone, email, extra } = mapFields(lead.field_data);
  const customers = db.collection('crm_customers');
  const customerId = `fb_${leadgenId}`;

  const allSnap = await customers.get();
  if (allSnap.docs.some((d) => d.id === customerId)) return customerId; // כבר נוצר (שליחה חוזרת)
  const duplicate = phone.length >= 7 ? allSnap.docs.find((d) => normalizePhone(d.data().phone) === phone) : null;
  const counts = AGENTS.map((a) => allSnap.docs.filter((d) => d.data().assignedTo === a.email).length);
  const assignedTo = AGENTS[counts.indexOf(Math.min(...counts))].email;

  let campaignId = '';
  try { campaignId = await resolveCampaignId(db, lead.campaign_id, lead.campaign_name, nowIso); }
  catch (err) { console.error('campaign resolve error:', err); } // עדיף ליד בלי קמפיין מאשר ליד שאבד

  const created = lead.created_time ? new Date(lead.created_time) : null;
  const platform = String(lead.platform || '').toLowerCase(); // 'fb' | 'ig'
  const doc = {
    contactName: fullName,
    businessName: fullName,
    phone,
    email,
    status: 'lead',
    leadStage: 'new',
    businessType: 'bar',
    source: 'facebook', // פייסבוק ואינסטגרם יחד; הפילוח ב-metaPlatform
    metaPlatform: platform === 'ig' || platform === 'fb' ? platform : '',
    metaLeadgenId: String(leadgenId),
    campaignId,
    attribution: {
      meta_campaign_id: clean(lead.campaign_id, 30),
      meta_campaign_name: clean(lead.campaign_name),
      adset_name: clean(lead.adset_name),
      ad_id: clean(lead.ad_id || (value && value.ad_id), 30),
      ad_name: clean(lead.ad_name),
      form_id: clean(lead.form_id || (value && value.form_id), 30),
      is_organic: lead.is_organic === true,
    },
    assignedTo,
    address: '',
    notes: extra.length ? extra.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('\n') : '',
    possibleDuplicateOfId: duplicate ? duplicate.id : null,
    possibleDuplicateAt: duplicate ? nowIso : null,
    createdAt: created && !isNaN(created.getTime()) ? created.toISOString() : nowIso,
    updatedAt: nowIso,
    interactionLogs: [],
  };
  try { await customers.doc(customerId).create(doc); }
  catch (err) { if (!isAlreadyExists(err)) throw err; }
  return customerId;
}

exports.handler = async (event) => {
  const method = event.httpMethod;

  // --- אימות הכתובת מול Meta ---
  if (method === 'GET') {
    const q = event.queryStringParameters || {};
    const expected = process.env.FB_VERIFY_TOKEN;
    if (expected && q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === expected) {
      return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: String(q['hub.challenge'] || '') };
    }
    return { statusCode: 403, body: 'Forbidden' };
  }
  if (method !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // --- חתימה ---
  const secret = process.env.FB_APP_SECRET;
  if (!secret) return { statusCode: 503, body: 'Not configured' }; // לפני שלב 0: דוחים הכול
  const body = rawBody(event);
  const headers = event.headers || {};
  const sig = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
  if (!validSignature(body, sig, secret)) return { statusCode: 403, body: 'Invalid signature' };

  let payload;
  try { payload = JSON.parse(body || '{}'); } catch { return { statusCode: 400, body: 'Bad JSON' }; }
  if (payload.object !== 'page') return { statusCode: 200, body: 'ignored' };

  const onlyPage = process.env.FB_PAGE_ID;
  const changes = [];
  (payload.entry || []).forEach((entry) => (entry.changes || []).forEach((c) => {
    if (c.field !== 'leadgen' || !c.value || !c.value.leadgen_id) return;
    const pageId = String(c.value.page_id || entry.id || '');
    if (onlyPage && pageId !== onlyPage) return;
    changes.push({ leadgenId: String(c.value.leadgen_id), pageId, value: c.value });
  }));
  if (!changes.length) return { statusCode: 200, body: 'no leads' };

  const db = getFirestore(getApp());
  const events = db.collection('crm_meta_lead_events');

  // --- 1. שמירה לפני תשובה. כשל כאן = 500, ו-Meta תשלח שוב ---
  const toProcess = [];
  try {
    for (const ch of changes) {
      const ref = events.doc(ch.leadgenId);
      const nowIso = new Date().toISOString();
      try {
        await ref.create({
          leadgenId: ch.leadgenId, pageId: ch.pageId, formId: clean(ch.value.form_id, 30), adId: clean(ch.value.ad_id, 30),
          status: 'received', attempts: 0, receivedAt: nowIso, updatedAt: nowIso,
        });
        toProcess.push({ ...ch, ref, attempts: 0 });
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
        const snap = await ref.get();
        const data = snap.exists ? snap.data() : {};
        if (data.status !== 'done') toProcess.push({ ...ch, ref, attempts: Number(data.attempts) || 0 });
      }
    }
  } catch (err) {
    console.error('facebook-lead save error:', err);
    return { statusCode: 500, body: 'save failed' };
  }

  // --- 2. עיבוד. כשל לא מחזיר שגיאה ל-Meta: האירוע שמור ורשת הביטחון תשלים ---
  const results = [];
  for (const ch of toProcess) {
    try {
      const customerId = await processLead(db, ch.leadgenId, ch.value);
      await ch.ref.update({ status: 'done', customerId, processedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null });
      results.push({ leadgenId: ch.leadgenId, customerId });
    } catch (err) {
      console.error('facebook-lead process error:', ch.leadgenId, err.message);
      try {
        await ch.ref.update({ status: 'error', error: clean(err.message, 500), attempts: ch.attempts + 1, updatedAt: new Date().toISOString() });
      } catch (e) { console.error('event update failed:', e); }
      results.push({ leadgenId: ch.leadgenId, error: true });
    }
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, results }) };
};

// לבדיקות ולרשת הביטחון (שלב 4)
exports._internal = { mapFields, validSignature, processLead, normalizePhone };
