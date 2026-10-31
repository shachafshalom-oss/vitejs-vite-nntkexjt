// ניתוח מכירות — בתוך טאב הכספים. כל המספרים מ-src/lib/metrics.ts (הגדרות שאושרו 31.10.2026):
// מכירה = תשלום/מקדמה, שווי לפני מע"מ בלי הובלה, רווח גולמי = בלי שיווק והוצאות כלליות.
import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Lightbulb, AlertTriangle, Info, Users } from 'lucide-react';
import { inRange, summarize, monthly, trendSlope, byModel, conversion, pipeline, insights, sourceLabel, addDaysYmd, type Deal, type MonthRow } from '../lib/metrics';

interface Props {
  deals: Deal[];
  customers: any[];
  quotes: any[];
  agents: { name: string; email: string }[];
  today: string;
  price: (item: any) => number;
  onAiInsights?: () => void;
}

const ils = (n: number) => '₪' + Math.round(n).toLocaleString('en-US');
const pct = (n: number) => `${Math.round(n)}%`;
type RangeKey = '3m' | '6m' | '12m' | 'ytd' | 'all';
type Segment = 'stock' | 'custom' | 'all';
const SEGMENTS: [Segment, string][] = [['stock', 'מוצרי מלאי'], ['custom', 'קסטום'], ['all', 'הכול']];
const kShort = (n: number) => (Math.abs(n) >= 10000 ? `₪${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : '₪' + Math.round(n).toLocaleString('en-US'));
const RANGES: [RangeKey, string][] = [['3m', '3 חודשים'], ['6m', '6 חודשים'], ['12m', '12 חודשים'], ['ytd', 'השנה'], ['all', 'הכול']];

const rangeFrom = (key: RangeKey, today: string): string => {
  if (key === 'all') return '';
  if (key === 'ytd') return today.slice(0, 4) + '-01-01';
  const back = key === '3m' ? 2 : key === '6m' ? 5 : 11; // כולל החודש הנוכחי
  let [y, m] = today.slice(0, 7).split('-').map(Number);
  m -= back; while (m <= 0) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
};
const monthLabel = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(2, 4)}`;

// גרף עמודות פשוט ב-SVG, עם קו מגמה אופציונלי. ציר זמן משמאל לימין.
function BarChart({ rows, value, color, trend, testId, fmt, sub }: { rows: MonthRow[]; value: (r: MonthRow) => number; color: string; trend?: boolean; testId: string; fmt: (n: number) => string; sub?: (r: MonthRow) => string }) {
  // גופנים ביחידות viewBox: 640 רוחב → בטלפון (~340px) קנה מידה ~0.53, לכן 20 ≈ 11px בפועל
  const W = 640, H = sub ? 290 : 260, padL = 8, padR = 8, padT = 30, padB = sub ? 62 : 36;
  const vals = rows.map(value);
  const max = Math.max(1, ...vals);
  const bw = (W - padL - padR) / Math.max(1, rows.length);
  const y = (v: number) => H - padB - (v / max) * (H - padT - padB);
  let trendLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (trend) {
    const pts = rows.map((r, i) => ({ i, v: value(r), c: r.count })).filter(p => p.c > 0);
    if (pts.length >= 3) {
      const n = pts.length, mx = pts.reduce((s, p) => s + p.i, 0) / n, my = pts.reduce((s, p) => s + p.v, 0) / n;
      const den = pts.reduce((s, p) => s + (p.i - mx) ** 2, 0);
      if (den) {
        const k = pts.reduce((s, p) => s + (p.i - mx) * (p.v - my), 0) / den;
        const at = (i: number) => Math.max(0, my + k * (i - mx));
        const i0 = pts[0].i, i1 = pts[pts.length - 1].i;
        trendLine = { x1: padL + bw * i0 + bw / 2, y1: y(at(i0)), x2: padL + bw * i1 + bw / 2, y2: y(at(i1)) };
      }
    }
  }
  // בטלפון 12 תוויות חודש נדחסות — מעל 8 חודשים מציגים כל חודש שני (הערך עצמו מופיע על כל עמודה)
  const showEvery = rows.length > 12 ? Math.ceil(rows.length / 6) : rows.length > 8 ? 2 : 1;
  const subEvery = rows.length > 12 ? showEvery : 1;
  return (
    <div dir="ltr" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-60" role="img">
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#e2e8f0" />
        {rows.map((r, i) => {
          const v = value(r), x = padL + bw * i, h = H - padB - y(v);
          return (
            <g key={r.month}>
              {v > 0 && <rect x={x + bw * 0.18} y={y(v)} width={bw * 0.64} height={h} rx={3} fill={color} opacity={r.count ? 1 : 0.25}><title>{`${monthLabel(r.month)}: ${fmt(v)} (${r.count} עסקאות)`}</title></rect>}
              {v > 0 && rows.length <= 12 && <text x={x + bw / 2} y={y(v) - 7} textAnchor="middle" fontSize={19} fill="#475569">{fmt(v)}</text>}
              {i % showEvery === 0 && <text x={x + bw / 2} y={H - padB + 26} textAnchor="middle" fontSize={19} fill="#64748b">{monthLabel(r.month)}</text>}
              {sub && r.count > 0 && i % subEvery === 0 && <text x={x + bw / 2} y={H - padB + 52} textAnchor="middle" fontSize={18} fontWeight={700} fill="#15803d">{sub(r)}</text>}
            </g>
          );
        })}
        {trendLine && <line {...trendLine} stroke="#2A3134" strokeWidth={3} strokeDasharray="8 6" />}
      </svg>
    </div>
  );
}

function SplitTile({ label, stock, custom, id }: { label: string; stock: string; custom: string; id: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <p className="text-[11px] text-slate-500 font-medium">{label}</p>
      <div data-testid={id} className="mt-1 space-y-0.5">
        <p className="flex justify-between items-baseline gap-2"><span className="text-[11px] text-slate-500">מלאי</span><span className="text-base font-black text-slate-800">{stock}</span></p>
        <p className="flex justify-between items-baseline gap-2"><span className="text-[11px] text-slate-500">קסטום</span><span className="text-base font-black text-slate-800">{custom}</span></p>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, id }: { label: string; value: string; sub?: any; id: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <p className="text-[11px] text-slate-500 font-medium">{label}</p>
      <p data-testid={id} className="text-xl md:text-2xl font-black text-slate-800 mt-0.5">{value}</p>
      <div className="min-h-[16px]">{sub}</div>
    </div>
  );
}

export default function SalesAnalytics(p: Props) {
  const [range, setRange] = useState<RangeKey>('12m');
  // מלאי וקסטום הם שני עסקים שונים (ממוצע עסקה פי ~20) — ערבוב נותן ממוצעים חסרי משמעות. ברירת מחדל: מלאי.
  const [seg, setSeg] = useState<Segment>('stock');
  const from = rangeFrom(range, p.today);
  const to = p.today;

  const data = useMemo(() => {
    const segDeals = p.deals.filter(d => seg === 'all' || (seg === 'custom' ? d.kind === 'custom' : d.kind !== 'custom'));
    const sel = inRange(segDeals, from, to);
    const summary = summarize(sel);
    const mFrom = from || (p.deals[0]?.date ?? '');
    const months = monthly(segDeals, mFrom, to);
    // ב"הכול": חודשים לכל סוג בנפרד, על אותו ציר (לגרף דו-סדרתי)
    const monthsStock = seg === 'all' ? monthly(p.deals.filter(d => d.kind !== 'custom'), mFrom, to) : [];
    const monthsCustom = seg === 'all' ? monthly(p.deals.filter(d => d.kind === 'custom'), mFrom, to) : [];
    const align = (rows: MonthRow[]) => months.map(m => rows.find(r => r.month === m.month) || { ...m, count: 0, revenue: 0, avgDeal: 0, profit: 0, marginPct: 0 });
    const slope = trendSlope(months);
    const models = byModel(sel);
    const sources = conversion(p.customers, p.deals, from, to, 'source');
    const owners = conversion(p.customers, p.deals, from, to, 'owner');
    const pipe = pipeline(p.quotes, p.price, p.today);
    const allSel = inRange(p.deals, from, to);
    const stock = summarize(allSel.filter(d => d.kind !== 'custom'));
    const custom = summarize(allSel.filter(d => d.kind === 'custom'));
    // השוואה לתקופה הקודמת באותו אורך
    let prev = null as null | ReturnType<typeof summarize>;
    if (from) {
      const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
      prev = summarize(inRange(segDeals, addDaysYmd(from, -days - 1), addDaysYmd(from, -1)));
    }
    return { summary, months, monthsStock: align(monthsStock), monthsCustom: align(monthsCustom), slope, models, sources, owners, pipe, stock, custom, prev, found: insights({ deals: sel, months, models, sources, pipe, summary }) };
  }, [p.deals, p.customers, p.quotes, p.price, p.today, from, to, seg]);

  const { summary: s, prev } = data;
  const delta = (cur: number, old: number | undefined) => {
    if (!prev || !old) return null;
    const d = ((cur - old) / old) * 100;
    if (!Number.isFinite(d) || Math.abs(d) < 1) return null;
    return <span className={`text-[11px] font-bold ${d > 0 ? 'text-green-600' : 'text-red-600'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(Math.round(d))}%</span>;
  };
  const agentName = (email: string) => p.agents.find(a => a.email === email)?.name || (email.includes('@') ? email.split('@')[0] : email);

  return (
    <div className="space-y-6" data-testid="sales-analytics">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">ניתוח מכירות</h2>
          <p className="text-xs text-slate-400 mt-0.5">מכירה = תשלום או מקדמה · לפני מע"מ, בלי הובלה · רווח גולמי, בלי שיווק</p>
        </div>
        {p.onAiInsights && (
          <button type="button" onClick={p.onAiInsights} className="flex items-center gap-1.5 text-sm font-bold text-white bg-[#7B1315] hover:bg-[#651011] rounded-lg px-3 py-2">
            <Sparkles className="w-4 h-4 text-yellow-300" /> יועץ AI
          </button>
        )}
      </div>

      <div className="flex bg-slate-100 rounded-lg p-0.5 text-sm font-bold w-full sm:w-fit" role="group" aria-label="סוג מכירות">
        {SEGMENTS.map(([k, l]) => (
          <button key={k} type="button" data-testid={`analytics-seg-${k}`} aria-pressed={seg === k} onClick={() => setSeg(k)} className={`flex-1 sm:flex-none px-4 py-2 rounded-md ${seg === k ? 'bg-white text-[#651011] shadow-sm' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>

      <div className="flex gap-1 flex-wrap" role="group" aria-label="טווח זמן">
        {RANGES.map(([k, l]) => (
          <button key={k} type="button" data-testid={`analytics-range-${k}`} aria-pressed={range === k} onClick={() => setRange(k)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${range === k ? 'bg-[#2A3134] text-white border-[#2A3134]' : 'bg-white text-slate-600 border-slate-300'}`}>{l}</button>
        ))}
      </div>

      {s.count === 0 ? (
        <div data-testid="analytics-empty" className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">אין מכירות בטווח הזה.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <Tile id="an-count" label="מכירות" value={String(s.count)} sub={delta(s.count, prev?.count)} />
            <Tile id="an-revenue" label="הכנסה" value={ils(s.revenue)} sub={delta(s.revenue, prev?.revenue)} />
            {seg === 'all' ? (
              <SplitTile id="an-avg-deal" label="ממוצע לעסקה" stock={ils(data.stock.avgDeal)} custom={ils(data.custom.avgDeal)} />
            ) : (
              <Tile id="an-avg-deal" label="ממוצע לעסקה" value={ils(s.avgDeal)} sub={delta(s.avgDeal, prev?.avgDeal)} />
            )}
            <Tile id="an-profit" label="רווח גולמי" value={ils(s.profit)} sub={delta(s.profit, prev?.profit)} />
            {seg === 'all' ? (
              <>
                <SplitTile id="an-margin" label="מרווח גולמי" stock={pct(data.stock.marginPct)} custom={pct(data.custom.marginPct)} />
                <SplitTile id="an-profit-unit" label="רווח ממוצע לעסקה" stock={ils(data.stock.avgProfitPerDeal)} custom={ils(data.custom.avgProfitPerDeal)} />
              </>
            ) : (
              <>
                <Tile id="an-margin" label="מרווח גולמי" value={pct(s.marginPct)} sub={<span className="text-[11px] text-slate-400">רווח ממוצע לעסקה {ils(s.avgProfitPerDeal)}</span>} />
                <Tile id="an-profit-unit" label={seg === 'custom' ? 'רווח ממוצע ליחידה' : 'רווח ממוצע לעמדה'} value={ils(s.avgProfitPerUnit)} sub={<span className="text-[11px] text-slate-400">{s.units} יחידות</span>} />
              </>
            )}
          </div>
          {prev && <p className="text-[11px] text-slate-400 -mt-4">החצים: שינוי לעומת התקופה הקודמת באותו אורך.</p>}
          {s.missingCost > 0 && (
            <p data-testid="an-missing-cost" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {s.missingCost} עסקאות בלי עלות ידועה. הן נכללות בהכנסה ובממוצע לעסקה, אבל לא ברווח ובמרווח.
            </p>
          )}

          {data.found.length > 0 && (
            <div data-testid="an-insights" className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3"><Lightbulb className="w-4 h-4 text-amber-500" /> איפה משפרים</h3>
              <ul className="space-y-2">
                {data.found.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    {f.tone === 'good' ? <TrendingUp className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : f.tone === 'warn' ? <TrendingDown className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> : <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />}
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-700">ממוצע לעסקה לפי חודש</h3>
                {seg !== 'all' && data.slope !== null && (
                  <span data-testid="an-trend" className={`text-xs font-bold ${data.slope >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    מגמה: {data.slope >= 0 ? '+' : '−'}{ils(Math.abs(data.slope))} לחודש
                  </span>
                )}
              </div>
              {seg === 'all' ? (
                <>
                  {/* שני גרפים נפרדים, כל אחד בסקאלה שלו — עסקת קסטום גדולה פי ~20 ובגרף משותף המלאי נעלם */}
                  <p className="text-xs font-bold text-[#7B1315] mt-1">מוצרי מלאי</p>
                  <BarChart testId="an-chart-avg" rows={data.monthsStock} value={r => r.avgDeal} color="#7B1315" trend fmt={n => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)))} />
                  <p className="text-xs font-bold text-[#2A3134] mt-3">קסטום</p>
                  <BarChart testId="an-chart-avg-custom" rows={data.monthsCustom} value={r => r.avgDeal} color="#2A3134" fmt={n => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)))} />
                </>
              ) : (
                <>
                  <BarChart testId="an-chart-avg" rows={data.months} value={r => r.avgDeal} color={seg === 'custom' ? '#2A3134' : '#7B1315'} trend fmt={n => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)))} />
                  <p className="text-[11px] text-slate-400 mt-1">הקו המקווקו: מגמה על פני חודשים עם מכירות.</p>
                </>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-2">רווח גולמי לפי חודש</h3>
              <BarChart testId="an-chart-profit" rows={data.months} value={r => Math.max(0, r.profit)} color="#15803d" sub={r => pct(r.marginPct)} fmt={n => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)))} />
              <p className="text-[11px] text-slate-400 mt-1">בירוק מתחת לחודש: המרווח הגולמי של אותו חודש.</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <h3 className="text-sm font-bold text-slate-700 p-4 pb-2">{seg === 'custom' ? 'רווחיות קסטום' : 'רווחיות לפי דגם'}</h3>
            {/* טבלה צרה שנכנסת ברוחב טלפון: עמודת דגם צרה עם שבירת שורה, ריווח מינימלי, הכנסה מקוצרת */}
            <div className="overflow-x-auto">
              <table data-testid="an-models" className="w-full table-fixed text-xs">
                <colgroup><col className="w-[30%]" /><col className="w-[9%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[14%]" /><col className="w-[13%]" /></colgroup>
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-1.5 py-2 text-right font-medium">דגם</th>
                    <th className="px-1 py-2 text-center font-medium">יח'</th>
                    <th className="px-1 py-2 text-right font-medium">הכנסה</th>
                    <th className="px-1 py-2 text-right font-medium">רווח/יח'</th>
                    <th className="px-1 py-2 text-center font-medium">מרווח</th>
                    <th className="px-1 py-2 text-center font-medium">הנחה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.models.map(m => (
                    <tr key={m.model} className="align-top">
                      <td className="px-1.5 py-2 font-bold text-slate-800 break-words leading-snug">{m.model}</td>
                      <td className="px-1 py-2 text-center">{m.units}</td>
                      <td className="px-1 py-2 whitespace-nowrap">{kShort(m.revenue)}</td>
                      <td className="px-1 py-2 whitespace-nowrap">{m.profitUnits ? kShort(m.avgProfitPerUnit) : '—'}</td>
                      <td className={`px-1 py-2 text-center font-bold ${m.profitUnits ? (m.marginPct < s.marginPct - 5 ? 'text-red-600' : 'text-green-700') : 'text-slate-400'}`}>{m.profitUnits ? pct(m.marginPct) : '—'}</td>
                      <td className="px-1 py-2 text-center text-slate-500">{m.discountPct >= 0.5 ? pct(m.discountPct) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {seg === 'all' && <div className="grid grid-cols-2 gap-3">
            {([['מלאי', data.stock, 'an-kind-stock'], ['קסטום', data.custom, 'an-kind-custom']] as const).map(([label, k, id]) => (
              <div key={id} data-testid={id} className="bg-white border border-slate-200 rounded-xl p-3.5">
                <p className="text-sm font-bold text-slate-700">{label}</p>
                <p className="text-xs text-slate-500 mt-1">{k.count} עסקאות · {ils(k.revenue)}</p>
                <p className="text-xs text-slate-500">ממוצע {ils(k.avgDeal)}</p>
                <p className="text-xs font-bold text-slate-700">{k.profitDeals ? `מרווח ${pct(k.marginPct)}` : 'אין נתוני עלות'}</p>
              </div>
            ))}
          </div>}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5"><Users className="w-4 h-4 text-slate-400" /> המרת לידים</h3>
          <p className="text-[11px] text-slate-400 mb-3">לידים שנכנסו בטווח, וכמה מהם הגיעו למכירה.</p>
          {[['לפי מקור', data.sources, (k: string) => sourceLabel(k), 'an-conv-source'], ['לפי נציג', data.owners, agentName, 'an-conv-owner']].map(([title, rows, lbl, id]: any) => (
            <div key={id} data-testid={id} className="mb-3 last:mb-0">
              <p className="text-xs font-bold text-slate-500 mb-1.5">{title}</p>
              {rows.length === 0 ? <p className="text-xs text-slate-400">אין לידים בטווח.</p> : rows.map((r: any) => (
                <div key={r.key} className="flex items-center gap-2 text-xs py-1">
                  <span className="w-20 shrink-0 font-medium text-slate-700 truncate">{lbl(r.key)}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2"><div className="bg-[#7B1315] h-2 rounded-full" style={{ width: `${Math.min(100, r.ratePct)}%` }} /></div>
                  <span className="w-32 shrink-0 text-left text-slate-600"><b>{pct(r.ratePct)}</b> · {r.won} מ-{r.leads}{r.avgDaysToSale !== null ? ` · ${Math.round(r.avgDaysToSale)} ימ'` : ''}</span>
                </div>
              ))}
            </div>
          ))}
          <p className="text-[10px] text-slate-400">ימ' = ימים בממוצע מכניסת הליד ועד המכירה.</p>
        </div>
        <div data-testid="an-pipeline" className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-3">הצעות פתוחות (עכשיו)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] text-slate-500">פתוחות</p><p className="text-xl font-black text-slate-800">{data.pipe.count}</p><p className="text-xs text-slate-500">{ils(data.pipe.value)}</p></div>
            <div><p className="text-[11px] text-slate-500">ממתינות מעל 14 יום</p><p className={`text-xl font-black ${data.pipe.staleCount ? 'text-red-600' : 'text-slate-800'}`}>{data.pipe.staleCount}</p><p className="text-xs text-slate-500">{ils(data.pipe.staleValue)}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
