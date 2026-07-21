// netlify/functions/morning-proxy.js
//
// פרוקסי בין ה-CRM (App.tsx) לבין Morning (חשבונית ירוקה) API.
// מחליף את finbot-proxy.js הישן. נבנה במוסכמה זהה לקובץ המקורי (הושוותי מול הקוד
// האמיתי ששחף שלח, 20.7.2026) — exports.handler, אותו מבנה try/catch, ואותו
// header של Access-Control-Allow-Origin.
//
// הבדל ארכיטקטוני מרכזי מול Finbot: Morning דורש שני שלבי אימות —
//   1. POST ל-/account/token עם Key ID + Key Secret → מחזיר JWT (תקף כ-30 דקות)
//   2. שימוש ב-JWT בכל קריאה נוספת (Authorization: Bearer <token>)
// לכן הפונקציה הזו מבצעת את שני השלבים בכל קריאה (בלי caching של הטוקן —
// אישורי הצעות מחיר הם פעולה נדירה מספיק שאין צורך באופטימיזציה כאן).
//
// חוזה התשובה ללקוח (App.tsx) זהה בכוונה למה ש-finbot-proxy החזיר, כדי לשמור
// על לוגיקת הפענוח בצד הלקוח פשוטה ועקבית:
//   הצלחה: { status: 1, data: "<url למסמך>" }
//   כשל:   { error: "<הודעת שגיאה קריאה בעברית/אנגלית>" }
//
// לפי בקשת שחף — פועל ישירות מול סביבת הייצור של Morning (לא sandbox), כי
// מדובר במסמכי "דרישת תשלום" בלבד (לא-מחייבים); חשבוניות המס מופקות בנפרד.

const BASE_URL = 'https://api.greeninvoice.co.il/api/v1';

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

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

    // --- שלב 1: קבלת JWT token ---
    const tokenResponse = await fetch(`${BASE_URL}/account/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: keyId, secret: keySecret })
    });
    const tokenRawText = await tokenResponse.text();
    let tokenData;
    try {
      tokenData = JSON.parse(tokenRawText);
    } catch {
      tokenData = { error: `Morning token endpoint returned (${tokenResponse.status}): ${tokenRawText}` };
    }

    if (!tokenResponse.ok || !tokenData.token) {
      const msg = tokenData.errorMessage || tokenData.error || `קוד ${tokenResponse.status}`;
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
        'Authorization': `Bearer ${tokenData.token}`
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

    // כתובת המסמך המוכן להורדה/צפייה — מוחזרת מ-Morning תחת downloadLinks
    const url = (data && data.downloadLinks && (data.downloadLinks.he || data.downloadLinks.en)) || null;
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
