// קבוצות / רשתות לקוחות (4.11.2026): כמה סניפים, כל אחד עם ח.פ משלו. תצוגה וניתוח בלבד —
// מסמכים ממשיכים לצאת לסניף. רשת = לקוח אחד בניתוח המכירות. מחיקת קבוצה רק בלי סניפים.
import * as T from '../harness/ui.js';
import App from '../../src/App.tsx';

T.freezeTime('2026-11-04T10:00:00.000Z');
const SH = 'shachafshalom@gmail.com';
const sold = (id, customerId, price, date) => ({ model: 'Prime', modelId: 'm_prime', status: 'sold', source: 'local', localCostILS: 4000, shipmentId: '', customerId, salePrice: price, saleDate: date, addOnPrice: 0, discountAmount: 0, repairCost: 0, addOnCost: 0, campaignId: '', createdAt: '2026-09-01T10:00:00.000Z' });

T.seed({
  crm_settings: { general_settings: { models: { Prime: { id: 'm_prime', cbm: 1, listPrice: 9500 } } } },
  crm_items: { I1: sold('I1', 'B1', 9500, '2026-10-01'), I2: sold('I2', 'B2', 9500, '2026-10-05'), I3: sold('I3', 'B2', 3000, '2026-10-06'), I4: sold('I4', 'SOLO', 9500, '2026-10-08') },
  crm_quotes: {
    Q1: { status: 'approved', customerId: 'B1', approvedItemIds: ['I1'], approvedAt: '2026-10-01T08:00:00.000Z', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], createdAt: '2026-09-30T08:00:00.000Z' },
    Q2: { status: 'approved', customerId: 'B2', approvedItemIds: ['I2'], approvedAt: '2026-10-05T08:00:00.000Z', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], createdAt: '2026-10-04T08:00:00.000Z' },
    Q3: { status: 'approved', customerId: 'B2', approvedItemIds: ['I3'], approvedAt: '2026-10-06T08:00:00.000Z', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 3000, discount: 0 }], createdAt: '2026-10-06T07:00:00.000Z' },
    Q4: { status: 'approved', customerId: 'SOLO', approvedItemIds: ['I4'], approvedAt: '2026-10-08T08:00:00.000Z', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], createdAt: '2026-10-07T08:00:00.000Z' },
    QP: { status: 'pending', customerId: 'B1', items: [{ model: 'Prime', modelId: 'm_prime', qty: 1, listPrice: 9500, discount: 0 }], createdAt: '2026-11-01T08:00:00.000Z' },
  },
  crm_customers: {
    B1: { status: 'active', businessName: 'בירה סניף תל אביב', contactName: 'רון', hp: '511111111', phone: '0501110001', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-01T08:00:00.000Z' },
    B2: { status: 'active', businessName: 'בירה סניף חיפה', contactName: 'גל', hp: '522222222', phone: '0501110002', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-02T08:00:00.000Z' },
    SOLO: { status: 'active', businessName: 'בר עצמאי', contactName: 'מאיה', phone: '0501110003', assignedTo: SH, interactionLogs: [], createdAt: '2026-09-03T08:00:00.000Z' },
  },
});
T.setNav('sales', 'customers');

const rowOf = (name) => T.allById('customer-row').find(r => r.textContent.includes(name));
const groups = () => T.docsWhere('crm_customer_groups', () => true);

(async () => {
  await T.mountApp(App);

  T.describe('1. קבוצה חדשה מתוך עריכת לקוח');
  await T.click(rowOf('בירה סניף תל אביב'));
  await T.click(T.byId('lead-panel-edit'));
  await T.selectAction(T.byId('customer-group-select'), '__new__');
  T.check(!!T.byId('group-edit-modal'), 'חלון "קבוצה חדשה" לא נפתח');
  await T.type(T.byId('group-name'), 'רשת הבירה');
  await T.type(T.byId('group-contact'), 'דוד מנהל רכש');
  await T.type(T.byId('group-phone'), '0529990000');
  await T.click(T.byId('group-save'));
  const G = groups()[0];
  T.check(groups().length === 1 && G.name === 'רשת הבירה' && G.contactName === 'דוד מנהל רכש' && G.phone === '0529990000', `הקבוצה לא נשמרה: ${JSON.stringify(groups())}`);
  T.check(T.byId('customer-group-select')?.value === G.id, 'הקבוצה החדשה לא נבחרה בטופס');
  await T.submit(document.getElementById('customerForm'));
  T.check(T.docs('crm_customers').B1.groupId === G.id && T.docs('crm_customers').B1.hp === '511111111', 'השיוך לא נשמר / הח.פ של הסניף השתנה');
  if (T.byId('lead-panel-close')) await T.click(T.byId('lead-panel-close'));

  T.describe('2. סניף שני לאותה קבוצה; שם כפול נחסם');
  await T.click(rowOf('בירה סניף חיפה'));
  await T.click(T.byId('lead-panel-edit'));
  await T.selectAction(T.byId('customer-group-select'), '__new__');
  await T.type(T.byId('group-name'), ' רשת  הבירה ');
  const alerts2 = T.ui.alerts.length;
  await T.click(T.byId('group-save'));
  T.check(groups().length === 1 && T.ui.alerts.slice(alerts2).some(a => a.includes('כבר קיימת קבוצה')), 'נוצרה קבוצה כפולה');
  await T.click(T.buttonByText('ביטול', T.byId('group-edit-modal')));
  await T.selectAction(T.byId('customer-group-select'), G.id);
  await T.submit(document.getElementById('customerForm'));
  T.check(T.docs('crm_customers').B2.groupId === G.id, 'הסניף השני לא שויך');
  if (T.byId('lead-panel-close')) await T.click(T.byId('lead-panel-close'));

  T.describe('3. רשימת לקוחות: תגית וסינון לפי רשת');
  T.check(!!T.byId('customer-group-badge-B1') && !!T.byId('customer-group-badge-B2') && !T.byId('customer-group-badge-SOLO'), 'תגית "רשת" חסרה / מופיעה ללקוח בלי קבוצה');
  await T.select(T.byId('customer-group-filter'), G.id);
  T.check(!!rowOf('בירה סניף תל אביב') && !!rowOf('בירה סניף חיפה') && !rowOf('בר עצמאי'), 'הסינון לפי רשת לא עובד');

  T.describe('4. תיק קבוצה');
  await T.click(T.byId('group-open-file'));
  const file = T.byId('group-file');
  T.check(!!file && T.text(file).includes('דוד מנהל רכש') && T.allById('group-branch-row', file).length === 2, 'תיק הקבוצה חסר סניפים / איש קשר');
  T.check(T.text(file).includes('511111111') && T.text(file).includes('522222222'), 'הח.פ של כל סניף לא מוצג');
  T.check(T.amountShown(22000, T.byId('group-total')), `סה"כ לרשת 9,500 + 9,500 + 3,000: ${T.text(T.byId('group-total'))}`);
  T.check(T.text(file).includes('1 הצעות פתוחות'), 'הצעה פתוחה של סניף לא מוצגת');

  T.describe('5. מחיקת קבוצה עם סניפים — נחסמת');
  const alerts5 = T.ui.alerts.length;
  T.answerConfirms(true);
  await T.click(T.byId('group-delete'));
  T.check(groups().length === 1 && T.ui.alerts.slice(alerts5).some(a => a.includes('2 לקוחות משויכים')), 'קבוצה עם סניפים נמחקה');

  T.describe('6. ניתוח מכירות: הרשת = לקוח אחד');
  await T.click(T.$('button[aria-label="סגור"]', T.byId('group-file')));
  await T.nav('sales_dashboard');
  await T.click(T.byId('myday-go-analytics'));
  await T.flush(6);
  const v = (id) => T.byId(id)?.textContent.trim();
  T.check(v('an-count') === '4' && v('an-customers') === '2', `4 עסקאות, 2 לקוחות (רשת + עצמאי): ${v('an-count')} ${v('an-customers')}`);
  T.check(T.amountShown(15750, T.byId('an-avg-customer')), `ממוצע ללקוח (22,000 + 9,500) / 2 = 15,750: ${v('an-avg-customer')}`);
  const top = T.allById('an-top-row').map(r => r.textContent);
  T.check(top.length === 2 && top[0].includes('רשת הבירה') && top[0].includes('2 סניפים'), `הרשת צריכה להופיע כשורה אחת ראשונה: ${JSON.stringify(top)}`);

  T.describe('7. "+ הוסף סניף" מתוך תיק הקבוצה');
  if (T.byId('space-sales')) await T.click(T.byId('space-sales'));
  await T.nav('customers');
  await T.select(T.byId('customer-group-filter'), '');
  await T.click(T.byId('customer-group-badge-B1'));
  await T.click(T.byId('group-add-branch'));
  const picker = T.byId('group-add-branch-picker');
  const inp = T.byId('customer-combobox-input', picker);
  await T.focus(inp);
  await T.type(inp, 'בר עצמאי');
  await T.mouseDown(T.$$('div', picker).find(d => d.children.length === 0 && d.textContent.includes('בר עצמאי')));
  T.check(T.docs('crm_customers').SOLO.groupId === G.id && T.allById('group-branch-row', T.byId('group-file')).length === 3, 'הסניף לא נוסף מתוך תיק הקבוצה');

  T.describe('8. הסרת סניף מהקבוצה — הלקוח עצמו נשאר');
  T.answerConfirms(true);
  await T.click(T.byId('group-remove-SOLO'));
  T.check(T.docs('crm_customers').SOLO.groupId === null && !!T.docs('crm_customers').SOLO.businessName && T.allById('group-branch-row', T.byId('group-file')).length === 2, 'ההסרה לא עבדה / הלקוח נפגע');
  await T.click(T.$('button[aria-label="סגור"]', T.byId('group-file')));

  T.describe('9. מתוך תיק הלקוח: "+ שייך לרשת" ← רשת חדשה');
  await T.click(rowOf('בר עצמאי'));
  await T.click(T.byId('customer-panel-group-assign'));
  T.check(!!T.byId('group-assign-modal') && !!T.byId(`group-assign-${G.id}`), 'חלון השיוך לא נפתח / לא מציג את הרשתות הקיימות');
  await T.click(T.byId('group-assign-new'));
  await T.type(T.byId('group-name'), 'רשת שנייה');
  await T.click(T.byId('group-save'));
  const G2 = groups().find(g => g.name === 'רשת שנייה');
  T.check(!!G2 && T.docs('crm_customers').SOLO.groupId === G2.id && !T.byId('group-assign-modal'), 'רשת חדשה לא נוצרה / הלקוח לא שויך אליה');
  T.check(T.text(T.byId('customer-panel-group')).includes('רשת שנייה'), 'בכותרת תיק הלקוח לא מוצגת הרשת');

  T.describe('10. העברה מרשת לרשת — באישור');
  await T.click(T.byId('customer-panel-group'));
  await T.click(T.$('button[aria-label="סגור"]', T.byId('group-file')));
  T.ui.confirmAnswers.length = 0; // תשובות שלא נוצלו בסעיפים קודמים
  T.answerConfirms(false);
  const confirmsBefore = T.ui.confirms.length;
  await T.select(T.byId('customer-group-filter'), G.id);
  await T.click(T.byId('group-open-file'));
  await T.click(T.byId('group-add-branch'));
  const p2 = T.byId('group-add-branch-picker');
  const inp2 = T.byId('customer-combobox-input', p2);
  await T.focus(inp2);
  await T.type(inp2, 'בר עצמאי');
  await T.mouseDown(T.$$('div', p2).find(d => d.children.length === 0 && d.textContent.includes('בר עצמאי')));
  T.check(T.ui.confirms.slice(confirmsBefore).some(c => c.includes('משויך כרגע ל"רשת שנייה"')) && T.docs('crm_customers').SOLO.groupId === G2.id, `העברה מרשת אחרת לא ביקשה אישור / בוצעה למרות ביטול: ${JSON.stringify(T.ui.confirms.slice(confirmsBefore))} ${T.docs('crm_customers').SOLO.groupId} ${!!T.byId('group-file')} ${!!p2}`);

  T.answerConfirms(true);
  const inp3 = T.byId('customer-combobox-input', T.byId('group-add-branch-picker'));
  await T.focus(inp3);
  await T.type(inp3, 'בר עצמאי');
  await T.mouseDown(T.$$('div', T.byId('group-add-branch-picker')).find(d => d.children.length === 0 && d.textContent.includes('בר עצמאי')));
  T.check(T.docs('crm_customers').SOLO.groupId === G.id, 'העברה באישור לא בוצעה');

  T.finish();
})().catch(e => { T.check(false, 'HARNESS_CRASH ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); T.finish(); });
