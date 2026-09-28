// סביבת דפדפן מדומה (jsdom) לבדיקות התהליכים. נטען לפני קובץ הבדיקה הבנוי.
// מגדיר את כל ה-globals שהאפליקציה ו-React צריכים, ומקליט alert/confirm/fetch/window.open
// ב-globalThis.__ui כדי שבדיקות יוכלו לוודא מה המשתמש ראה.
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const g = globalThis;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.localStorage = dom.window.localStorage;
g.sessionStorage = dom.window.sessionStorage;
for (const k of ['HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'InputEvent', 'MutationObserver', 'getComputedStyle', 'FileReader', 'Image', 'DOMParser', 'Blob', 'URL']) {
  if (dom.window[k]) g[k] = dom.window[k];
}
g.requestAnimationFrame = (cb) => setTimeout(cb, 0);
g.cancelAnimationFrame = (id) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
g.matchMedia = dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
g.ResizeObserver = dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
g.Notification = dom.window.Notification = { permission: 'default', requestPermission: async () => 'default' };
if (!g.URL.createObjectURL) g.URL.createObjectURL = () => 'blob:test';
if (!g.URL.revokeObjectURL) g.URL.revokeObjectURL = () => {};

// מה שהמשתמש "רואה" ו"עונה" — נבדק ע"י הבדיקות
const ui = (g.__ui = { alerts: [], confirms: [], confirmAnswers: [], fetches: [], opened: [], clipboard: [] });
g.alert = dom.window.alert = (m) => { ui.alerts.push(String(m)); };
g.confirm = dom.window.confirm = (m) => { ui.confirms.push(String(m)); return ui.confirmAnswers.length ? ui.confirmAnswers.shift() : true; };
g.prompt = dom.window.prompt = () => null;
dom.window.open = g.open = (url) => { ui.opened.push(String(url)); return null; };
Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (t) => { ui.clipboard.push(String(t)); } }, configurable: true });
g.fetch = dom.window.fetch = async (url, opts) => {
  ui.fetches.push({ url: String(url), opts });
  return { ok: false, status: 503, json: async () => ({ error: 'network disabled in tests' }), text: async () => 'network disabled in tests' };
};

process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED_REJECTION', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
  g.__unhandled = (g.__unhandled || 0) + 1;
});
