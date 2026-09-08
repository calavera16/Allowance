import { memo, useEffect, useMemo, useState } from "react";
import type { DashboardState } from "./types";
import { budgetFor, dateKey, duration, freshProvider, paceFor, recommendProvider, windowKey,
  type CodingSession, type InsightData, type ProviderId } from "./insights";
import { CompanionCustomizer } from "./CompanionCustomizer";
import { BudgetPreferences } from "./components/BudgetPreferences";

const names = { codex: "Codex", claude: "Claude" };
const amount = (n: number) => n.toFixed(1).replace(/\.0$/, "");
function SessionElapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000); return () => window.clearInterval(timer); }, []);
  return <span>Session running ? {duration(now - startedAt)}</span>;
}
function Receipt({ session, now }: { session: CodingSession; now: number }) {
  return <div className="session-receipt">
    <div><strong>{session.name}</strong><span>{duration((session.endedAt || now) - session.startedAt)} · {new Date(session.startedAt * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
    <div className="receipt-usage">{session.usage.length ? session.usage.map(u => <span key={u.key} className={`ink-${u.provider}`}>{names[u.provider]} · {u.label}: {amount(u.used)} percentage points</span>) : <span>{session.endedAt ? "No comparable observations were captured." : "Waiting for comparable observations"}</span>}</div>
    {session.partial && <small>Partial receipt: a reset or missing observations interrupted tracking.</small>}
  </div>;
}

function PlanningHubView({ data, state, now, busy, overlayEnabled, onChange, onSession, onOverlay, view }: {
  view: "overview" | "plan" | "activity" | "companion";
  data: InsightData; state: DashboardState | null; now: number; busy: boolean; overlayEnabled: boolean;
  onChange: (patch: Partial<InsightData>) => void;
  onSession: (action: "start" | "finish", name?: string) => Promise<void>;
  onOverlay: (enabled: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [intensity, setIntensity] = useState(1);
  const [heatProvider, setHeatProvider] = useState<ProviderId>("codex");
  const [heatWindow, setHeatWindow] = useState("");
  const [selectedDay, setSelectedDay] = useState(dateKey(now));
  const [timelineDays, setTimelineDays] = useState(7);
  const providers = state?.providers || [];
  const recommendation = useMemo(() => recommendProvider(providers, data, now), [state, data, now]);
  const timeline = useMemo(() => providers.flatMap(p => p.windows.map(w => ({ ...w, provider: p.provider, fresh: freshProvider(p, now) })))
    .sort((a, b) => (a.resetsAt || Infinity) - (b.resetsAt || Infinity)), [state, now]);
  const heatWindows = useMemo(() => [...new Map([
    ...data.series.filter(s => s.provider === heatProvider).sort((a, b) => b.minutes - a.minutes).map(s => [s.key, s.label] as const),
    ...data.days.flatMap(d => d.usage.filter(u => u.provider === heatProvider).map(u => [u.key, u.label] as const)),
  ]).entries()], [data.series, data.days, heatProvider]);
  const heatKey = heatWindows.some(([key]) => key === heatWindow) ? heatWindow : heatWindows[0]?.[0];
  const calendar = useMemo(() => {
    const end = new Date(now * 1000); end.setHours(12, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 89);
    const days: Array<{ date: string; value: number | null; future: boolean }> = [];
    for (let i = 0; i < start.getDay(); i++) days.push({ date: "", value: null, future: false });
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = dateKey(d.getTime() / 1000);
      const entry = data.days.find(day => day.date === date)?.usage.find(u => u.key === heatKey);
      days.push({ date, value: entry?.used ?? null, future: false });
    }
    return days;
  }, [data.days, heatKey, dateKey(now)]);
  const max = Math.max(1, ...calendar.map(d => d.value || 0));
  const day = data.days.find(d => d.date === selectedDay);
  const selectedUsage = day?.usage.find(u => u.key === heatKey);
  const daySessions = [...data.sessions, ...(data.active ? [data.active] : [])].filter(s => dateKey(s.startedAt) <= selectedDay && dateKey(s.endedAt || now) >= selectedDay);
  const minimum = providers.filter(p => freshProvider(p, now)).flatMap(p => p.windows.map(w => w.remainingPercent));
  const canStart = providers.some(p => freshProvider(p, now));

  return <section className="planning-hub" aria-label="Allowance workspace">
    {view !== "companion" && <>
    <div className="session-bar">
      {data.active ? <><div className="session-bar__title"><strong>{data.active.name}</strong><span>Session running · {duration(now - data.active.startedAt)}</span></div>
        <button className="button button--primary" disabled={busy} onClick={() => void onSession("finish")}>{busy ? "Updating…" : "Finish session"}</button></>
        : <form onSubmit={async e => { e.preventDefault(); await onSession("start", name); setName(""); }}>
          <label htmlFor="session-name">Coding session<input id="session-name" maxLength={100} placeholder="Session name (optional)" value={name} onChange={e => setName(e.target.value)} /></label>
          <button className="button button--primary" disabled={busy || !canStart}>{busy ? "Updating…" : "Start coding"}</button>
        </form>}
    </div>
    {!canStart && !data.active && <p className="planner-note">Connect a provider with fresh usage to start a session.</p>}
    {data.active && <Receipt session={data.active} now={now} />}

    </>}
    {view === "plan" && <>
      <div className="planning-grid">
        <article className="planning-card recommendation-card"><p className="eyebrow">Suggested provider</p><h3>{recommendation.name}</h3><p>{recommendation.reason}</p><span className="planner-tag">Capacity suggestion · you choose the tool</span></article>
        <article className="planning-card budget-card"><h3>Daily budget</h3>
          <BudgetPreferences data={data} onChange={onChange} />
          {providers.map(p => { const b = budgetFor(p, data, now); return <div className="budget-provider" key={p.provider}><div><strong className={`ink-${p.provider}`}>{p.displayName}</strong><span>{b ? `${b.label} · ${b.workdays} workday${b.workdays === 1 ? "" : "s"} until reset` : "Needs a fresh daily or weekly window with a reset time"}</span></div>
            {b && <><div className="budget-numbers"><strong>{amount(b.left)} points</strong><span>{b.reserved ? "Reserve reached" : !b.todayWorking ? "Not a scheduled workday" : b.over ? "Over today's pace" : "Available in today's budget"}</span></div>
              <progress max={Math.max(b.daily, b.used, 0.1)} value={b.used} aria-label={`${p.displayName} daily budget used`} /><small>{amount(b.used)} of {amount(b.daily)} percentage points observed today</small></>}
          </div>; })}<p className="planner-note">Divides spendable allowance across remaining workdays. A planning guide, not an enforced limit.</p>
        </article>
        <article className="planning-card forecast-card"><h3>Usage forecast</h3>
          <label className="intensity-control"><span>{intensity < 0.85 ? "Light" : intensity > 1.25 ? "Heavy" : "Normal"} usage <strong>{intensity.toFixed(2).replace(/0$/, "")}×</strong></span><input type="range" min="0.5" max="2" step="0.25" value={intensity} aria-label="Usage intensity" onChange={e => setIntensity(Number(e.target.value))} /></label>
          <div className="range-labels"><span>Light · ½×</span><span>Normal</span><span>Heavy · 2×</span></div>
          <div aria-live="polite">{providers.flatMap(p => p.windows.map(w => {
            const pace = freshProvider(p, now) ? paceFor(data.series.find(s => s.key === windowKey(p.provider, w.id)), now, w.resetsAt || null) : null;
            const hours = w.resetsAt ? (w.resetsAt - now) / 3600 : null;
            const left = pace && hours !== null ? w.remainingPercent - pace.rate * intensity * hours : null;
            const low = pace && hours !== null ? Math.max(0, w.remainingPercent - pace.high * intensity * hours) : null;
            const high = pace && hours !== null ? Math.max(0, w.remainingPercent - pace.low * intensity * hours) : null;
            const warning = left !== null && left < 0;
            return <div className="scenario-row" key={windowKey(p.provider, w.id)}><div><span className={`ink-${p.provider}`}>{p.displayName} · {w.label}</span>
              <strong className={warning ? "ink-warning" : ""}>{!freshProvider(p, now) ? "Waiting for fresh usage" : hours !== null && hours <= 0 ? "Waiting for reset update" : w.remainingPercent <= 0 ? "Allowance exhausted" : !pace ? "Learning your pace" : hours === null ? "Reset time unavailable" : pace.rate === 0 ? "No recent consumption observed" : warning ? `May run out in ${duration(w.remainingPercent / (pace.rate * intensity) * 3600)}` : `About ${amount(Math.max(0, left!))}% left at reset`}</strong>
              {pace && pace.intervals >= 4 && hours !== null && hours > 0 && <small>Recent pace range: {amount(low!)}–{amount(high!)}% left at reset</small>}</div>
              </div>;
          }))}</div>
          <p className="planner-note">Learns after 15 minutes of comparable observations. Ranges reflect recent pace variation; estimates assume continuous use at the selected pace.</p>
        </article>
      </div>
      <article className="planning-card reset-card"><div className="planning-heading"><div><h3>Reset timeline</h3></div><div className="segmented" aria-label="Timeline range">{[1, 7].map(d => <button key={d} aria-pressed={timelineDays === d} className={timelineDays === d ? "active" : ""} onClick={() => setTimelineDays(d)}>{d === 1 ? "24 hours" : "7 days"}</button>)}</div></div>
        <div className="timeline-axis"><span>Now</span><span>+{timelineDays === 1 ? "12 hours" : "3.5 days"}</span><span>+{timelineDays === 1 ? "24 hours" : "7 days"}</span></div>
        {timeline.length ? timeline.map(w => <div className="timeline-row" key={windowKey(w.provider, w.id)}><div className="timeline-label"><strong className={`ink-${w.provider}`}>{names[w.provider]} · {w.label}</strong><span>{!w.resetsAt ? "Reset time unavailable" : w.resetsAt <= now ? "Awaiting reset update" : `In ${duration(w.resetsAt - now)}${!w.fresh ? " · last known" : ""}`}</span></div>
          <div className="timeline-track">{w.resetsAt && <span className={`timeline-marker ink-${w.provider}`} data-beyond={w.resetsAt - now > timelineDays * 86400} style={{ left: `${Math.max(0, Math.min(100, (w.resetsAt - now) / (timelineDays * 86400) * 100))}%` }} title={new Date(w.resetsAt * 1000).toLocaleString()}>{w.resetsAt - now > timelineDays * 86400 ? "›" : null}</span>}</div>
          <time dateTime={w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : undefined}>{w.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</time>
        </div>) : <p>Reset times will appear when a provider connects.</p>}
      </article>
    </>}
    {view === "overview" && <details className="timeline-disclosure"><summary>Reset timeline</summary>
      <article className="planning-card reset-card"><div className="planning-heading"><div><h3>Reset timeline</h3></div><div className="segmented" aria-label="Timeline range">{[1, 7].map(d => <button key={d} aria-pressed={timelineDays === d} className={timelineDays === d ? "active" : ""} onClick={() => setTimelineDays(d)}>{d === 1 ? "24 hours" : "7 days"}</button>)}</div></div>
        <div className="timeline-axis"><span>Now</span><span>+{timelineDays === 1 ? "12 hours" : "3.5 days"}</span><span>+{timelineDays === 1 ? "24 hours" : "7 days"}</span></div>
        {timeline.length ? timeline.map(w => <div className="timeline-row" key={windowKey(w.provider, w.id)}><div className="timeline-label"><strong className={`ink-${w.provider}`}>{names[w.provider]} · {w.label}</strong><span>{!w.resetsAt ? "Reset time unavailable" : w.resetsAt <= now ? "Awaiting reset update" : `In ${duration(w.resetsAt - now)}${!w.fresh ? " · last known" : ""}`}</span></div>
          <div className="timeline-track">{w.resetsAt && <span className={`timeline-marker ink-${w.provider}`} data-beyond={w.resetsAt - now > timelineDays * 86400} style={{ left: `${Math.max(0, Math.min(100, (w.resetsAt - now) / (timelineDays * 86400) * 100))}%` }} title={new Date(w.resetsAt * 1000).toLocaleString()}>{w.resetsAt - now > timelineDays * 86400 ? "›" : null}</span>}</div>
          <time dateTime={w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : undefined}>{w.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</time>
        </div>) : <p>Reset times will appear when a provider connects.</p>}
      </article>
    </details>}
    {view === "activity" && <>

      <article className="planning-card heatmap-card"><div className="planning-heading"><div><h3>Activity over 90 days</h3></div><div className="heatmap-controls"><select aria-label="Heatmap provider" value={heatProvider} onChange={e => setHeatProvider(e.target.value as ProviderId)}><option value="codex">Codex</option><option value="claude">Claude</option></select><select aria-label="Heatmap quota window" value={heatKey || ""} onChange={e => setHeatWindow(e.target.value)}>{heatWindows.length ? heatWindows.map(([key, label]) => <option key={key} value={key}>{label}</option>) : <option value="">Waiting for usage</option>}</select></div></div>
        <div className="heatmap-scroll"><div className="heatmap-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div className="heatmap-grid">{calendar.map((d, i) => d.date ? <button type="button" key={d.date} className={`heatmap-day ${selectedDay === d.date ? "selected" : ""}`} data-level={d.value === null ? "unknown" : d.value === 0 ? "0" : String(Math.max(1, Math.ceil(d.value / max * 4)))} aria-label={`${d.date}: ${d.value === null ? "no observations" : `${amount(d.value)} percentage points used`}`} aria-pressed={selectedDay === d.date} title={`${d.date} · ${d.value === null ? "No observations" : `${amount(d.value)} pp`}`} onClick={() => setSelectedDay(d.date)} /> : <span key={`blank-${i}`} />)}</div></div>
        <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(n => <i className="heatmap-day" data-level={n} key={n} />)}<span>More</span><i className="heatmap-day" data-level="unknown" /><span>No data</span></div>
        <div className="day-detail"><h4>{new Date(selectedDay + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h4><p>{selectedUsage ? `${amount(selectedUsage.used)} percentage points observed · ${names[heatProvider]} ${heatWindows.find(([key]) => key === heatKey)?.[1] || ""}` : "No window observations recorded for this day."}{day?.partial ? " Some intervals were not observed." : ""}</p>
          {daySessions.length ? daySessions.map(s => <Receipt key={s.id} session={s} now={now} />) : <p className="planner-note">No tagged sessions on this day.</p>}</div>
        <p className="planner-note">Each cell tracks one quota window. New tracking starts with this version; older percentage charts are kept below. pp means percentage points.</p>
      </article>
      <article className="planning-card"><h3>Session receipts</h3><p className="planner-note">Usage is the observed change across your account during a session, including activity in other tools. Overlapping quota windows are listed separately.</p>
        {data.sessions.length ? [...data.sessions].reverse().slice(0, 20).map(s => <Receipt session={s} key={s.id} now={now} />) : <p>Start your first coding session to build a history of your workflows.</p>}
      </article>
    </>}
    {view === "companion" && <CompanionCustomizer data={data} remaining={minimum.length ? Math.min(...minimum) : null} now={now} overlayEnabled={overlayEnabled} onChange={onChange} onOverlay={onOverlay} />}
  </section>;
}
export const PlanningHub = memo(PlanningHubView);
