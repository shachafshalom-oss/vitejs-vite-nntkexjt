// בדיקות מיזוג לידים — על הקוד האמיתי של App.tsx עם Firestore מדומה.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import * as T from '../harness/ui.js';

const SH = 'shachafshalom@gmail.com', DN = 'danielyos205@gmail.com';
const fs = globalThis.__fs = globalThis.__fs || { store: {}, log: [], listeners: [], seq: 0 };
fs.store = {
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500 } } } },
  crm_customers: {
    L1: { status: 'lead', leadStage: 'contacted', businessName: 'בר הים', contactName: 'דני', phone: '050-111-1111', email: '', address: 'חיפה', notes: '', hp: '', businessType: 'bar', assignedTo: SH, campaignId: 'c1', possibleDuplicateOfId: 'L2', interactionLogs: [{ date: '2026-09-10T10:00:00.000Z', text: 'שיחה 1', user: SH }], createdAt: '2026-09-20T10:00:00.000Z' },
    L2: { status: 'lead', leadStage: 'new', businessName: 'בר הים', contactName: 'דניאל כהן', phone: '0501111111', email: 'dani@yam.co.il', address: 'תל אביב', notes: 'מעוניין ב-Prime', hp: '', businessType: 'bar', assignedTo: DN, campaignId: 'c2', interactionLogs: [{ date: '2026-09-05T10:00:00.000Z', text: 'פנייה ראשונה', user: DN }], createdAt: '2026-09-01T10:00:00.000Z' },
    L3: { status: 'lead', leadStage: 'new', businessName: 'בר הים', contactName: '', phone: '+972501111111', email: '', address: '', notes: '', hp: '123456789', businessType: 'bar', assignedTo: SH, interactionLogs: [{ date: '2026-09-15T10:00:00.000Z', text: 'וואטסאפ', user: SH }], createdAt: '2026-09-15T10:00:00.000Z' },
    L4: { status: 'lead', leadStage: 'new', businessName: 'בר אחר לגמרי', contactName: 'רון', phone: '0529999999', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-18T10:00:00.000Z' },
    L5: { status: 'lead', leadStage: 'new', businessName: 'מסעדת הגפן', contactName: 'יוסי', phone: '0527777777', assignedTo: SH, possibleDuplicateOfId: 'L2', interactionLogs: [], createdAt: '2026-09-19T10:00:00.000Z' },
    C1: { status: 'active', businessName: 'בר הים (לקוח)', contactName: 'דני', phone: '0501111111', assignedTo: SH, interactionLogs: [], createdAt: '2026-01-01T10:00:00.000Z' },
    L6: { status: 'lead', leadStage: 'new', businessName: 'פאב הנמל', contactName: 'גל', phone: '0533333333', assignedTo: SH, possibleDuplicateOfId: 'L7', interactionLogs: [], createdAt: '2026-09-21T10:00:00.000Z' },
    L7: { status: 'lead', leadStage: 'quote_sent', businessName: 'פאב הנמל ישן', contactName: 'גל', phone: '0533333333', assignedTo: DN, followUpDate: '2026-10-01', followUpNote: 'לחזור אחרי הצעה', interactionLogs: [], createdAt: '2026-08-01T10:00:00.000Z' },
    L8: { status: 'lead', leadStage: 'new', businessName: 'קפה חוזר', contactName: 'נועה', phone: '0501111111x', assignedTo: SH, possibleDuplicateOfId: 'C1', interactionLogs: [], createdAt: '2026-09-22T10:00:00.000Z' },
    L11: { status: 'lead', leadStage: 'new', businessName: 'בר רוח', contactName: 'עדי', phone: '0555555555', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-25T10:00:00.000Z' },
    L12: { status: 'lead', leadStage: 'contacted', businessName: 'בר רוח ותיק', contactName: 'עדי', phone: '0555555556', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-02T10:00:00.000Z' },
    L13: { status: 'lead', leadStage: 'contacted', businessName: 'מסבאה שקטה', contactName: 'שי', phone: '0566666666', assignedTo: '', createdBy: SH, interactionLogs: [], createdAt: '2026-09-26T10:00:00.000Z' },
    L14: { status: 'lead', leadStage: 'new', businessName: 'מסבאה שקטה 2', contactName: 'שי', phone: '0566666666', assignedTo: DN, followUpDate: '2026-10-05', followUpNote: 'להתקשר בבוקר', interactionLogs: [], createdAt: '2026-09-10T10:00:00.000Z' },
    L15: { status: 'lead', leadStage: 'new', businessName: 'בר מקביל', contactName: 'רז', phone: '0577777777', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-27T10:00:00.000Z' },
    L16: { status: 'lead', leadStage: 'new', businessName: 'בר מקביל 2', contactName: 'רז', phone: '0577777777', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-11T10:00:00.000Z' },
    L9: { status: 'lead', leadStage: 'new', businessName: 'בר תקלה', contactName: 'אבי', phone: '0544444444', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-23T10:00:00.000Z' },
    L10: { status: 'lead', leadStage: 'new', businessName: 'בר תקלה 2', contactName: 'אבי', phone: '0544444444', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-24T10:00:00.000Z' },
  },
  crm_quotes: { Q1: { customerId: 'L2', date: '2026-09-06', items: [] }, Q2: { customerId: 'L4', date: '2026-09-18', items: [] } },
  crm_customer_deliveries: { D1: { customerId: 'L3', status: 'awaiting' } },
  crm_custom_projects: { P1: { customerId: 'L2', name: 'בר מותאם', products: [] } },
  crm_items: { I1: { customerId: 'L3', model: 'Prime', modelId: 'm_prime', status: 'sold', createdAt: '2026-09-02' } },
};

const alerts = T.ui.alerts, confirms = T.ui.confirms;
localStorage.setItem('crm_nav_space', 'sales');
localStorage.setItem('crm_nav_tab', 'leads');

const check = T.check;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const setValue = async (el, value) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(value));
  await act(async () => { el.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await flush(2);
};
const buttons = (root = document) => Array.from(root.querySelectorAll('button'));
const btn = (text, root = document) => buttons(root).find(b => b.textContent.trim().includes(text));
const picker = () => { const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('מיזוג לידים לתוך')); return h ? h.closest('.fixed') : null; };
const overview = () => { const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('תיק לקוח / ליד')); return h ? h.closest('.fixed') : null; };
const C = () => fs.store.crm_customers;
const openLead = async (name) => {
  if (overview()) { await click(overview().querySelector('button[title="סגור"], .text-slate-400.hover\\:text-slate-600')); }
  const el = Array.from(document.querySelectorAll('p,span,div')).find(e => e.children.length === 0 && e.textContent.trim() === name);
  if (!el) return false;
  await click(el);
  return !!overview();
};
const pickerNames = () => Array.from(picker().querySelectorAll('label p.font-bold')).map(p => p.textContent.trim());
const checkboxFor = (name) => Array.from(picker().querySelectorAll('label')).find(l => l.textContent.includes(name))?.querySelector('input[type="checkbox"]');

let api;
(async () => {
  const App = require('../../src/App.tsx').default;
  api = globalThis.__fsApi;
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => { root.render(React.createElement(App)); });
  await flush(12);

  // --- M1: פתיחת חלון מיזוג מתוך L1 ---
  check(await openLead('בר הים'), 'M1 לא נפתח תיק הליד L1');
  // יש שלושה לידים בשם "בר הים" — מוודאים שפתחנו את L1 (איש קשר דני, חיפה)
  if (!overview().textContent.includes('חיפה')) {
    const all = Array.from(document.querySelectorAll('p,span,div')).filter(e => e.children.length === 0 && e.textContent.trim() === 'בר הים');
    for (const el of all) { await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600')); await click(el); if (overview()?.textContent.includes('חיפה')) break; }
  }
  check(overview()?.textContent.includes('חיפה'), 'M1 לא הצלחנו לפתוח את L1');
  const mergeBtn = overview().querySelector('button[title="מזג לידים כפולים לתוך ליד זה"]');
  check(!!mergeBtn, 'M1 אין כפתור מיזוג בתיק ליד');
  await click(mergeBtn);
  check(!!picker(), 'M1 חלון המיזוג לא נפתח');
  const suggested = pickerNames();
  check(suggested.length === 2 && picker().textContent.includes('אותו טלפון (2)'), `M1 הצעות "אותו טלפון" שגויות: ${JSON.stringify(suggested)}`);
  check(!picker().textContent.includes('בר הים (לקוח)'), 'M1 לקוח פעיל מוצע למיזוג');

  // --- M2: חיפוש חופשי ---
  await setValue(picker().querySelector('input[type="text"]'), 'בר אחר');
  check(pickerNames().includes('בר אחר לגמרי'), 'M2 החיפוש לא מצא ליד אחר');
  await setValue(picker().querySelector('input[type="text"]'), '');

  // --- M3: ביטול בחלון האישור — שום דבר לא משתנה ---
  await click(btn('סמן את כולם', picker()));
  const selectedCount = Array.from(picker().querySelectorAll('input[type="checkbox"]')).filter(c => c.checked).length;
  check(selectedCount === 2, `M3 "סמן את כולם" סימן ${selectedCount}`);
  const beforeSeq = fs.seq;
  T.answerConfirms(false);
  await click(btn('מזג 2 לידים', picker()));
  check(fs.seq === beforeSeq && C().L2 && C().L3, 'M3 נכתב משהו למרות ביטול');
  check(confirms.at(-1)?.includes('1 הצעות מחיר') && confirms.at(-1)?.includes('3 רשומות ביומן') === false && confirms.at(-1)?.includes('2 רשומות ביומן'), `M3 ספירות בחלון האישור שגויות: ${confirms.at(-1)}`);

  // --- M4: מיזוג בפועל ---
  T.answerConfirms(true);
  const seq0 = fs.seq;
  await click(btn('מזג 2 לידים', picker()));
  const writes = fs.log.filter(e => e.seq > seq0);
  check(!C().L2 && !C().L3, 'M4 הלידים הנספגים לא נמחקו');
  check(C().L4 && C().C1 && C().L5, 'M4 נמחק ליד/לקוח שלא נבחר');
  const L1 = C().L1;
  check(L1.businessName === 'בר הים' && L1.contactName === 'דני' && L1.address === 'חיפה', 'M4 שדה מלא בשורד נדרס');
  check(L1.email === 'dani@yam.co.il' && L1.notes === 'מעוניין ב-Prime' && L1.hp === '123456789', `M4 שדות ריקים לא התמלאו: ${JSON.stringify({ e: L1.email, n: L1.notes, hp: L1.hp })}`);
  check(L1.assignedTo === SH && L1.campaignId === 'c1' && L1.leadStage === 'contacted' && L1.createdAt === '2026-09-20T10:00:00.000Z', 'M4 הגדרות השורד (נציג/קמפיין/שלב/תאריך) השתנו');
  check(L1.possibleDuplicateOfId === null, 'M4 קישור "פנייה חוזרת" לנספג לא נוקה');
  const texts = (L1.interactionLogs || []).map(l => l.text);
  check(texts[0] === 'פנייה ראשונה' && texts[1] === 'שיחה 1' && texts[2] === 'וואטסאפ', `M4 יומן לא מאוחד לפי תאריך: ${JSON.stringify(texts)}`);
  const sys = (L1.interactionLogs || []).filter(l => l.type === 'system' && l.text.startsWith('מוזג לתוך ליד זה'));
  check(sys.length === 2, `M4 חסרות שורות מערכת של מיזוג: ${sys.length}`);
  check(sys.some(l => l.text.includes('כתובת: תל אביב') && l.text.includes('איש קשר: דניאל כהן')), `M4 ערכים שונים לא נרשמו ביומן: ${JSON.stringify(sys.map(l => l.text))}`);
  check(!sys.some(l => l.text.includes('טלפון:')), 'M4 טלפון זהה בפורמט אחר נרשם כ"ערך שונה"');
  check(Array.isArray(L1.mergedFrom) && L1.mergedFrom.length === 2 && L1.mergedFrom.map(m => m.id).sort().join() === 'L2,L3', 'M4 עותק גיבוי חסר');
  check(L1.mergedFrom.every(m => m.snapshot && !('interactionLogs' in m.snapshot) && m.mergedBy === SH), 'M4 מבנה עותק הגיבוי שגוי');
  check(L1.mergedFrom.find(m => m.id === 'L2').snapshot.email === 'dani@yam.co.il', 'M4 עותק הגיבוי לא מכיל את נתוני הנספג');
  const S = fs.store;
  check(S.crm_quotes.Q1.customerId === 'L1' && S.crm_quotes.Q2.customerId === 'L4', 'M4 הצעות מחיר לא הועברו נכון');
  check(S.crm_customer_deliveries.D1.customerId === 'L1', 'M4 הובלה לא הועברה');
  check(S.crm_custom_projects.P1.customerId === 'L1', 'M4 פרויקט קסטום לא הועבר');
  check(S.crm_items.I1.customerId === 'L1', 'M4 פריט לא הועבר');
  check(C().L5.possibleDuplicateOfId === 'L1', 'M4 ליד אחר שהצביע על הנספג לא הופנה לשורד');
  check(writes.length === 8, `M4 מספר כתיבות צפוי 8, בפועל ${writes.length}: ${JSON.stringify(writes.map(w => w.op + ':' + w.col + '/' + w.id))}`);
  check(!picker(), 'M4 חלון המיזוג לא נסגר');
  check(overview()?.textContent.includes('dani@yam.co.il'), 'M4 תיק הליד לא מציג את הנתונים הממוזגים');

  // --- M5: "מזג פנייה זו לתוך הפנייה הקודמת" — הפנייה החדשה נספגת בוותיקה ---
  await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600'));
  check(await openLead('פאב הנמל'), 'M5 לא נפתח L6');
  const prevBtn = btn('מזג פנייה זו לתוך הפנייה הקודמת', overview());
  check(!!prevBtn, 'M5 אין כפתור מיזוג ליד "פנייה חוזרת"');
  if (prevBtn) {
    await click(prevBtn);
    check(overview()?.textContent.includes('פאב הנמל ישן'), 'M5 התיק לא עבר לפנייה הוותיקה (השורדת)');
    check(checkboxFor('פאב הנמל')?.checked === true && picker().textContent.includes('מיזוג לידים לתוך: פאב הנמל ישן'), 'M5 הפנייה החדשה לא סומנה / השורד שגוי');
    T.answerConfirms(true);
    await click(btn('מזג 1 לידים', picker()));
    check(!C().L6 && !!C().L7, 'M5 הכיוון שגוי: צפוי ש-L6 (חדש) יימחק ו-L7 (ותיק) ישרוד');
    check(C().L7.leadStage === 'quote_sent' && C().L7.assignedTo === DN && C().L7.followUpNote === 'לחזור אחרי הצעה', 'M5 השלב/הנציג/התזכורת של הליד הוותיק נדרסו');
    const m5log = (C().L7.interactionLogs || []).find(l => l.text.startsWith('מוזג לתוך ליד זה'));
    check(m5log && m5log.text.includes('שלב: חדש') && m5log.text.includes('נציג: שחף'), `M5 שלב/נציג שונים לא נרשמו ביומן: ${m5log?.text}`);
  }

  // --- M6: פנייה חוזרת שמובילה ללקוח פעיל — אין כפתור מיזוג ---
  await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600'));
  check(await openLead('קפה חוזר'), 'M6 לא נפתח L8');
  check(!btn('מזג את הפנייה הקודמת לכאן', overview()), 'M6 מוצע מיזוג לתוך לקוח פעיל');

  // --- M7: כשל בכתיבה — הודעה ברורה, ושום דבר לא השתנה ---
  await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600'));
  check(await openLead('בר תקלה'), 'M7 לא נפתח L9');
  const realTx = api.runTransaction;
  api.runTransaction = async () => { throw new Error('network down'); };
  await click(overview().querySelector('button[title="מזג לידים כפולים לתוך ליד זה"]'));
  await click(btn('סמן את כולם', picker()));
  T.answerConfirms(true);
  const seq7 = fs.seq;
  await click(btn('מזג 1 לידים', picker()));
  api.runTransaction = realTx;
  check(fs.seq === seq7 && C().L10, 'M7 משהו נכתב למרות כשל');
  check(alerts.at(-1)?.includes('שום שינוי לא נשמר'), `M7 הודעת כשל חסרה: ${alerts.at(-1)}`);
  check(!!picker(), 'M7 חלון המיזוג נסגר למרות כשל');


  // --- M8: אחד הלידים הפך ללקוח בזמן שחלון האישור היה פתוח — המיזוג לא מתבצע ---
  await click(document.querySelector('button[title="סגור חלון מיזוג"]'));
  await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600'));
  check(await openLead('בר רוח'), 'M8 לא נפתח L11');
  await click(overview().querySelector('button[title="מזג לידים כפולים לתוך ליד זה"]'));
  await setValue(picker().querySelector('input[type="text"]'), 'בר רוח ותיק');
  const cb12 = checkboxFor('בר רוח ותיק');
  await act(async () => { cb12.click(); }); await flush(2);
  const origConfirm = window.confirm;
  window.confirm = globalThis.confirm = (m) => { confirms.push(m); api.updateDoc(api.doc(null, 'crm_customers', 'L12'), { status: 'active' }); return true; };
  await click(btn('מזג 1 לידים', picker()));
  window.confirm = globalThis.confirm = origConfirm;
  check(!!C().L12 && !!C().L11 && !C().L11.mergedFrom, 'M8 מוזג/נמחק לקוח שהפך לפעיל בינתיים');
  check(alerts.at(-1)?.includes('שונה בינתיים'), `M8 הודעה חסרה: ${alerts.at(-1)}`);

  // --- M9: הערה שנוספה לשורד בזמן האישור לא הולכת לאיבוד ---
  await click(document.querySelector('button[title="סגור חלון מיזוג"]'));
  await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600'));
  check(await openLead('בר מקביל'), 'M9 לא נפתח L15');
  await click(overview().querySelector('button[title="מזג לידים כפולים לתוך ליד זה"]'));
  await click(btn('סמן את כולם', picker()));
  window.confirm = globalThis.confirm = (m) => { confirms.push(m); api.updateDoc(api.doc(null, 'crm_customers', 'L15'), { interactionLogs: api.arrayUnion({ date: '2026-09-28T09:00:00.000Z', text: 'הערה של דניאל באמצע', user: DN }) }); return true; };
  await click(btn('מזג 1 לידים', picker()));
  window.confirm = globalThis.confirm = origConfirm;
  check(!C().L16 && (C().L15.interactionLogs || []).some(l => l.text === 'הערה של דניאל באמצע'), 'M9 הערה שנוספה בזמן האישור נמחקה');

  // --- M10: שורד בלי נציג מקבל נציג מהנספג — בלי התראת "ליד חדש"; תזכורת עוברת כזוג ---
  await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600'));
  check(await openLead('מסבאה שקטה'), 'M10 לא נפתח L13');
  await click(overview().querySelector('button[title="מזג לידים כפולים לתוך ליד זה"]'));
  await click(btn('סמן את כולם', picker()));
  T.answerConfirms(true);
  await click(btn('מזג 1 לידים', picker()));
  const L13 = C().L13;
  check(L13.assignedTo === DN && !!L13.pushSentAt, `M10 נציג מולא בלי pushSentAt: ${JSON.stringify({ a: L13.assignedTo, p: L13.pushSentAt })}`);
  check(L13.followUpDate === '2026-10-05' && L13.followUpNote === 'להתקשר בבוקר', 'M10 התזכורת לא עברה כזוג');

  // --- M11: משתמש אחר מיזג את הליד שפתוח אצלי — התיק עובר לשורד ---
  const L11open = await (async () => { await click(overview().querySelector('.text-slate-400.hover\\:text-slate-600')); return openLead('בר רוח'); })();
  check(L11open, 'M11 לא נפתח L11');
  await act(async () => {
    await api.updateDoc(api.doc(null, 'crm_customers', 'L12'), { status: 'lead', mergedFrom: [{ id: 'L11', mergedAt: 'x', snapshot: {} }] });
    await api.deleteDoc(api.doc(null, 'crm_customers', 'L11'));
  });
  await flush();
  check(overview()?.textContent.includes('בר רוח ותיק'), 'M11 התיק לא עבר לליד השורד');
  check(alerts.at(-1)?.includes('מוזג לתוך'), `M11 אין הודעה למשתמש: ${alerts.at(-1)}`);

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); T.finish(); });
