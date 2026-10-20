// שומר על פורמט המודולים של פונקציות ה-Netlify.
// כל הפונקציות כתובות ב-CommonJS (require / exports.handler), אבל ה-package.json הראשי מוגדר
// "type": "module" (בשביל Vite). מאז אוקטובר 2026 Netlify עוצר את הבנייה במקרה כזה:
//   "The function file ... is a CommonJS module, but the closest 'package.json' declares type module"
// הפתרון: netlify/functions/package.json עם "type": "commonjs" — הוא ה-package.json הקרוב ביותר
// לפונקציות. בלעדיו, כל דחיפה נבנית, נופלת ב-Netlify, ושום דבר לא עולה לאוויר (כך קרה 3.10–20.10.2026).
const fs = require('fs');
const path = require('path');
const T = require('../harness/checks.cjs');

const FN_DIR = path.resolve(process.cwd(), 'netlify', 'functions');

T.describe('פורמט המודולים של פונקציות Netlify');
let pkg = null;
try { pkg = JSON.parse(fs.readFileSync(path.join(FN_DIR, 'package.json'), 'utf8')); } catch { /* נבדק למטה */ }
T.check(pkg && pkg.type === 'commonjs', 'netlify/functions/package.json חסר או שאינו "type": "commonjs" — הבנייה ב-Netlify תיפול');

const files = fs.readdirSync(FN_DIR).filter((f) => f.endsWith('.js'));
T.check(files.length > 0, 'לא נמצאו פונקציות ב-netlify/functions');
for (const f of files) {
  const src = fs.readFileSync(path.join(FN_DIR, f), 'utf8');
  const usesEsm = /^\s*(import\s.+from\s|export\s+(const|default|async|function))/m.test(src);
  T.check(!usesEsm, `${f}: כתוב ב-ESM (import/export) בתוך תיקייה שמוגדרת CommonJS — להמיר ל-require/exports או לשנות שם ל-.mjs`);
}

T.finish();
