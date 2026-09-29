// כלי עזר משותפים לבדיקות התהליכים: הרצת האפליקציה, לחיצות, הקלדה, איתור לפי data-testid,
// ומנגנון בדיקות (check / knownBug) עם סיכום אחיד שה-runner קורא.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
export { act };

export const fs = (globalThis.__fs = globalThis.__fs || { store: {}, log: [], listeners: [], seq: 0 });
export const ui = globalThis.__ui;
export const api = () => globalThis.__fsApi;

// ---------- תוצאות וזמן (משותף גם לבדיקות פונקציות השרת) ----------
import checks from './checks.cjs';
export const { describe, check, knownBug, finish, crash, freezeTime } = checks;

// ---------- הרצה ----------
export function seed(store) { fs.store = JSON.parse(JSON.stringify(store)); fs.log = []; }
export function setNav(space, tab) { localStorage.setItem('crm_nav_space', space); localStorage.setItem('crm_nav_tab', tab); }

export const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
export const sleep = async (ms) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); await flush(2); };

export async function mountApp(App) {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => { root.render(React.createElement(App)); });
  await flush(12);
  return root;
}

// ---------- איתור ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const byId = (id, root = document) => root.querySelector(`[data-testid="${id}"]`);
export const allById = (id, root = document) => $$(`[data-testid="${id}"]`, root);
export const byIdPrefix = (prefix, root = document) => $$(`[data-testid^="${prefix}"]`, root);
export const text = (root = document.body) => (root ? root.textContent : '');
// האם סכום מוצג כמספר שלם בדיוק (4,625 ולא 14,625 או 4,6250)
export function amountShown(n, root = document.body) {
  const f = Number(n).toLocaleString('en-US');
  return new RegExp(`(^|[^\\d,.])${f.replace(/,/g, ',')}(?![\\d,])`).test(text(root));
}
export const buttonByText = (t, root = document) => $$('button', root).find(b => b.textContent.trim().includes(t));
// שדה לפי טקסט התווית שמעליו (ברוב הטפסים באפליקציה התווית לא מקושרת ל-input)
export function fieldByLabel(labelText, root = document) {
  const label = $$('label', root).find(l => l.textContent.includes(labelText));
  return label ? label.parentElement.querySelector('input,select,textarea') : null;
}
// מודאל פתוח שמכיל כותרת מסוימת
export function modalWithTitle(t) {
  const h = $$('h2,h3').find(x => x.textContent.includes(t));
  return h ? h.closest('.fixed') : null;
}

// ---------- פעולות משתמש ----------
export async function click(el) {
  if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await flush();
}
export async function mouseDown(el) {
  if (!el) throw new Error('mouseDown: element not found');
  await act(async () => { el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })); });
  await flush();
}
export async function type(el, value) {
  if (!el) throw new Error('type: element not found');
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
  await act(async () => { el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush(2);
  // בחירת אפשרות שלא קיימת (או שדה שהקוד מאפס) לא אמורה לעבור בשקט
  if (String(el.value) !== String(value)) throw new Error(`type: הערך "${value}" לא נקלט בשדה (נשאר "${el.value}")`);
}
export const select = type;
// select שמשמש כ"כפתור פעולה" (למשל סטטוס הצעה/משלוח שפותח חלון אישור) — הערך שלו נשאר
// הישן עד שהפעולה מאושרת, ולכן כאן לא מוודאים שהערך "נקלט".
export async function selectAction(el, value) {
  if (!el) throw new Error('selectAction: element not found');
  if (!Array.from(el.options).some(o => o.value === String(value))) throw new Error(`selectAction: אין אפשרות "${value}"`);
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, String(value));
  await act(async () => { el.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await flush(2);
}
export async function focus(el) { await act(async () => { el.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); el.dispatchEvent(new window.FocusEvent('focus')); }); await flush(2); }
export async function blur(el) { await act(async () => { el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); el.dispatchEvent(new window.FocusEvent('blur')); }); await flush(); }
export async function submit(form) { await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }); await flush(); }
export async function nav(tabId) { await click(byId(`nav-${tabId}`)); }
export function answerConfirms(...answers) { ui.confirmAnswers.push(...answers); }
export const lastAlert = () => ui.alerts[ui.alerts.length - 1] || '';
export const lastConfirm = () => ui.confirms[ui.confirms.length - 1] || '';

// ---------- נתונים ----------
export const docs = (col) => fs.store[col] || {};
export const docsWhere = (col, pred) => Object.entries(docs(col)).filter(([, d]) => pred(d)).map(([id, d]) => ({ id, ...d }));
export const writesSince = (seq) => fs.log.filter(e => e.seq > seq);
export const seq = () => fs.seq;
