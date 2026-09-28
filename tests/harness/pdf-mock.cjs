// jsPDF ו-html2canvas מדומים — ב-jsdom אין canvas אמיתי, ובדיקות התהליכים לא בודקות
// איך ה-PDF נראה אלא שהתהליך שמסביבו (שמירה ל-Firestore, מספור, שינוי שלב) עובד.
// כל קריאה ל-save נרשמת ב-globalThis.__pdf.saves כדי שבדיקה תוכל לוודא שקובץ "הורד".
const state = (globalThis.__pdf = globalThis.__pdf || { saves: [], canvasCalls: 0 });

function makePdf() {
  const target = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297, width: 210, height: 297 } },
    save: (name) => { state.saves.push(String(name)); },
    output: () => '',
    getTextWidth: (t) => String(t || '').length * 2,
    splitTextToSize: (t) => [String(t || '')],
    getNumberOfPages: () => 1,
    getFontList: () => ({}),
  };
  // כל מתודה אחרת (text, setFont, addImage, rect, line, addPage, ...) — פעולה ריקה שמחזירה את המסמך
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'then') return undefined;
      return () => proxy;
    },
  });
  return proxy;
}

function jsPDF() { return makePdf(); }

async function html2canvas() {
  state.canvasCalls++;
  // בדיקה יכולה לדמות כשל חד-פעמי ביצירת התמונה (globalThis.__pdfFailNext = true)
  if (globalThis.__pdfFailNext) { globalThis.__pdfFailNext = false; throw new Error('canvas failed (simulated)'); }
  return { width: 800, height: 1100, toDataURL: () => 'data:image/png;base64,AAAA' };
}

module.exports = { jsPDF, html2canvas };
