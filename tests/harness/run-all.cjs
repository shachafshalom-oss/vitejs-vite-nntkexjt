// מריץ את כל בדיקות התהליכים: tests/flows/*.test.jsx (האפליקציה המלאה ב-jsdom)
// ו-tests/functions/*.test.cjs (פונקציות ה-Netlify). כל קובץ נבנה עם esbuild — כשהמודולים
// החיצוניים (Firebase, jsPDF, html2canvas) מוחלפים במוקים — ורץ בתהליך Node נפרד ונקי.
//
// הרצה: npm run test:flows            (הכול)
//       npm run test:flows -- sales    (רק קבצים ששמם מכיל "sales")
// יוצא עם קוד 1 אם בדיקה כלשהי נכשלה — ובכך עוצר את הבנייה ב-Netlify.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const H = __dirname;
const OUT = path.join(ROOT, 'tests', '.out');
fs.mkdirSync(OUT, { recursive: true });

const mocksPlugin = {
  name: 'test-mocks',
  setup(build) {
    const to = (file) => () => ({ path: path.join(H, file) });
    build.onResolve({ filter: /^firebase\/firestore$/ }, to('firestore-web-mock.cjs'));
    build.onResolve({ filter: /^firebase\/(app|auth|messaging|storage)$/ }, to('firebase-web-others-mock.cjs'));
    build.onResolve({ filter: /^firebase-admin\/(app|firestore|messaging)$/ }, to('firebase-admin-mock.cjs'));
    build.onResolve({ filter: /^jspdf$/ }, to('jspdf-shim.mjs'));
    build.onResolve({ filter: /^html2canvas$/ }, to('html2canvas-shim.mjs'));
    // פונקציות ה-Netlify כתובות ב-CommonJS, אבל ה-package.json של הפרויקט מוגדר "type":"module",
    // ולכן esbuild היה מתייחס אליהן כ-ESM ו-exports.handler היה נעלם. ב-namespace נפרד
    // הפורמט נקבע לפי התחביר בפועל (CommonJS) — בדיוק כמו שה-bundler של Netlify עושה.
    build.onResolve({ filter: /netlify\/functions\/[^/]+\.js$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path), namespace: 'netlify-fn' }));
    build.onLoad({ filter: /.*/, namespace: 'netlify-fn' }, (args) => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'js', resolveDir: path.dirname(args.path) }));
  },
};

const filter = process.argv[2] || '';
const collect = (dir, ext) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith(ext) && f.includes(filter)).map(f => path.join(dir, f))
  : [];
const flowTests = collect(path.join(ROOT, 'tests', 'flows'), '.test.jsx');
const fnTests = collect(path.join(ROOT, 'tests', 'functions'), '.test.cjs');

const env = JSON.stringify({ DEV: false, PROD: true, MODE: 'test', VITE_FIREBASE_API_KEY: 'test', VITE_FIREBASE_VAPID_KEY: 'test' });

(async () => {
  const started = Date.now();
  const rows = [];
  for (const [entry, isFlow] of [...flowTests.map(f => [f, true]), ...fnTests.map(f => [f, false])]) {
    const name = path.relative(path.join(ROOT, 'tests'), entry);
    const outfile = path.join(OUT, path.basename(entry).replace(/\.(jsx|cjs)$/, '.bundle.cjs'));
    try {
      await esbuild.build({
        entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile,
        plugins: [mocksPlugin], logLevel: 'error', jsx: 'automatic',
        define: isFlow ? { 'import.meta.env': env } : {},
      });
    } catch (e) {
      rows.push({ name, ok: false, passes: 0, failures: 1, knownBugs: [], fixedBugs: [], failureList: [`בנייה נכשלה: ${e.message}`], ms: 0 });
      continue;
    }
    const t0 = Date.now();
    const args = isFlow ? ['-r', path.join(H, 'dom-env.cjs'), outfile] : [outfile];
    const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000, env: { ...process.env, TZ: 'Asia/Jerusalem' } });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/__RESULT__(\{.*\})/);
    const res = m ? JSON.parse(m[1]) : { passes: 0, failures: 1, knownBugs: [], fixedBugs: [], failureList: ['הבדיקה קרסה לפני סיום:\n' + out.split('\n').slice(-25).join('\n')] };
    const ok = r.status === 0 && res.failures === 0;
    rows.push({ name, ok, ...res, ms: Date.now() - t0 });
    if (!ok || process.env.VERBOSE) process.stdout.write(out.replace(/__RESULT__.*\n?/, ''));
  }

  console.log('\n══════════ בדיקות תהליכים ══════════');
  let total = 0, failed = 0;
  const known = [], fixed = [];
  for (const r of rows) {
    total += r.passes; failed += r.failures;
    known.push(...(r.knownBugs || []).map(b => `${r.name}: ${b}`));
    fixed.push(...(r.fixedBugs || []).map(b => `${r.name}: ${b}`));
    console.log(`${r.ok ? '✔' : '✘'} ${r.name.padEnd(36)} ${String(r.passes).padStart(4)} עברו${r.failures ? `, ${r.failures} נכשלו` : ''}  (${(r.ms / 1000).toFixed(1)}s)`);
    if (!r.ok) (r.failureList || []).forEach(f => console.log(`     ✗ ${f}`));
  }
  if (known.length) { console.log('\nבאגים ידועים שעדיין פתוחים (לא עוצרים את הבנייה):'); known.forEach(k => console.log(`  ⚠ ${k}`)); }
  if (fixed.length) { console.log('\nבאגים ידועים שנראים מתוקנים — להפוך ל-check רגיל:'); fixed.forEach(k => console.log(`  ★ ${k}`)); }
  console.log(`\nסה"כ: ${total} בדיקות עברו, ${failed} נכשלו — ${((Date.now() - started) / 1000).toFixed(1)} שניות`);
  if (failed || rows.some(r => !r.ok)) {
    console.log('\n✘ יש בדיקות שנכשלו — הגרסה לא תעלה לאוויר עד שיתוקן.');
    process.exit(1);
  }
  console.log('✔ כל בדיקות התהליכים עברו.');
})();
