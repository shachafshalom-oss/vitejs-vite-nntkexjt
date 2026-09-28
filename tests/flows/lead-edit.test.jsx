// בדיקת רגרסיה לבאג "עריכת ליד חוזרת למקור" — על הקוד האמיתי של App.tsx.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import * as T from '../harness/ui.js';

const fs = globalThis.__fs = globalThis.__fs || { store: {}, log: [], listeners: [], seq: 0 };
fs.store = {
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500 } } } },
  crm_customers: {
    L1: { status: 'lead', leadStage: 'contacted', businessName: 'בר ישן', contactName: 'דני', phone: '0501111111', email: '', address: '', notes: '', businessType: 'bar', assignedTo: 'shachafshalom@gmail.com', interactionLogs: [], createdAt: '2026-09-20T10:00:00.000Z' },
  },
};
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
const focus = async (el) => { await act(async () => { el.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); el.dispatchEvent(new window.FocusEvent('focus')); }); await flush(2); };
const blur = async (el) => { await act(async () => { el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); el.dispatchEvent(new window.FocusEvent('blur')); }); await flush(); };
const overview = () => { const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent.includes('תיק לקוח / ליד')); return h ? h.closest('.fixed') : null; };
const businessInput = () => { const f = document.getElementById('customerForm'); const l = f && Array.from(f.querySelectorAll('label')).find(x => x.textContent.includes('שם העסק')); return l ? l.parentElement.querySelector('input') : null; };
const submitForm = async () => { await act(async () => { document.getElementById('customerForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const L1 = () => fs.store.crm_customers.L1;

(async () => {
  const App = require('../../src/App.tsx').default;
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => { root.render(React.createElement(App)); });
  await flush(12);

  const rowText = Array.from(document.querySelectorAll('p,span,div')).find(el => el.children.length === 0 && el.textContent.trim() === 'בר ישן');
  await click(rowText);
  check(!!overview(), 'תיק הליד לא נפתח');

  // 1. עריכה ושמירה — נשמר ומוצג
  await click(document.querySelector('button[title="ערוך פרטים"]'));
  await setValue(businessInput(), 'בר חדש');
  await submitForm();
  check(L1().businessName === 'בר חדש', 'השינוי לא נשמר ב-Firestore');
  check(overview()?.textContent.includes('בר חדש') && !overview()?.textContent.includes('בר ישן'), 'תיק הליד עדיין מציג את השם הישן אחרי שמירה');

  // 2. פתיחת עריכה שוב — מציגה את העדכני, ושמירה לא דורסת
  await click(document.querySelector('button[title="ערוך פרטים"]'));
  check(businessInput()?.value === 'בר חדש', `טופס העריכה נפתח עם ערך ישן: ${businessInput()?.value}`);
  await submitForm();
  check(L1().businessName === 'בר חדש', 'שמירה שנייה דרסה את השינוי בחזרה לישן');

  // 3. שינוי של משתמש אחר מופיע בתיק הפתוח
  const api = globalThis.__fsApi;
  await act(async () => { await api.updateDoc(api.doc(null, 'crm_customers', 'L1'), { email: 'dani@bar.co.il' }); });
  await flush();
  check(overview()?.textContent.includes('dani@bar.co.il'), 'שינוי של משתמש אחר לא הופיע בתיק הפתוח');

  // 4. הקלדה בהערת התזכורת לא נדרסת ע"י עדכון שמגיע באמצע
  const noteInput = overview().querySelector('input[placeholder="הערה לתזכורת..."]');
  await focus(noteInput);
  await setValue(noteInput, 'להתקשר אחרי');
  await act(async () => { await api.updateDoc(api.doc(null, 'crm_customers', 'L1'), { address: 'תל אביב' }); });
  await flush();
  const noteNow = overview().querySelector('input[placeholder="הערה לתזכורת..."]');
  check(noteNow.value === 'להתקשר אחרי', `ההקלדה נדרסה ע"י עדכון שהגיע באמצע: "${noteNow.value}"`);
  check(overview()?.textContent.includes('תל אביב'), 'העדכון שהגיע באמצע ההקלדה לא הוצג');
  await blur(noteNow);
  check(L1().followUpNote === 'להתקשר אחרי', `הערת התזכורת לא נשמרה ביציאה מהשדה: ${L1().followUpNote}`);


  // 5. טופס עריכה פתוח + הערה שנוספה בינתיים ע"י משתמש אחר — השמירה לא מוחקת את ההערה
  await click(document.querySelector('button[title="ערוך פרטים"]'));
  await act(async () => { await api.updateDoc(api.doc(null, 'crm_customers', 'L1'), { interactionLogs: api.arrayUnion({ date: '2026-09-28T08:00:00.000Z', text: 'הערה של דניאל', user: 'danielyos205@gmail.com' }) }); });
  await flush();
  await setValue(businessInput(), 'בר חדש 2');
  await submitForm();
  check(L1().businessName === 'בר חדש 2', 'שמירת הטופס נכשלה');
  check((L1().interactionLogs || []).some(l => l.text === 'הערה של דניאל'), 'שמירת טופס שנפתח לפני ההערה מחקה אותה');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); T.finish(); });
