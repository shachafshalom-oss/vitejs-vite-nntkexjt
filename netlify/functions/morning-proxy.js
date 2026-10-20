// netlify/functions/morning-proxy.js
//
// פרוקסי בין ה-CRM (App.tsx) לבין Morning (חשבונית ירוקה) API.
// מחליף את finbot-proxy.js הישן. נבנה במוסכמה זהה לקובץ המקורי (הושוותי מול הקוד
// האמיתי ששחף שלח, 20.7.2026) — exports.handler, אותו מבנה try/catch, ואותו
// header של Access-Control-Allow-Origin.
//
// הבדל ארכיטקטוני מרכזי מול Finbot: Morning דורש שני שלבי אימות (OAuth 2.0, client credentials) —
//   1. POST ל-https://api.morning.co/idp/v1/oauth/token עם
//      {grant_type: "client_credentials", client_id: <Key ID>, client_secret: <Key Secret>}
//      → מחזיר {accessToken, tokenType, expiresAt} (תקף שעה)
//   2. שימוש ב-accessToken בכל קריאה נוספת (Authorization: Bearer <accessToken>)
// לכן הפונקציה הזו מבצעת את שני השלבים בכל קריאה (בלי caching של הטוקן —
// אישורי הצעות מחיר הם פעולה נדירה מספיק שאין צורך באופטימיזציה כאן).
//
// היסטוריה: עד 13.10.2026 האימות היה POST ל-api.greeninvoice.co.il/api/v1/account/token עם {id, secret}
// והתשובה {token}. ב-14.10.2026 Morning חסמה את התשתית הישנה (מייל "חשוב: החל ממחר..." מ-13.10) —
// מאז הקריאה הישנה מחזירה 404 ריק. ההגדרות ב-CRM (Key ID / Key Secret) לא השתנו — אלה אותם ערכים,
// בשמות השדות החדשים client_id / client_secret. מקור: developers.morning.co/api, פרק Authentication.
// שים לב: לכל סביבה (ייצור / sandbox) יש מפתחות משלה; הקובץ הזה פועל מול הייצור בלבד.
//
// חוזה התשובה ללקוח (App.tsx) זהה בכוונה למה ש-finbot-proxy החזיר, כדי לשמור
// על לוגיקת הפענוח בצד הלקוח פשוטה ועקבית:
//   הצלחה: { status: 1, data: "<url למסמך>" }
//   כשל:   { error: "<הודעת שגיאה קריאה בעברית/אנגלית>" }
//
// לפי בקשת שחף — פועל ישירות מול סביבת הייצור של Morning (לא sandbox), כי
// מדובר במסמכי "דרישת תשלום" בלבד (לא-מחייבים); חשבוניות המס מופקות בנפרד.

const BASE_URL = 'https://api.greeninvoice.co.il/api/v1';
// שרת האימות נמצא בדומיין נפרד מדומיין ה-API — אי אפשר לגזור אחד מהשני.
const AUTH_URL = 'https://api.morning.co/idp/v1/oauth/token';

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

// קודי שגיאת OAuth של Morning (RFC 6749) → הסבר בעברית שאפשר לפעול לפיו.
const AUTH_ERROR_HINTS = {
  invalid_client: 'Key ID או Key Secret שגויים, או שהחשבון חסום. ודא ששני הערכים שונים ושייכים למפתח של סביבת הייצור',
  invalid_grant: 'המפתח פג תוקף, בוטל, או שעדיין ממתין לאישור ב-Morning',
  unauthorized_client: 'אין מנוי פעיל ב-Morning, או שהמנוי לא כולל גישת API',
  invalid_request: 'בקשת האימות חסרה פרמטר (תקלה בקוד של ה-proxy)',
  unsupported_grant_type: 'סוג האימות לא נתמך (תקלה בקוד של ה-proxy)',
};

// בונה הודעת שגיאה קריאה מתשובת שרת האימות. לא מוסיף לעולם את ה-Secret להודעה.
const describeAuthFailure = (status, rawText) => {
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch { /* גוף לא-JSON */ }
  if (parsed && typeof parsed === 'object' && (parsed.error || parsed.errorMessage)) {
    const code = parsed.error || '';
    const hint = AUTH_ERROR_HINTS[code];
    const detail = parsed.error_description || parsed.errorMessage || '';
    return `[${code || status}] ${hint || detail || 'שגיאה לא מזוהה'}${hint && detail ? ` (${detail})` : ''}`;
  }
  // תשובה ריקה או לא-JSON (למשל 404 מה-gateway): מציגים את הסטטוס והכתובת כדי שאפשר יהיה לאבחן.
  const snippet = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'תגובה ריקה';
  return `קוד ${status} מ-${AUTH_URL} — ${snippet}`;
};

// מחלץ קישור הורדה מהתשובה של Morning. אומת מול תשובה אמיתית ב-29.7.2026:
// Morning מחזירה את הקישור תחת "url", כ-*אובייקט* (למשל {origin, he, en}) —
// לא כמחרוזת פשוטה, וגם לא תחת "downloadLinks" כפי שהקוד הקודם ציפה.
// downloadLinks נשאר כ-fallback נוסף בלבד, למקרה שסוג מסמך אחר יחזיר כך.
const extractDocumentUrl = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return val.he || val.en || val.origin || null;
};

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  try {
    const { body, keyId, keySecret } = JSON.parse(event.body);

    if (!keyId || !keySecret) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'חסרים מפתחות API של Morning (Key ID / Key Secret)' })
      };
    }

    // --- שלב 1: קבלת accessToken (OAuth 2.0 client credentials) ---
    const tokenResponse = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: keyId, client_secret: keySecret })
    });
    const tokenRawText = await tokenResponse.text();
    let tokenData = null;
    try { tokenData = JSON.parse(tokenRawText); } catch { /* מטופל למטה */ }

    const accessToken = tokenData && tokenData.accessToken;
    if (!tokenResponse.ok || !accessToken) {
      // תשובה תקינה בלי accessToken (למשל שינוי נוסף בפורמט) לא נחשבת הצלחה — לא ממשיכים בלי טוקן.
      const msg = tokenResponse.ok
        ? `התקבלה תשובה בלי accessToken מ-${AUTH_URL}`
        : describeAuthFailure(tokenResponse.status, tokenRawText);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: `אימות מול Morning נכשל: ${msg}` })
      };
    }

    // --- שלב 2: יצירת המסמך (דרישת תשלום, type 300) ---
    const response = await fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    const rawText = await response.text();

    // נסה לפרסר כ-JSON, אם לא — עטוף בהודעת שגיאה
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { error: `Morning returned (${response.status}): ${rawText}` };
    }

    if (!response.ok) {
      let msg;
      if (Array.isArray(data)) {
        msg = data.map((e) => `[${e.code ?? ''}] ${e.message ?? JSON.stringify(e)}`).join(' | ');
      } else {
        msg = data.errorMessage || data.error || JSON.stringify(data);
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: `שגיאת Morning ביצירת מסמך: ${msg}` })
      };
    }

    // כתובת המסמך המוכן להורדה/צפייה
    const url = extractDocumentUrl(data && data.url) || extractDocumentUrl(data && data.downloadLinks);
    if (!url) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: `המסמך נוצר ב-Morning אך לא התקבל קישור להורדה: ${JSON.stringify(data).slice(0, 300)}` })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ status: 1, data: url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
