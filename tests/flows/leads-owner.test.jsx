// סינון־על לפי בעלים בלשונית הלידים + תזכורות אישיות בדשבורד, על הקוד האמיתי של App.tsx.
//
// כלל הבעלות (אושר ע"י שחף): ליד שייך למי שהוא משויך אליו (assignedTo); ליד לא משויך שייך
// למי שיצר אותו (createdBy). לכל ליד בעלים אחד בלבד. כל ספירה ותצוגה בלשונית — תזכורות,
// "עודכנו בסטטוס", שלבים, דחוף, ארכיון — מוגבלת לבעלים שנבחר. "עודכנו בסטטוס" = לידים של
// הבעלים שהסטטוס שלהם שונה היום, לא משנה מי שינה. כניסה ללשונית תמיד מתחילה ב"הלידים שלי".
// בדשבורד: "לחזור היום / באיחור" מציג רק לידים של המשתמש המחובר, בלי בורר.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

const SH = 'shachafshalom@gmail.com'; // המשתמש המחובר במוק
const DN = 'danielyos205@gmail.com';

// שבת 3.10.2026, 12:00 בשעון ישראל
T.freezeTime('2026-10-03T09:00:00.000Z');
const TODAY = '2026-10-03';
const TODAY_LOG = '2026-10-03T07:00:00.000Z';
const YESTERDAY_LOG = '2026-10-02T07:00:00.000Z';
const sys = (user, date = TODAY_LOG) => ({ date, text: 'סטטוס שונה', user, type: 'system' });

const N = {
  A: 'בר אלפא',      // משויך לשחף (נוצר ע"י דניאל), תזכורת באיחור
  B: 'בר בטא',       // לא משויך, נוצר ע"י שחף, תזכורת היום
  C: 'בר גמא',       // משויך לדניאל (נוצר ע"י שחף), תזכורת היום
  D: 'בר דלתא',      // משויך לדניאל, שחף שינה לו סטטוס היום
  E: 'בר אפסילון',   // בלי בעלים בכלל (מהאתר), תזכורת היום
  F: 'בר זטא',       // של שחף, לא רלוונטי (ארכיון), תזכורת ישנה
  G: 'בר תטא',       // של דניאל, לא רלוונטי (ארכיון)
  H: 'בר יוטא',      // של שחף, דניאל שינה לו סטטוס היום
  I: 'בר קאפא',      // של שחף, סטטוס שונה אתמול — לא "היום"
};

T.seed({
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500 } } } },
  crm_customers: {
    A: { status: 'lead', leadStage: 'contacted', businessName: N.A, phone: '0501000001', assignedTo: SH, createdBy: DN, followUpDate: '2026-10-01', interactionLogs: [{ date: YESTERDAY_LOG, text: 'שיחה', user: SH }, { date: TODAY_LOG, text: 'מוזג לתוך ליד זה: "כפול" (0501000099), נוצר 01/10/2026', user: SH, type: 'system' }], createdAt: '2026-09-20T10:00:00.000Z' },
    B: { status: 'lead', leadStage: 'new', businessName: N.B, phone: '0501000002', createdBy: SH, followUpDate: TODAY, interactionLogs: [], createdAt: '2026-09-21T10:00:00.000Z' },
    C: { status: 'lead', leadStage: 'callback', businessName: N.C, phone: '0501000003', assignedTo: DN, createdBy: SH, followUpDate: TODAY, interactionLogs: [{ date: YESTERDAY_LOG, text: 'שיחה', user: DN }], createdAt: '2026-09-22T10:00:00.000Z' },
    D: { status: 'lead', leadStage: 'contacted', businessName: N.D, phone: '0501000004', assignedTo: DN, interactionLogs: [sys(SH)], createdAt: '2026-09-23T10:00:00.000Z' },
    E: { status: 'lead', leadStage: 'new', businessName: N.E, phone: '+972501000005', source: 'website', followUpDate: TODAY, interactionLogs: [], createdAt: '2026-09-24T10:00:00.000Z' },
    F: { status: 'lead', leadStage: 'not_relevant', businessName: N.F, phone: '0501000006', assignedTo: SH, followUpDate: '2026-09-30', interactionLogs: [{ date: YESTERDAY_LOG, text: 'לא רלוונטי', user: SH }], createdAt: '2026-09-25T10:00:00.000Z' },
    G: { status: 'lead', leadStage: 'not_relevant', businessName: N.G, phone: '0501000007', assignedTo: DN, interactionLogs: [{ date: YESTERDAY_LOG, text: 'לא רלוונטי', user: DN }], createdAt: '2026-09-26T10:00:00.000Z' },
    H: { status: 'lead', leadStage: 'quote_sent', businessName: N.H, phone: '0501000008', assignedTo: SH, interactionLogs: [sys(DN)], createdAt: '2026-09-27T10:00:00.000Z' },
    I: { status: 'lead', leadStage: 'waiting', businessName: N.I, phone: '0501000009', assignedTo: SH, interactionLogs: [sys(SH, YESTERDAY_LOG)], createdAt: '2026-09-28T10:00:00.000Z' },
    K: { status: 'active', businessName: 'לקוח פעיל קיים', phone: '0501000010', assignedTo: SH, interactionLogs: [], createdAt: '2026-01-01T10:00:00.000Z' },
  },
});
T.setNav('sales', 'leads');

// אילו מהלידים מוצגים כרגע בשורות הליד (ייחודי — "דחוף עכשיו" מציג שורה שנייה לאותו ליד)
const shown = () => {
  const rows = T.allById('lead-row');
  return Object.keys(N).filter(k => rows.some(r => r.textContent.includes(N[k]))).sort().join(',');
};
const label = (id) => (T.byId(id)?.textContent || '').trim();
const countIn = (id) => { const m = label(id).match(/\((\d+)\)/); return m ? Number(m[1]) : 0; };
const stageOption = (stage) => T.$$('option', T.byId('leads-stage-filter')).find(o => o.value === stage)?.textContent || '';
const archiveCount = () => Number((T.byId('leads-archive-toggle')?.textContent.match(/\d+/) || ['0'])[0]);

(async () => {
  await T.mountApp(App);

  T.describe('1. ברירת מחדל: הלידים שלי');
  T.check(T.byId('leads-owner-mine')?.getAttribute('aria-pressed') === 'true', 'הלשונית לא נפתחה על "הלידים שלי"');
  T.check(shown() === 'A,B,H,I', `הלידים שלי מציגים: ${shown()} (צפוי A,B,H,I)`);
  T.check(!shown().includes('C'), 'ליד שיצרתי אבל משויך לדניאל מופיע אצלי');
  T.check(!shown().includes('E'), 'ליד בלי בעלים מופיע ב"הלידים שלי"');
  T.check(countIn('leads-view-today') === 2, `ספירת "תזכורות היום" אצלי: ${label('leads-view-today')} (צפוי 2: A,B)`);
  T.check(countIn('leads-view-status_updated') === 1, `ספירת "עודכנו בסטטוס" אצלי: ${label('leads-view-status_updated')} (צפוי 1: H — מיזוג של A היום אינו שינוי סטטוס)`);
  T.check(/\(1\)/.test(stageOption('new')) && /\(1\)/.test(stageOption('contacted')) && /\(0\)/.test(stageOption('callback')) && /\(1\)/.test(stageOption('quote_sent')),
    `ספירת השלבים לא מוגבלת אליי: new="${stageOption('new')}" contacted="${stageOption('contacted')}" callback="${stageOption('callback')}"`);
  T.check(archiveCount() === 1, `ספירת הארכיון אצלי: ${archiveCount()} (צפוי 1: F)`);

  T.describe('2. תצוגות בתוך "הלידים שלי"');
  await T.click(T.byId('leads-view-today'));
  T.check(shown() === 'A,B', `תזכורות היום (שלי): ${shown()} (צפוי A,B)`);
  T.check(T.byId('leads-owner-mine')?.getAttribute('aria-pressed') === 'true', 'בחירת תצוגה איפסה את סינון הבעלים');
  await T.click(T.byId('leads-view-status_updated'));
  T.check(shown() === 'H', `עודכנו היום (שלי): ${shown()} (צפוי H — שונה ע"י דניאל, הליד שלי)`);
  await T.select(T.byId('leads-stage-filter'), 'quote_sent');
  await T.click(T.byId('leads-view-all'));
  T.check(shown() === 'H', `שלב "הצעה נשלחה" (שלי): ${shown()} (צפוי H)`);
  await T.select(T.byId('leads-stage-filter'), 'all');

  T.describe('3. לידים של דניאל');
  await T.click(T.byId(`leads-owner-${DN}`));
  T.check(shown() === 'C,D', `לידים של דניאל: ${shown()} (צפוי C,D)`);
  T.check(countIn('leads-view-today') === 1, `תזכורות היום של דניאל: ${label('leads-view-today')} (צפוי 1: C)`);
  T.check(countIn('leads-view-status_updated') === 1, `עודכנו בסטטוס של דניאל: ${label('leads-view-status_updated')} (צפוי 1: D)`);
  T.check(archiveCount() === 1, `ארכיון של דניאל: ${archiveCount()} (צפוי 1: G)`);
  await T.click(T.byId('leads-view-status_updated'));
  T.check(shown() === 'D', `עודכנו היום (דניאל): ${shown()} (צפוי D — שחף שינה, הליד של דניאל)`);
  await T.click(T.byId('leads-view-all'));
  await T.click(T.byId('leads-archive-toggle'));
  T.check(shown() === 'C,D,G', `לידים של דניאל + ארכיון פתוח: ${shown()} (צפוי C,D,G)`);
  await T.click(T.byId('leads-archive-toggle'));

  T.describe('4. כל הלידים — כולל ליד בלי בעלים');
  await T.click(T.byId('leads-owner-all'));
  T.check(shown() === 'A,B,C,D,E,H,I', `כל הלידים: ${shown()}`);
  await T.click(T.byId('leads-view-today'));
  T.check(shown() === 'A,B,C,E', `תזכורות היום (כולם): ${shown()} (צפוי A,B,C,E — כולל הליד בלי הבעלים)`);
  T.check(countIn('leads-view-today') === 4, `ספירת תזכורות (כולם): ${label('leads-view-today')}`);
  T.check(countIn('leads-view-status_updated') === 2, `ספירת עודכנו בסטטוס (כולם): ${label('leads-view-status_updated')} (צפוי 2: D,H)`);
  await T.click(T.byId('leads-view-all'));

  T.describe('5. חיפוש בתוך הבעלים שנבחר');
  await T.click(T.byId('leads-owner-mine'));
  const search = T.$$('input').find(i => (i.placeholder || '').includes('חיפוש'));
  await T.type(search, N.C);
  T.check(shown() === '', `חיפוש ליד של דניאל מתוך "הלידים שלי" מצא: ${shown()}`);
  await T.type(search, N.A);
  T.check(shown() === 'A', `חיפוש ליד שלי מצא: ${shown()} (צפוי A)`);
  await T.type(search, '0501000006'); // F — בארכיון
  T.check(!!T.byId('leads-archive-toggle') && archiveCount() === 1, 'החיפוש לא מוצא ליד בארכיון');
  await T.click(T.byId('leads-archive-toggle'));
  T.check(shown() === 'F', `חיפוש + ארכיון פתוח: ${shown()} (צפוי F בלבד)`);
  await T.type(search, N.A);
  T.check(shown() === 'A', `ארכיון פתוח לא מסונן לפי החיפוש: ${shown()} (צפוי A בלבד)`);
  if (T.byId('leads-archive-toggle')) await T.click(T.byId('leads-archive-toggle'));
  await T.type(search, '');
  if (T.allById('lead-row').some(r => r.textContent.includes(N.F))) await T.click(T.byId('leads-archive-toggle'));

  T.describe('6. כניסה מחדש ללשונית חוזרת ל"הלידים שלי"');
  await T.click(T.byId('leads-owner-all'));
  await T.nav('customers');
  await T.nav('leads');
  T.check(T.byId('leads-owner-mine')?.getAttribute('aria-pressed') === 'true', 'הבחירה הקודמת ("כל הלידים") נשמרה אחרי יציאה וחזרה');
  T.check(shown() === 'A,B,H,I', `אחרי חזרה ללשונית: ${shown()}`);

  T.describe('7. דשבורד — "לחזור היום / באיחור" רק של המשתמש המחובר');
  await T.nav('sales_dashboard');
  const dashRows = T.allById('dash-followup-row');
  const dashShown = Object.keys(N).filter(k => dashRows.some(r => r.textContent.includes(N[k]))).sort().join(',');
  T.check(dashShown === 'A,B', `תזכורות בדשבורד: ${dashShown} (צפוי A,B — בלי C של דניאל, בלי E ללא בעלים, בלי F מהארכיון)`);
  T.check(!T.byId('dash-followups')?.querySelector('select'), 'בכרטיס התזכורות בדשבורד יש בורר משתמש');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
