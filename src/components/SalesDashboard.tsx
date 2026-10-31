// "היום שלי" — דשבורד המכירות היומי. מטרה אחת: לדעת עם מי לדבר עכשיו ולעשות את זה בלי להיכנס לליד.
// סדר העדיפות: באיחור → היום → חמים (הצעה פתוחה) → חדשים בלי מגע. כל ליד מופיע פעם אחת בלבד.
// כל הלוגיקה ב-src/lib/metrics.ts (buildMyDay) — כאן רק תצוגה ופעולות.
import { useMemo, useState } from 'react';
import { Phone, MessageCircle, Clock, Flame, UserPlus, AlertTriangle, CalendarDays, ChevronLeft, BarChart3, Check, X, Target, PenLine, GitMerge } from 'lucide-react';
import { buildMyDay, snoozeDate, toWhatsAppNumber, summarize, type DayRow, type Deal, type OwnerScope } from '../lib/metrics';

interface Props {
  customers: any[];
  quotes: any[];
  deals: Deal[];
  userEmail: string;
  agents: { name: string; email: string }[];
  today: string;
  price: (item: any) => number;
  stageLabels: Record<string, string>;
  stageColors: Record<string, string>;
  onOpen: (c: any) => void;
  onSaveLead: (id: string, fields: Record<string, any>) => Promise<void> | void;
  onLogContact: (c: any, text: string) => Promise<void> | void;
  onCloseAsDuplicate: (lead: any, customer: any) => Promise<void> | void;
  onGoAnalytics: () => void;
}

const ils = (n: number) => '₪' + Math.round(n).toLocaleString('en-US');
const SOURCE_TAG: Record<string, { label: string; cls: string }> = {
  website: { label: 'אתר', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  facebook: { label: 'פייסבוק', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};
const daysLabel = (n: number) => (n === 0 ? 'היום' : n === 1 ? 'יום אחד' : `${n} ימים`);

type Section = 'overdue' | 'today' | 'hot' | 'fresh' | 'merge';
const SECTION_META: Record<Section, { title: string; icon: any; accent: string; empty: string }> = {
  overdue: { title: 'באיחור', icon: AlertTriangle, accent: 'border-r-red-500', empty: '' },
  today: { title: 'לחזור היום', icon: CalendarDays, accent: 'border-r-amber-500', empty: '' },
  hot: { title: 'חמים לסגירה — הצעה פתוחה', icon: Flame, accent: 'border-r-[#7B1315]', empty: '' },
  fresh: { title: 'חדשים — עוד לא דיברו איתם', icon: UserPlus, accent: 'border-r-sky-500', empty: '' },
  merge: { title: 'כבר לקוחות — ליד כפול שנשאר פתוח', icon: GitMerge, accent: 'border-r-slate-400', empty: '' },
};

export default function SalesDashboard(p: Props) {
  const [scope, setScope] = useState<OwnerScope>('mine');
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logText, setLogText] = useState('');
  const [logNext, setLogNext] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const day = useMemo(() => buildMyDay({ customers: p.customers, quotes: p.quotes, userEmail: p.userEmail, scope, today: p.today, price: p.price }),
    [p.customers, p.quotes, p.userEmail, scope, p.today, p.price]);

  const partner = p.agents.find(a => a.email !== p.userEmail);
  const monthDeals = useMemo(() => {
    const month = p.today.slice(0, 7);
    return summarize(p.deals.filter(d => d.date.startsWith(month) && (scope === 'all' || (scope === 'mine' ? d.owner === p.userEmail : d.owner && d.owner !== p.userEmail))));
  }, [p.deals, p.today, scope, p.userEmail]);

  const tasks = day.overdue.length + day.today.length + day.fresh.length;
  const next: { row: DayRow; why: string } | null =
    day.overdue[0] ? { row: day.overdue[0], why: `באיחור ${daysLabel(day.overdue[0].daysOverdue)}` }
      : day.today[0] ? { row: day.today[0], why: 'תזכורת להיום' }
        : day.hot[0] ? { row: day.hot[0], why: `הצעה פתוחה בשווי ${ils(day.hot[0].quoteValue)}` }
          : day.fresh[0] ? { row: day.fresh[0], why: `ליד חדש שממתין ${daysLabel(day.fresh[0].waitingDays)}` } : null;

  const run = async (key: string, fn: () => any) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const snooze = (c: any, days: number) => run(`sn:${c.id}`, () => p.onSaveLead(c.id, { followUpDate: snoozeDate(p.today, days) }));
  const saveLog = (c: any) => {
    const text = logText.trim();
    if (!text) return;
    run(`log:${c.id}`, async () => {
      await p.onLogContact(c, text);
      if (logNext !== null) await p.onSaveLead(c.id, { followUpDate: snoozeDate(p.today, logNext) });
      setLogFor(null); setLogText(''); setLogNext(null);
    });
  };

  const name = (c: any) => c.businessName || c.contactName || 'ללא שם';
  const reason = (r: DayRow, s: Section) => {
    if (s === 'overdue') return <span className="text-red-600 font-bold">באיחור {daysLabel(r.daysOverdue)}</span>;
    if (s === 'today') return <span className="text-amber-700 font-bold">להיום</span>;
    if (s === 'merge') return <span className="text-slate-600 font-bold">כבר קיים ככרטיס לקוח: "{name(r.customerTwin)}"</span>;
    if (s === 'hot') return <span className="text-[#7B1315] font-bold">{ils(r.quoteValue)}{r.daysSinceQuote !== null ? ` · נשלחה לפני ${daysLabel(r.daysSinceQuote)}` : ''}</span>;
    return <span className="text-sky-700 font-bold">ממתין {daysLabel(r.waitingDays)}</span>;
  };

  const renderRow = (r: DayRow, s: Section) => {
    const c = r.customer;
    const wa = toWhatsAppNumber(c.phone);
    const src = SOURCE_TAG[c.source];
    const note = c.followUpNote || '';
    const isLogging = logFor === c.id;
    return (
      <div key={c.id} data-testid={s === 'overdue' || s === 'today' ? 'dash-followup-row' : `myday-${s}-row`} className={`bg-white border border-slate-200 border-r-4 ${SECTION_META[s].accent} rounded-lg p-3`}>
        <div className="flex items-start gap-2">
          <button type="button" data-testid="myday-open" onClick={() => p.onOpen(c)} className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-800 truncate">{name(c)}</span>
              {c.contactName && c.businessName && <span className="text-xs text-slate-400 truncate">{c.contactName}</span>}
              {c.status === 'lead' && c.leadStage && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.stageColors[c.leadStage] || 'bg-slate-100 text-slate-600'}`}>{p.stageLabels[c.leadStage] || c.leadStage}</span>}
              {c.status !== 'lead' && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">לקוח קיים</span>}
              {src && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${src.cls}`}>{src.label}</span>}
              {r.unassigned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">לא משויך</span>}
            </div>
            <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
              {reason(r, s)}
              {s !== 'hot' && r.quoteValue > 0 && <span className="text-[#7B1315]">· הצעה {ils(r.quoteValue)}</span>}
              {r.daysSinceContact !== null && s !== 'fresh' && <span className="text-slate-400">· קשר אחרון לפני {daysLabel(r.daysSinceContact)}</span>}
            </div>
            {(note || r.lastLog) && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {note && <span className="text-slate-600">תזכורת: {note}</span>}
                {note && r.lastLog && <span className="text-slate-300"> · </span>}
                {r.lastLog && <span className="italic">"{r.lastLog.text}"</span>}
              </p>
            )}
          </button>
          <ChevronLeft className="w-4 h-4 text-slate-300 mt-1 shrink-0" />
        </div>

        {s === 'merge' && (
          <button type="button" data-testid="myday-dedupe" disabled={busy === `dd:${c.id}`} onClick={() => { if (window.confirm(`לסגור את הליד "${name(c)}" ככפילות של הלקוח "${name(r.customerTwin)}"?\n\nהמקור של הליד יועבר לכרטיס הלקוח (אם חסר בו), והליד יעבור לארכיון עם הפניה לכרטיס.`)) run(`dd:${c.id}`, () => p.onCloseAsDuplicate(c, r.customerTwin)); }} className="mt-2.5 flex items-center gap-1 text-xs font-bold bg-slate-800 text-white rounded-md px-3 py-1.5"><GitMerge className="w-3.5 h-3.5" /> סגור ככפילות של הלקוח</button>
        )}
        {s !== 'merge' && <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {c.phone && <a href={`tel:${c.phone}`} data-testid="myday-call" className="flex items-center gap-1 text-xs font-bold bg-green-50 text-green-700 border border-green-200 rounded-md px-2.5 py-1.5 hover:bg-green-100"><Phone className="w-3.5 h-3.5" /> חיוג</a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" data-testid="myday-wa" className="flex items-center gap-1 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-2.5 py-1.5 hover:bg-emerald-100"><MessageCircle className="w-3.5 h-3.5" /> וואטסאפ</a>}
          <button type="button" data-testid="myday-log" onClick={() => { setLogFor(isLogging ? null : c.id); setLogText(''); setLogNext(null); }} className={`flex items-center gap-1 text-xs font-bold border rounded-md px-2.5 py-1.5 ${isLogging ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}><PenLine className="w-3.5 h-3.5" /> תיעוד</button>
          {c.status === 'lead' && (
            <div className="flex items-center gap-1 mr-auto">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {[[1, 'מחר'], [3, '+3'], [7, 'שבוע']].map(([d, l]) => (
                <button key={d} type="button" data-testid={`myday-snooze-${d}`} disabled={busy === `sn:${c.id}`} onClick={() => snooze(c, d as number)} className="text-[11px] text-slate-600 border border-slate-200 rounded px-1.5 py-1 hover:bg-slate-100">{l}</button>
              ))}
            </div>
          )}
          {r.unassigned && (
            <button type="button" data-testid="myday-claim" onClick={() => run(`as:${c.id}`, () => p.onSaveLead(c.id, { assignedTo: p.userEmail }))} className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-md px-2.5 py-1.5 hover:bg-amber-100">שייך אליי</button>
          )}
        </div>}

        {isLogging && (
          <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
            <textarea data-testid="myday-log-text" autoFocus rows={2} value={logText} onChange={e => setLogText(e.target.value)} placeholder="מה סוכם בשיחה?" className="w-full text-sm border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-[#7B1315] outline-none bg-white" />
            {c.status === 'lead' && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-slate-500">תזכורת הבאה:</span>
                {([[null, 'בלי'], [1, 'מחר'], [3, '3 ימים'], [7, 'שבוע'], [14, 'שבועיים']] as [number | null, string][]).map(([d, l]) => (
                  <button key={String(d)} type="button" data-testid={`myday-next-${d ?? 'none'}`} onClick={() => setLogNext(d)} className={`px-2 py-1 rounded border ${logNext === d ? 'bg-[#7B1315] text-white border-[#7B1315]' : 'bg-white text-slate-600 border-slate-300'}`}>{l}</button>
                ))}
              </div>
            )}
            {c.status === 'lead' && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-slate-500">שלב:</span>
                {Object.entries(p.stageLabels).filter(([k]) => k !== c.leadStage).map(([k, v]) => (
                  <button key={k} type="button" data-testid={`myday-stage-${k}`} onClick={() => run(`st:${c.id}`, () => p.onSaveLead(c.id, k === 'not_relevant' ? { leadStage: k, followUpDate: null, followUpNote: '' } : { leadStage: k }))} className={`px-2 py-1 rounded-full ${p.stageColors[k] || 'bg-slate-100'}`}>{v}</button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" data-testid="myday-log-save" disabled={!logText.trim() || busy === `log:${c.id}`} onClick={() => saveLog(c)} className="flex items-center gap-1 text-xs font-bold bg-[#7B1315] text-white rounded-md px-3 py-1.5 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> שמור</button>
              <button type="button" onClick={() => setLogFor(null)} className="flex items-center gap-1 text-xs text-slate-500 px-2"><X className="w-3.5 h-3.5" /> ביטול</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const section = (s: Section, rows: DayRow[]) => {
    if (!rows.length) return null;
    const M = SECTION_META[s];
    return (
      <section data-testid={`myday-${s}`}>
        <div className="flex items-center gap-2 mb-2">
          <M.icon className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-700">{M.title}</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">{rows.length}</span>
        </div>
        <div className="space-y-2">{rows.map(r => renderRow(r, s))}</div>
      </section>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">היום שלי</h2>
          <p className="text-sm text-slate-400 mt-0.5">{new Date(p.today + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold" role="group" aria-label="של מי הלידים">
          {([['mine', 'שלי'], ['partner', partner ? `של ${partner.name}` : 'של השותף'], ['all', 'הכול']] as [OwnerScope, string][]).map(([k, l]) => (
            <button key={k} type="button" data-testid={`myday-scope-${k}`} aria-pressed={scope === k} onClick={() => setScope(k)} className={`px-3 py-1.5 rounded-md ${scope === k ? 'bg-white text-[#651011] shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-medium">משימות להיום</p>
          <p data-testid="myday-tasks" className="text-2xl font-black text-slate-800">{tasks}</p>
          {day.overdue.length > 0 && <p className="text-[11px] text-red-600 font-bold">{day.overdue.length} באיחור</p>}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-medium">הצעות פתוחות</p>
          <p data-testid="myday-pipeline" className="text-xl font-black text-[#7B1315]">{ils(day.pipelineValue)}</p>
          <p className="text-[11px] text-slate-400">{(() => { const n = [...day.overdue, ...day.today, ...day.hot, ...day.fresh].filter(r => r.quoteValue > 0).length; return n === 1 ? 'לקוח אחד' : `${n} לקוחות`; })()}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-medium">סגירות החודש</p>
          <p data-testid="myday-month-closed" className="text-2xl font-black text-green-700">{monthDeals.count}</p>
          <p className="text-[11px] text-slate-400">{ils(monthDeals.revenue)}</p>
        </div>
      </div>

      {next && (
        <div data-testid="myday-next" className="bg-[#2A3134] text-white rounded-xl p-4">
          <p className="text-[11px] text-[#EFEBD8]/70 font-bold flex items-center gap-1"><Target className="w-3.5 h-3.5" /> הפעולה הבאה</p>
          <button type="button" onClick={() => p.onOpen(next.row.customer)} className="text-right block mt-1">
            <span className="text-lg font-bold">{name(next.row.customer)}</span>
            <span className="text-sm text-[#EFEBD8]/80 mr-2">{next.why}</span>
          </button>
          {(next.row.customer.followUpNote || next.row.lastLog) && <p className="text-xs text-[#EFEBD8]/70 mt-1 line-clamp-1">{next.row.customer.followUpNote || `"${next.row.lastLog?.text}"`}</p>}
          <div className="flex gap-2 mt-3">
            {next.row.customer.phone && <a href={`tel:${next.row.customer.phone}`} className="flex items-center gap-1.5 text-sm font-bold bg-[#EFEBD8] text-[#2A3134] rounded-lg px-4 py-2"><Phone className="w-4 h-4" /> חייג עכשיו</a>}
            {toWhatsAppNumber(next.row.customer.phone) && <a href={`https://wa.me/${toWhatsAppNumber(next.row.customer.phone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-bold border border-[#EFEBD8]/40 rounded-lg px-4 py-2"><MessageCircle className="w-4 h-4" /> וואטסאפ</a>}
          </div>
        </div>
      )}

      <div data-testid="dash-followups" className="space-y-6">
        {section('overdue', day.overdue)}
        {section('today', day.today)}
      </div>
      {section('hot', day.hot)}
      {section('fresh', day.fresh)}
      {section('merge', day.merge)}

      {!next && (
        <div data-testid="myday-empty" className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Check className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="font-bold text-slate-700">אין משימות פתוחות</p>
          <p className="text-sm text-slate-400 mt-1">אין תזכורות, הצעות פתוחות או לידים חדשים שממתינים.</p>
        </div>
      )}

      <button type="button" data-testid="myday-go-analytics" onClick={p.onGoAnalytics} className="w-full flex items-center justify-center gap-2 text-sm font-bold text-[#7B1315] bg-white border border-[#DABDBD] rounded-xl py-3 hover:bg-[#F7F1F1]">
        <BarChart3 className="w-4 h-4" /> ניתוח מכירות ורווחיות
      </button>
    </div>
  );
}
