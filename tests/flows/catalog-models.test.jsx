// בדיקת אינטגרציה על הקוד האמיתי של App.tsx (לא העתק): האפליקציה המלאה עולה ב-jsdom,
// עם Firestore מדומה בזיכרון, ונבדקים תרחישי כרטיס הדגם מקצה לקצה.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import * as T from '../harness/ui.js';

const fs = globalThis.__fs = globalThis.__fs || { store: {}, log: [], listeners: [], seq: 0 };
fs.store = {
  crm_settings: {
    general_settings: {
      models: {
        'Prime': { id: 'm_prime', cbm: 1.2, listPrice: 9500, videoUrl: '', supplierId: 'sup1', deliveryDescription: 'עמדת בר', legacyExtra: 'keep-me', itemImgUrl: 'data:legacy-inline' },
        'Night': { id: 'm_night', cbm: 1, listPrice: 7800, videoUrl: '', supplierId: '', deliveryDescription: '' },
      },
      catalogMessageTemplate: 'template',
      morningApiKeyId: 'kid',
      morningApiKeySecret: 'ksecret',
    },
  },
  crm_model_images: { 'Prime': { itemImgUrl: 'data:image/png;base64,AAAA', blueprintUrl: '' } },
  crm_suppliers: {
    sup1: { name: 'Factory A', catalog: [{ model: 'Prime', unitCostUSD: 1000 }, { model: 'Night', unitCostUSD: 800 }] },
    sup2: { name: 'Factory B', catalog: [{ model: 'Night', unitCostUSD: 750 }] },
    sup3: { name: 'Factory C', catalog: [{ model: 'Prime', unitCostUSD: 0 }, { model: 'Night', unitCostUSD: 760 }] },
  },
  crm_items: {
    item1: { model: 'Night', modelId: 'm_night', status: 'in_stock', createdAt: '2026-09-01' },
    item2: { model: 'Prime', modelId: 'm_prime', status: 'sold', createdAt: '2026-09-02' },
  },
};

const alerts = T.ui.alerts, confirms = T.ui.confirms;
localStorage.setItem('crm_nav_space', 'operations');
localStorage.setItem('crm_nav_tab', 'models');

const check = T.check;

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const buttons = (root = document) => Array.from(root.querySelectorAll('button'));
const btn = (text, root = document) => buttons(root).find(b => b.textContent.trim().includes(text));
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
  await act(async () => { el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush(2);
};
const panel = () => { const b = btn('שמור דגם') || btn('צור דגם'); return b ? b.closest('.fixed') : null; };
const field = (labelText) => {
  const p = panel(); if (!p) return null;
  const label = Array.from(p.querySelectorAll('label')).find(l => l.textContent.includes(labelText));
  return label ? label.parentElement.querySelector('input,select') : null;
};
const settingsDoc = () => fs.store.crm_settings.general_settings;
const logSince = (seq) => fs.log.filter(e => e.seq > seq);
const lastSeq = () => fs.seq;

(async () => {
  const App = require('../../src/App.tsx').default;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(App)); });
  await flush(12);

  // --- T1: הרשימה הקומפקטית ---
  const rows = buttons().filter(b => b.title === 'פתח כרטיס דגם');
  check(rows.length === 2, `T1 צפויות 2 שורות דגם, נמצאו ${rows.length}`);
  check(!!btn('הקמת דגם חדש'), 'T1 חסר כפתור "הקמת דגם חדש"');
  check(!btn('שמור הגדרות (לוגו ודגמים)'), 'T1 כפתור השמירה הכללי עדיין מופיע בטאב');
  check(!document.body.textContent.includes('שם הדגם החדש'), 'T1 טופס ההוספה הישן עדיין מופיע');

  // --- T2: פתיחת כרטיס לפי id ---
  await click(rows.find(r => r.textContent.includes('Prime')));
  check(!!panel(), 'T2 הכרטיס לא נפתח');
  check(field('מחיר מחירון')?.value === '9500', `T2 מחיר מחירון צפוי 9500, התקבל ${field('מחיר מחירון')?.value}`);
  check(field('CBM')?.value === '1.2', `T2 CBM צפוי 1.2, התקבל ${field('CBM')?.value}`);
  check(btn('שמור דגם').disabled === true, 'T2 כפתור שמירה אמור להיות לא פעיל כשאין שינויים');

  // --- T3: טיוטה, אזהרת סגירה, שמירה ממוקדת ---
  await setValue(field('מחיר מחירון'), 9900);
  check(panel().textContent.includes('יש שינויים שלא נשמרו'), 'T3 אין סימון "יש שינויים שלא נשמרו"');
  check(settingsDoc().models.Prime.listPrice === 9500, 'T3 שינוי בטיוטה נכתב ל-Firestore לפני שמירה');
  T.answerConfirms(false);
  await click(panel().querySelector('button[title="סגור"]'));
  check(confirms.at(-1)?.includes('שינויים שלא נשמרו') && !!panel(), 'T3 סגירה עם שינויים לא ביקשה אישור / נסגרה למרות ביטול');
  let seq = lastSeq();
  await click(btn('שמור דגם'));
  let writes = logSince(seq);
  check(writes.length === 1, `T3 צפויה כתיבה אחת בדיוק, נמצאו ${writes.length}: ${JSON.stringify(writes.map(w => w.op + ':' + w.col))}`);
  const w = writes[0] || {};
  check(w.op === 'setDoc' && w.col === 'crm_settings' && w.merge === true, 'T3 הכתיבה אינה setDoc merge ל-crm_settings');
  check(w.data && Object.keys(w.data).length === 1 && Object.keys(w.data.models || {}).join() === 'Prime', `T3 הכתיבה כוללת יותר מהדגם עצמו: ${JSON.stringify(w.data)}`);
  check(settingsDoc().models.Prime.listPrice === 9900 && settingsDoc().models.Prime.id === 'm_prime', 'T3 המחיר/ה-id לא נשמרו נכון');
  check(settingsDoc().models.Prime.legacyExtra === 'keep-me', 'T3 שדה לא מוכר בדגם נמחק בשמירה');
  check(settingsDoc().models.Night.listPrice === 7800 && settingsDoc().morningApiKeyId === 'kid', 'T3 השמירה נגעה בדגם אחר או בהגדרות אחרות');
  check(!writes.some(x => x.col === 'crm_model_images'), 'T3 תמונה נכתבה למרות שלא השתנתה');
  check(settingsDoc().models.Prime.itemImgUrl === undefined, 'T3 שדה תמונה ישן (inline) לא נמחק בשמירה');
  check(panel().textContent.includes('כל השינויים שמורים'), 'T3 אין סימון "כל השינויים שמורים" אחרי שמירה');
  await click(panel().querySelector('button[title="סגור"]'));
  check(!panel(), 'T3 הכרטיס לא נסגר אחרי שמירה');

  // --- T3c: הקלדה חוזרת של אותו ערך לא נחשבת שינוי ---
  await click(buttons().filter(b => b.title === 'פתח כרטיס דגם').find(r => r.textContent.includes('Night')));
  await setValue(field('CBM'), '1');
  check(panel().textContent.includes('כל השינויים שמורים'), 'T3c הקלדת אותו ערך סומנה כשינוי שלא נשמר');
  await click(panel().querySelector('button[title="סגור"]'));

  // --- T4: חסימת כפילות (באג קריטי) ---
  await click(btn('הקמת דגם חדש'));
  check(!!btn('צור דגם'), 'T4 כרטיס הקמה לא נפתח');
  await setValue(field('שם הדגם'), '  prime ');
  seq = lastSeq();
  await click(btn('צור דגם'));
  check(logSince(seq).length === 0, 'T4 נכתב משהו למרות שם כפול');
  check(alerts.at(-1)?.includes('"Prime" כבר קיים'), `T4 לא הוצגה התראת כפילות: ${alerts.at(-1)}`);
  check(settingsDoc().models.Prime.id === 'm_prime' && settingsDoc().models.Prime.listPrice === 9900, 'T4 הדגם הקיים נדרס');

  // --- T5: הקמת דגם חדש תקין ---
  await setValue(field('שם הדגם'), 'Grand');
  await setValue(field('CBM'), 1.3);
  await setValue(field('מחיר מחירון'), 8200);
  seq = lastSeq();
  await click(btn('צור דגם'));
  writes = logSince(seq);
  check(writes.length === 1 && writes[0].merge === true && Object.keys(writes[0].data.models).join() === 'Grand', `T5 כתיבת ההקמה לא ממוקדת: ${JSON.stringify(writes)}`);
  const grand = settingsDoc().models.Grand;
  check(grand && /^m_/.test(grand.id) && grand.cbm === 1.3 && grand.listPrice === 8200, `T5 הדגם החדש לא נשמר נכון: ${JSON.stringify(grand)}`);
  check(Object.keys(settingsDoc().models).length === 3, 'T5 מספר הדגמים אחרי הקמה שגוי');
  check(!!btn('שמור דגם') && panel().textContent.includes('Grand'), 'T5 הכרטיס לא עבר למצב עריכה של הדגם החדש');
  await click(panel().querySelector('button[title="סגור"]'));

  // --- T6: שינוי שם מתוך הכרטיס — הכרטיס שורד (לפי id) + ספקים מתעדכנים ---
  await click(buttons().filter(b => b.title === 'פתח כרטיס דגם').find(r => r.textContent.includes('Night')));
  await click(panel().querySelector('button[title^="ערוך שם דגם"]'));
  const nameInput = panel().querySelector('input[type="text"]');
  await setValue(nameInput, 'Night   Pro');
  T.answerConfirms(true);
  seq = lastSeq();
  await click(btn('שמור שם'));
  writes = logSince(seq);
  check(confirms.at(-1)?.includes('3 קטלוגי ספקים'), `T6 חלון האישור לא מציג ספקים: ${confirms.at(-1)}`);
  const renameWrite = writes.find(x => x.op === 'updateDoc' && x.col === 'crm_settings');
  check(renameWrite && renameWrite.paths.length === 2 && renameWrite.paths[0].value === '__DELETE__', `T6 שינוי השם לא נכתב כשני נתיבים בלבד: ${JSON.stringify(renameWrite)}`);
  check(!settingsDoc().models.Night && settingsDoc().models['Night Pro']?.id === 'm_night', 'T6 המפתח בקטלוג לא הוחלף');
  check(settingsDoc().models.Prime.listPrice === 9900 && settingsDoc().catalogMessageTemplate === 'template', 'T6 שינוי השם נגע בדגמים/הגדרות אחרים');
  const s1 = fs.store.crm_suppliers.sup1.catalog, s2 = fs.store.crm_suppliers.sup2.catalog;
  check(s1.some(c => c.model === 'Night Pro' && c.modelId === 'm_night' && c.unitCostUSD === 800), `T6 קטלוג ספק A לא עודכן: ${JSON.stringify(s1)}`);
  check(s2.some(c => c.model === 'Night Pro' && c.unitCostUSD === 750), `T6 קטלוג ספק B לא עודכן: ${JSON.stringify(s2)}`);
  check(fs.store.crm_items.item1.model === 'Night Pro', 'T6 פריט המלאי לא עודכן');
  check(!!panel() && panel().textContent.includes('Night Pro'), 'T6 הכרטיס לא שרד את שינוי השם');

  // --- T7: מיזוג מתוך הכרטיס — ספק עם שני הדגמים שומר את מחיר היעד; הכרטיס נסגר ---
  await click(btn('מזג', panel()));
  const mergeSelect = Array.from(panel().querySelectorAll('select')).find(s => s.textContent.includes('בחר דגם יעד'));
  await setValue(mergeSelect, 'Prime');
  T.answerConfirms(true);
  await click(btn('בצע מיזוג'));
  const a1 = fs.store.crm_suppliers.sup1.catalog, b1 = fs.store.crm_suppliers.sup2.catalog;
  check(a1.length === 1 && a1[0].model === 'Prime' && a1[0].unitCostUSD === 1000, `T7 ספק A: מחיר היעד לא נשמר / נשארה כפילות: ${JSON.stringify(a1)}`);
  check(b1.length === 1 && b1[0].model === 'Prime' && b1[0].modelId === 'm_prime' && b1[0].unitCostUSD === 750, `T7 ספק B לא הועבר ליעד: ${JSON.stringify(b1)}`);
  const c1 = fs.store.crm_suppliers.sup3.catalog;
  check(c1.length === 1 && c1[0].model === 'Prime' && c1[0].unitCostUSD === 760, `T7 ספק C: מחיר המקור אבד כשליעד אין מחיר: ${JSON.stringify(c1)}`);
  check(!settingsDoc().models['Night Pro'] && settingsDoc().models.Prime.id === 'm_prime' && settingsDoc().models.Prime.listPrice === 9900, 'T7 הקטלוג אחרי מיזוג שגוי');
  check(fs.store.crm_items.item1.model === 'Prime' && fs.store.crm_items.item1.modelId === 'm_prime', 'T7 פריט המלאי לא הוצמד ליעד');
  check(!panel(), 'T7 הכרטיס לא נסגר אחרי מיזוג');

  // --- T8: שמירת מפתחות Morning לא כותבת דגמים ---
  const settingsTab = buttons().find(b => b.textContent.trim() === 'הגדרות');
  await click(settingsTab);
  const morningSave = buttons().find(b => b.textContent.trim() === 'שמור' && b.closest('div')?.parentElement?.textContent.includes('Key Secret') || (b.textContent.trim() === 'שמור' && b.parentElement?.querySelector('input[type="password"]')));
  if (morningSave) {
    seq = lastSeq();
    await click(morningSave);
    const mw = logSince(seq).filter(x => x.col === 'crm_settings');
    check(mw.length === 1 && !('models' in mw[0].data), `T8 שמירת Morning כתבה דגמים: ${JSON.stringify(mw)}`);
  } else { check(false, 'T8 לא נמצא כפתור שמירת Morning'); }
  const templateSave = buttons().filter(b => b.textContent.trim() === 'שמור').find(b => b.parentElement?.querySelector('textarea'));
  if (templateSave) {
    seq = lastSeq();
    await click(templateSave);
    const tw = logSince(seq);
    check(tw.length === 1 && tw[0].col === 'crm_settings' && !('models' in tw[0].data) && tw[0].merge === true, `T8 saveSettings כתב דגמים/תמונות: ${JSON.stringify(tw.map(x => ({ op: x.op, col: x.col, keys: Object.keys(x.data || {}) })))}`);
    check(Object.keys(settingsDoc().models).length === 2, 'T8 הדגמים נפגעו אחרי שמירת הגדרות');
  } else { check(false, 'T8 לא נמצא כפתור שמירת התבנית'); }

  // --- T9: FAB פותח את כרטיס ההקמה ---
  const fabToggle = buttons().find(b => b.className.includes('rounded-full') && b.className.includes('shadow-xl'));
  await click(fabToggle);
  await click(btn('הקמת דגם חדש'));
  check(!!btn('צור דגם'), 'T9 ה-FAB לא פתח את כרטיס ההקמה');

  // --- T10: משתמש אחר מוחק/ממזג את הדגם בזמן שיש עריכה לא שמורה — הודעה במקום היעלמות שקטה ---
  await click(panel().querySelector('button[title="סגור"]'));
  await click(buttons().find(b => b.textContent.trim() === 'דגמים'));
  const grandRow = buttons().filter(b => b.title === 'פתח כרטיס דגם').find(r => r.textContent.includes('Grand'));
  if (grandRow) {
    await click(grandRow);
    await setValue(field('מחיר מחירון'), 8300);
    const before = alerts.length;
    const fsMock = globalThis.__fsApi;
    await act(async () => { await fsMock.updateDoc(fsMock.doc(null, 'crm_settings', 'general_settings'), new fsMock.FieldPath('models', 'Grand'), fsMock.deleteField()); });
    await flush();
    check(!panel(), 'T10 הכרטיס לא נסגר כשהדגם נמחק בידי משתמש אחר');
    check(alerts.length === before + 1 && alerts.at(-1).includes('בידי משתמש אחר'), `T10 לא הוצגה הודעה על ביטול שינויים: ${alerts.at(-1)}`);
  } else { check(false, 'T10 שורת Grand לא נמצאה'); }

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); T.finish(); });
