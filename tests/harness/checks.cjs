// מנגנון בדיקה משותף לכל קבצי הבדיקות (תהליכים ופונקציות שרת): check / knownBug / finish,
// ופלט אחיד (__RESULT__) שה-runner קורא. וגם freezeTime — קיבוע "עכשיו" לבדיקות תאריכים.
const results = { passes: 0, failures: [], knownBugs: [], fixedBugs: [] };
let section = '';

function describe(name) { section = name; console.log(`\n▶ ${name}`); }
function check(cond, msg) {
  if (cond) { results.passes++; return true; }
  results.failures.push(`${section} :: ${msg}`);
  console.error(`  ✗ ${msg}`);
  return false;
}
// באג ידוע שעוד לא תוקן (תועד באישור שחף): לא מפיל את הבנייה, אבל מדווח בכל ריצה.
// כשהבאג יתוקן — הריצה תדווח "תוקן", וצריך להפוך את השורה ל-check רגיל כדי שלא יחזור.
function knownBug(id, description, isFixed) {
  if (isFixed) { results.fixedBugs.push(`${id}: ${description}`); console.log(`  ★ ${id} תוקן — להפוך ל-check רגיל`); }
  else { results.knownBugs.push(`${id}: ${description}`); console.log(`  ⚠ באג ידוע ${id}: ${description}`); }
}
function finish() {
  const unhandled = globalThis.__unhandled || 0;
  if (unhandled) results.failures.push(`${unhandled} שגיאות לא מטופלות (unhandled rejection) בזמן הריצה`);
  console.log(`\n__RESULT__${JSON.stringify({ passes: results.passes, failures: results.failures.length, failureList: results.failures, knownBugs: results.knownBugs, fixedBugs: results.fixedBugs })}`);
  process.exit(results.failures.length ? 1 : 0);
}
function crash(e) {
  check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  finish();
}

// מקבע את "עכשיו" לרגע ידוע (השעון ממשיך לתקתק ממנו)
function freezeTime(iso) {
  const RealDate = globalThis.__RealDate || Date;
  globalThis.__RealDate = RealDate;
  const startReal = RealDate.now();
  const base = new RealDate(iso).getTime();
  const now = () => base + (RealDate.now() - startReal);
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  globalThis.Date = FakeDate;
  if (globalThis.window) globalThis.window.Date = FakeDate;
}

module.exports = { describe, check, knownBug, finish, crash, freezeTime };
