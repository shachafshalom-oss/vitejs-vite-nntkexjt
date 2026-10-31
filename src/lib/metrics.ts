// =========================================================================
// מדדי מכירות — חישוב טהור (בלי React ובלי Firestore), כדי שיהיה ניתן לבדוק.
// -------------------------------------------------------------------------
// הגדרות שאושרו ע"י שחף (31.10.2026):
// • מכירה = עסקה שהלקוח שילם עליה מקדמה/תשלום:
//   - מלאי: הצעה מאושרת (היחידות נגרעו, saleDate). ביטול אישור מנקה את saleDate ולכן יוצא לבד.
//   - הצעה "מאושרת ללא גריעת מלאי": נספרת כמכירה, בלי עלות (אין יחידות) — לא נכנסת לממוצעי רווח.
//   - קסטום: בתאריך המקדמה, בשווי המוצרים המלא. היתרה לא נספרת שוב. "שולמו רק מדידות" ובדיקות — לא.
//   - דמי תכנון אינם מכירה (נשארים הכנסה בתזרים).
// • שווי = לפני מע"מ, בלי הובלה ללקוח.
// • רווח גולמי = שווי פחות עלות המוצר בלבד: מפעל + שילוח + תיקונים + עלות תוספות (מלאי);
//   עלות landed שבפרויקט — מפעל, שילוח, מכס, נמל/הובלה/התקנה (קסטום). בלי שיווק ובלי הוצאות כלליות.
// • שילוח חסר נחשב 0. עלות מפעל חסרה (0) = עלות לא ידועה → העסקה מחוץ לממוצעי הרווח ומסומנת.
// =========================================================================

export type DealKind = 'stock' | 'custom' | 'no_stock';

export interface DealLine {
  model: string;
  qty: number;
  revenue: number;
  cost: number | null; // null = עלות לא ידועה
  listRevenue: number; // שווי לפני הנחה (לחישוב עומק ההנחה)
}

export interface Deal {
  id: string;
  kind: DealKind;
  date: string; // YYYY-MM-DD בשעון ישראל
  customerId: string;
  owner: string; // אימייל הבעלים של הלקוח ('' = לא ידוע)
  revenue: number;
  cost: number | null;
  profit: number | null;
  units: number;
  lines: DealLine[];
}

const ISRAEL_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
export const toIsraelDate = (d: any): string => {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const p: Record<string, string> = {};
  ISRAEL_FMT.formatToParts(date).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
};
const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const ownerOf = (c: any): string => c?.assignedTo || c?.createdBy || '';
const daysBetween = (fromYmd: string, toYmd: string): number =>
  Math.round((Date.parse(toYmd + 'T00:00:00Z') - Date.parse(fromYmd + 'T00:00:00Z')) / 86400000);

export interface ProjectEconomics {
  revenue: number;
  cost: number;
  lines: { model: string; qty: number; revenue: number; cost: number }[];
}

export interface BuildDealsInput {
  items: any[]; // enrichedItems (factoryCostILS, importCostILS מחושבים)
  quotes: any[];
  customProjects: any[];
  customers: any[];
  quoteItemPrice: (item: any) => number; // getEffectivePrice
  projectEconomics: (proj: any) => ProjectEconomics | null;
}

export function buildDeals(input: BuildDealsInput): Deal[] {
  const { items, quotes, customProjects, customers, quoteItemPrice, projectEconomics } = input;
  const ownerByCustomer: Record<string, string> = {};
  customers.forEach((c: any) => { ownerByCustomer[c.id] = ownerOf(c); });
  const deals: Deal[] = [];

  // --- מלאי: יחידות שנמכרו, מקובצות לפי ההצעה שאישרה אותן ---
  const quoteOfItem: Record<string, any> = {};
  quotes.forEach((q: any) => {
    if (q.status === 'approved' && Array.isArray(q.approvedItemIds)) q.approvedItemIds.forEach((id: string) => { quoteOfItem[id] = q; });
  });
  const groups: Record<string, { quote: any; items: any[] }> = {};
  items.forEach((it: any) => {
    if (it.status !== 'sold' || !it.saleDate) return;
    const q = quoteOfItem[it.id];
    const key = q ? `q:${q.id}` : `m:${it.customerId || ''}|${it.saleDate}`;
    (groups[key] = groups[key] || { quote: q, items: [] }).items.push(it);
  });
  Object.entries(groups).forEach(([key, g]) => {
    const lines: DealLine[] = g.items.map((it: any) => {
      const revenue = num(it.salePrice) + num(it.addOnPrice);
      const isLocal = it.source === 'local';
      const factory = isLocal ? num(it.localCostILS) : num(it.factoryCostILS);
      const cost = factory > 0 ? factory + num(it.importCostILS) + num(it.repairCost) + num(it.addOnCost) : null;
      return { model: it.model || 'לא ידוע', qty: 1, revenue, cost, listRevenue: revenue + num(it.discountAmount) };
    });
    const date = g.items.map((it: any) => toIsraelDate(it.saleDate)).sort()[0];
    const customerId = g.quote?.customerId || g.items[0]?.customerId || '';
    deals.push(finishDeal(key, 'stock', date, customerId, ownerByCustomer[customerId] || '', lines));
  });

  // --- הצעה מאושרת ללא גריעת מלאי: שווי מההצעה, עלות לא ידועה ---
  quotes.forEach((q: any) => {
    if (q.status !== 'approved_no_stock') return;
    const date = toIsraelDate(q.approvedAt || q.updatedAt || q.createdAt);
    if (!date) return;
    const lines: DealLine[] = (q.items || []).map((it: any) => {
      const qty = num(it.qty) || 1;
      const unit = quoteItemPrice(it);
      return { model: it.model || 'לא ידוע', qty, revenue: unit * qty, cost: null, listRevenue: (num(it.listPrice) || unit) * qty };
    });
    deals.push(finishDeal(`n:${q.id}`, 'no_stock', date, q.customerId || '', ownerByCustomer[q.customerId] || '', lines));
  });

  // --- קסטום: בתאריך המקדמה ---
  customProjects.forEach((p: any) => {
    const paid = p.status === 'deposit_paid' || p.status === 'completed' || p.status === 'approved';
    if (!paid) return;
    const date = toIsraelDate(p.depositMorningSentAt || (p.status === 'approved' ? (p.updatedAt || p.date) : null));
    if (!date) return;
    const econ = projectEconomics(p);
    if (!econ) return;
    const billed = num(p.depositProductsTotal);
    const revenueScale = billed > 0 && econ.revenue > 0 ? billed / econ.revenue : 1;
    const lines: DealLine[] = econ.lines.map(l => ({
      model: l.model, qty: l.qty, revenue: l.revenue * revenueScale, cost: l.cost > 0 ? l.cost : null, listRevenue: l.revenue * revenueScale,
    }));
    deals.push(finishDeal(`p:${p.id}`, 'custom', date, p.customerId || '', ownerByCustomer[p.customerId] || '', lines));
  });

  return deals.sort((a, b) => a.date.localeCompare(b.date));
}

function finishDeal(id: string, kind: DealKind, date: string, customerId: string, owner: string, lines: DealLine[]): Deal {
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const known = lines.length > 0 && lines.every(l => l.cost !== null);
  const cost = known ? lines.reduce((s, l) => s + (l.cost as number), 0) : null;
  return { id, kind, date, customerId, owner, revenue, cost, profit: cost === null ? null : revenue - cost, units: lines.reduce((s, l) => s + l.qty, 0), lines };
}

// =========================================================================
// ניתוח
// =========================================================================
export interface Summary {
  count: number; revenue: number; units: number; avgDeal: number;
  profitDeals: number; profit: number; marginPct: number; avgProfitPerDeal: number; avgProfitPerUnit: number;
  missingCost: number;
}
export function summarize(deals: Deal[]): Summary {
  const count = deals.length;
  const revenue = deals.reduce((s, d) => s + d.revenue, 0);
  const units = deals.reduce((s, d) => s + d.units, 0);
  const withCost = deals.filter(d => d.profit !== null);
  const pRevenue = withCost.reduce((s, d) => s + d.revenue, 0);
  const profit = withCost.reduce((s, d) => s + (d.profit as number), 0);
  const pUnits = withCost.reduce((s, d) => s + d.units, 0);
  return {
    count, revenue, units, avgDeal: count ? revenue / count : 0,
    profitDeals: withCost.length, profit,
    marginPct: pRevenue > 0 ? (profit / pRevenue) * 100 : 0,
    avgProfitPerDeal: withCost.length ? profit / withCost.length : 0,
    avgProfitPerUnit: pUnits ? profit / pUnits : 0,
    missingCost: count - withCost.length,
  };
}

export const inRange = (deals: Deal[], from: string, to: string) => deals.filter(d => (!from || d.date >= from) && (!to || d.date <= to));

export interface MonthRow { month: string; count: number; revenue: number; avgDeal: number; profit: number; marginPct: number; }
export function monthly(deals: Deal[], from: string, to: string): MonthRow[] {
  const sel = inRange(deals, from, to);
  if (!sel.length) return [];
  const start = (from || sel[0].date).slice(0, 7);
  const end = (to || sel[sel.length - 1].date).slice(0, 7);
  const rows: MonthRow[] = [];
  let [y, m] = start.split('-').map(Number);
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    const s = summarize(sel.filter(d => d.date.startsWith(key)));
    rows.push({ month: key, count: s.count, revenue: s.revenue, avgDeal: s.avgDeal, profit: s.profit, marginPct: s.marginPct });
    m++; if (m > 12) { m = 1; y++; }
  }
  return rows;
}

// שיפוע (₪ לחודש) של ממוצע העסקה — ריבועים פחותים על חודשים שיש בהם מכירות
export function trendSlope(rows: { avgDeal: number; count: number }[]): number | null {
  const pts = rows.map((r, i) => ({ x: i, y: r.avgDeal, c: r.count })).filter(p => p.c > 0);
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den ? pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den : null;
}

export interface ModelRow { model: string; units: number; revenue: number; profit: number; profitUnits: number; avgProfitPerUnit: number; marginPct: number; discountPct: number; }
export function byModel(deals: Deal[]): ModelRow[] {
  const map: Record<string, { units: number; revenue: number; list: number; profit: number; pRevenue: number; pUnits: number }> = {};
  deals.forEach(d => d.lines.forEach(l => {
    const r = (map[l.model] = map[l.model] || { units: 0, revenue: 0, list: 0, profit: 0, pRevenue: 0, pUnits: 0 });
    r.units += l.qty; r.revenue += l.revenue; r.list += l.listRevenue;
    if (l.cost !== null) { r.profit += l.revenue - l.cost; r.pRevenue += l.revenue; r.pUnits += l.qty; }
  }));
  return Object.entries(map).map(([model, r]) => ({
    model, units: r.units, revenue: r.revenue, profit: r.profit, profitUnits: r.pUnits,
    avgProfitPerUnit: r.pUnits ? r.profit / r.pUnits : 0,
    marginPct: r.pRevenue > 0 ? (r.profit / r.pRevenue) * 100 : 0,
    discountPct: r.list > 0 ? ((r.list - r.revenue) / r.list) * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

// --- המרה: לידים שנוצרו בטווח → כמה הגיעו למכירה (בכל זמן) ---
const SOURCE_LABELS: Record<string, string> = { website: 'אתר', facebook: 'פייסבוק', manual: 'ידני' };
export const sourceLabel = (s: string) => SOURCE_LABELS[s] || s;
export const wasLead = (c: any): boolean =>
  c?.status === 'lead' || !!c?.leadStage || c?.previousStatusBeforeActive === 'lead' || c?.source === 'website' || c?.source === 'facebook';

export interface ConvRow { key: string; leads: number; won: number; ratePct: number; avgDaysToSale: number | null; }
export function conversion(customers: any[], deals: Deal[], from: string, to: string, by: 'source' | 'owner'): ConvRow[] {
  const firstDeal: Record<string, string> = {};
  deals.forEach(d => { if (d.customerId && (!firstDeal[d.customerId] || d.date < firstDeal[d.customerId])) firstDeal[d.customerId] = d.date; });
  const map: Record<string, { leads: number; won: number; days: number[] }> = {};
  customers.forEach((c: any) => {
    if (!wasLead(c)) return;
    const created = toIsraelDate(c.createdAt);
    if (!created || (from && created < from) || (to && created > to)) return;
    const key = by === 'source' ? (c.source === 'website' || c.source === 'facebook' ? c.source : 'manual') : (ownerOf(c) || 'לא משויך');
    const r = (map[key] = map[key] || { leads: 0, won: 0, days: [] });
    r.leads++;
    const fd = firstDeal[c.id];
    if (fd) { r.won++; r.days.push(Math.max(0, daysBetween(created, fd))); }
  });
  return Object.entries(map).map(([key, r]) => ({
    key, leads: r.leads, won: r.won, ratePct: r.leads ? (r.won / r.leads) * 100 : 0,
    avgDaysToSale: r.days.length ? r.days.reduce((s, x) => s + x, 0) / r.days.length : null,
  })).sort((a, b) => b.leads - a.leads);
}

// --- הצעות פתוחות ---
export const quoteItemsTotal = (q: any, price: (it: any) => number) =>
  (q?.items || []).reduce((s: number, it: any) => s + price(it) * (num(it.qty) || 1), 0);

export interface Pipeline { count: number; value: number; staleCount: number; staleValue: number; }
export function pipeline(quotes: any[], price: (it: any) => number, today: string, staleDays = 14): Pipeline {
  const open = quotes.filter((q: any) => q.status === 'pending');
  const val = (q: any) => quoteItemsTotal(q, price);
  const stale = open.filter((q: any) => { const d = toIsraelDate(q.createdAt); return d && daysBetween(d, today) > staleDays; });
  return { count: open.length, value: open.reduce((s, q) => s + val(q), 0), staleCount: stale.length, staleValue: stale.reduce((s, q) => s + val(q), 0) };
}

// --- "איפה משפרים": ממצאים שנגזרים מהנתונים בלבד. כל כלל מופעל רק כשיש מספיק נתונים ---
export interface Insight { tone: 'good' | 'warn' | 'info'; text: string; }
const ils = (n: number) => '₪' + Math.round(n).toLocaleString('en-US');
export function insights(args: { deals: Deal[]; months: MonthRow[]; models: ModelRow[]; sources: ConvRow[]; pipe: Pipeline; summary: Summary }): Insight[] {
  const { deals, months, models, sources, pipe, summary } = args;
  const out: Insight[] = [];
  const active = months.filter(m => m.count > 0);
  if (active.length >= 4) {
    const recent = active.slice(-3), prev = active.slice(-6, -3);
    const avg = (rs: MonthRow[]) => { const c = rs.reduce((s, r) => s + r.count, 0); return c ? rs.reduce((s, r) => s + r.revenue, 0) / c : 0; };
    const a = avg(recent), b = avg(prev);
    if (b > 0) {
      const pct = ((a - b) / b) * 100;
      if (Math.abs(pct) >= 5) out.push({ tone: pct > 0 ? 'good' : 'warn', text: `ממוצע העסקה ב-3 חודשי המכירה האחרונים ${pct > 0 ? 'עלה' : 'ירד'} ב-${Math.abs(Math.round(pct))}% (${ils(b)} ← ${ils(a)}).` });
    }
  }
  const solid = models.filter(m => m.profitUnits >= 3);
  if (solid.length >= 2 && summary.marginPct > 0) {
    const worst = [...solid].sort((x, y) => x.marginPct - y.marginPct)[0];
    if (worst.marginPct < summary.marginPct - 5) out.push({ tone: 'warn', text: `${worst.model}: מרווח ${Math.round(worst.marginPct)}% לעומת ${Math.round(summary.marginPct)}% בממוצע. כדאי לבדוק מחיר או עלות.` });
    const discounted = [...solid].sort((x, y) => y.discountPct - x.discountPct)[0];
    if (discounted.discountPct >= 5) out.push({ tone: 'warn', text: `${discounted.model}: הנחה ממוצעת של ${Math.round(discounted.discountPct)}% מהמחירון.` });
  }
  const srcs = sources.filter(s => s.leads >= 5);
  if (srcs.length >= 2) {
    const best = [...srcs].sort((x, y) => y.ratePct - x.ratePct)[0], worst = [...srcs].sort((x, y) => x.ratePct - y.ratePct)[0];
    if (best.ratePct - worst.ratePct >= 5) out.push({ tone: 'info', text: `המרה של ${Math.round(best.ratePct)}% מלידים מ${sourceLabel(best.key)}, לעומת ${Math.round(worst.ratePct)}% מלידים מ${sourceLabel(worst.key)}.` });
  }
  if (pipe.staleCount > 0) out.push({ tone: 'warn', text: `${pipe.staleCount === 1 ? 'הצעה אחת ממתינה' : `${pipe.staleCount} הצעות ממתינות`} יותר מ-14 יום, בשווי ${ils(pipe.staleValue)}. זה הכסף הכי קרוב לסגירה.` });
  const kinds = (k: DealKind) => summarize(deals.filter(d => d.kind === k));
  const st = kinds('stock'), cu = kinds('custom');
  if (st.profitDeals >= 3 && cu.profitDeals >= 2) out.push({ tone: 'info', text: `מרווח של ${Math.round(st.marginPct)}% במלאי מול ${Math.round(cu.marginPct)}% בקסטום, וממוצע עסקה של ${ils(st.avgDeal)} מול ${ils(cu.avgDeal)} בקסטום.` });
  if (summary.missingCost > 0) out.push({ tone: 'info', text: `${summary.missingCost} עסקאות בלי עלות ידועה (אושרו ללא מלאי, או יחידה בלי עלות מפעל). הן לא נכנסות לחישובי הרווח.` });
  return out.slice(0, 5);
}

// =========================================================================
// "היום שלי" — תור העבודה היומי
// =========================================================================
export type OwnerScope = 'mine' | 'partner' | 'all';
export interface DayRow {
  customer: any;
  followUpDate: string | null;
  daysOverdue: number;
  lastLog: any | null; // התיעוד האחרון שאינו system
  daysSinceContact: number | null;
  waitingDays: number; // מאז שהליד נכנס
  quoteValue: number;
  daysSinceQuote: number | null;
  unassigned: boolean;
}
export interface MyDay { overdue: DayRow[]; today: DayRow[]; fresh: DayRow[]; hot: DayRow[]; pipelineValue: number; }

export function buildMyDay(args: { customers: any[]; quotes: any[]; userEmail: string; scope: OwnerScope; today: string; price: (it: any) => number }): MyDay {
  const { customers, quotes, userEmail, scope, today, price } = args;
  const inScope = (c: any) => {
    const o = ownerOf(c);
    if (scope === 'all') return true;
    if (scope === 'mine') return !!userEmail && o === userEmail;
    return !!o && o !== userEmail;
  };
  const pendingByCustomer: Record<string, any[]> = {};
  quotes.forEach((q: any) => { if (q.status === 'pending' && q.customerId) (pendingByCustomer[q.customerId] = pendingByCustomer[q.customerId] || []).push(q); });

  const row = (c: any): DayRow => {
    const real = (c.interactionLogs || []).filter((l: any) => l.type !== 'system');
    const lastLog = real.length ? real[real.length - 1] : null;
    const created = toIsraelDate(c.createdAt);
    const lastContact = lastLog ? toIsraelDate(lastLog.date) : '';
    const qs = pendingByCustomer[c.id] || [];
    const lastQuote = qs.map((q: any) => toIsraelDate(q.updatedAt || q.createdAt)).filter(Boolean).sort().pop() || '';
    return {
      customer: c,
      followUpDate: c.followUpDate || null,
      daysOverdue: c.followUpDate && c.followUpDate < today ? daysBetween(c.followUpDate, today) : 0,
      lastLog,
      daysSinceContact: lastContact ? daysBetween(lastContact, today) : null,
      waitingDays: created ? Math.max(0, daysBetween(created, today)) : 0,
      quoteValue: qs.reduce((s: number, q: any) => s + quoteItemsTotal(q, price), 0),
      daysSinceQuote: lastQuote ? daysBetween(lastQuote, today) : null,
      unassigned: !ownerOf(c),
    };
  };

  const used = new Set<string>();
  const take = (list: any[]) => list.filter(c => !used.has(c.id)).map(c => { used.add(c.id); return row(c); });
  const leads = customers.filter((c: any) => c.status === 'lead' && c.leadStage !== 'not_relevant');
  const owned = leads.filter(inScope);

  const overdue = take(owned.filter(c => c.followUpDate && c.followUpDate < today)).sort((a, b) => b.daysOverdue - a.daysOverdue || b.quoteValue - a.quoteValue);
  const todays = take(owned.filter(c => c.followUpDate === today)).sort((a, b) => b.quoteValue - a.quoteValue);
  // "חמים": יש הצעה פתוחה — כולל לקוחות קיימים (הזמנה חוזרת). לא ליד שסומן לא רלוונטי.
  const hotPool = customers.filter((c: any) => (pendingByCustomer[c.id] || []).length > 0 && !(c.status === 'lead' && c.leadStage === 'not_relevant') && inScope(c));
  const hot = take(hotPool).sort((a, b) => b.quoteValue - a.quoteValue);
  // חדשים בלי מגע: גם לידים בלי בעלים (מהאתר/פייסבוק לפני שיוך), כדי שאף אחד לא ייפול בין הכיסאות
  const freshPool = leads.filter(c => (c.leadStage || 'new') === 'new' && !(c.interactionLogs || []).some((l: any) => l.type !== 'system') && (inScope(c) || !ownerOf(c)));
  const fresh = take(freshPool).sort((a, b) => b.waitingDays - a.waitingDays);

  const pipelineValue = [...overdue, ...todays, ...hot, ...fresh].reduce((s, r) => s + r.quoteValue, 0);
  return { overdue, today: todays, fresh, hot, pipelineValue };
}

export const toWhatsAppNumber = (phone: any): string => {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '972' + p.slice(1);
  return p;
};

export const addDaysYmd = (ymd: string, days: number): string => {
  const d = new Date(Date.parse(ymd + 'T12:00:00Z') + days * 86400000);
  return d.toISOString().slice(0, 10);
};
// דחיית תזכורת: אם נופלת על שישי/שבת — עוברת ליום ראשון (כמו addBusinessDays ב-App)
export const snoozeDate = (ymd: string, days: number): string => {
  let out = addDaysYmd(ymd, days);
  const dow = new Date(out + 'T12:00:00Z').getUTCDay();
  if (dow === 5) out = addDaysYmd(out, 2);
  else if (dow === 6) out = addDaysYmd(out, 1);
  return out;
};
