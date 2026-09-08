import type { CustomCompanion, DashboardState, ProviderState } from "./types";

export type ProviderId = "codex" | "claude";
export type CompanionKind = "none" | "cat" | "robot" | "plant" | "custom";
export type Sample = [at: number, remaining: number, reset: number | null];
export type WindowSeries = {
  key: string; provider: ProviderId; label: string; minutes: number;
  points: Sample[];
};
export type SessionUsage = { key: string; provider: ProviderId; label: string; used: number; reset?: number | null; cycleUsed?: number };
export type CodingSession = {
  id: string; name: string; startedAt: number; endedAt: number | null;
  usage: SessionUsage[]; partial: boolean;
};
export type DayUsage = { date: string; usage: SessionUsage[]; partial: boolean };
export type InsightData = {
  workingDays: number[]; reserve: number; companion: CompanionKind;
  customCompanion: CustomCompanion | null; companionSize: number; companionAnimated: boolean;
  series: WindowSeries[]; days: DayUsage[]; sessions: CodingSession[];
  active: CodingSession | null; lastResetAt: number;
};
export const freshInsights = (): InsightData => ({
  workingDays: [1, 2, 3, 4, 5], reserve: 10, companion: "none",
  customCompanion: null, companionSize: 64, companionAnimated: true,
  series: [], days: [], sessions: [], active: null, lastResetAt: 0,
});
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const percent = (n: unknown): n is number => finite(n) && n >= 0 && n <= 100;
const providerId = (s: unknown): s is ProviderId => s === "codex" || s === "claude";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown, fallback = ""): string => typeof v === "string" ? v.slice(0, 100) : fallback;

export function normalizeInsights(value: unknown, now = Date.now() / 1000): InsightData {
  const v = obj(value);
  const usage = (value: unknown): SessionUsage[] => list(value).slice(0, 16).flatMap(item => {
    const u = obj(item);
    return providerId(u.provider) && typeof u.key === "string" && finite(u.used) && u.used >= 0
      ? [{ key: str(u.key), provider: u.provider, label: str(u.label), used: Math.min(u.used, 100_000),
        reset: finite(u.reset) ? u.reset : null, cycleUsed: finite(u.cycleUsed) && u.cycleUsed >= 0 ? Math.min(u.cycleUsed, 100_000) : 0 }] : [];
  });
  const session = (value: unknown): CodingSession | null => {
    const s = obj(value);
    if (!finite(s.startedAt) || s.startedAt <= 0 || s.startedAt > now + 60) return null;
    if (s.endedAt !== null && (!finite(s.endedAt) || s.endedAt < s.startedAt || s.endedAt > now + 60)) return null;
    return { id: str(s.id, String(s.startedAt)), name: str(s.name, "Coding session"), startedAt: s.startedAt,
      endedAt: s.endedAt as number | null, usage: usage(s.usage), partial: Boolean(s.partial) };
  };
  const days = [...new Set(list(v.workingDays).filter((n): n is number => finite(n) && Number.isInteger(n) && n >= 0 && n <= 6))];
  const custom = obj(v.customCompanion);
  const customCompanion: CustomCompanion | null = typeof custom.id === "string" && /^[a-f0-9]{64}$/.test(custom.id)
    ? { id: custom.id, name: str(custom.name, "Custom GIF"), width: finite(custom.width) ? Math.max(1, Math.min(2048, custom.width)) : 1,
      height: finite(custom.height) ? Math.max(1, Math.min(2048, custom.height)) : 1, bytes: finite(custom.bytes) ? Math.max(0, Math.min(20 * 1024 * 1024, custom.bytes)) : 0 } : null;
  return {
    workingDays: days.length ? days : [1, 2, 3, 4, 5],
    reserve: finite(v.reserve) ? Math.max(0, Math.min(50, v.reserve)) : 10,
    companion: v.companion === "cat" || v.companion === "robot" || v.companion === "plant" || v.companion === "custom" ? v.companion : "none",
    customCompanion,
    companionSize: finite(v.companionSize) ? Math.max(40, Math.min(96, v.companionSize)) : 64,
    companionAnimated: v.companionAnimated !== false,
    series: list(v.series).slice(0, 16).flatMap(item => {
      const s = obj(item);
      if (!providerId(s.provider) || typeof s.key !== "string") return [];
      const points = list(s.points).filter((p): p is Sample => Array.isArray(p) && finite(p[0]) &&
        p[0] >= now - 172800 && p[0] <= now + 60 && percent(p[1]) && (p[2] === null || (finite(p[2]) && p[2] > 0)))
        .sort((a, b) => a[0] - b[0]).filter((p, i, all) => !i || p[0] !== all[i - 1][0]).slice(-600);
      return [{ key: str(s.key), provider: s.provider, label: str(s.label), minutes: finite(s.minutes) ? Math.max(0, s.minutes) : 0, points }];
    }),
    days: list(v.days).slice(-90).flatMap(item => {
      const d = obj(item);
      return typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
        ? [{ date: d.date, usage: usage(d.usage), partial: Boolean(d.partial) }] : [];
    }),
    sessions: list(v.sessions).slice(-300).map(session).filter((s): s is CodingSession => Boolean(s?.endedAt)),
    active: session(v.active)?.endedAt === null ? session(v.active) : null,
    lastResetAt: finite(v.lastResetAt) && v.lastResetAt <= now ? v.lastResetAt : 0,
  };
}

export function dateKey(at: number): string {
  const d = new Date(at * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const windowKey = (provider: string, id: string): string => `${provider}:${id}`;
export function freshProvider(provider: ProviderState, now: number): boolean {
  return !provider.stale && ["connected", "fallback"].includes(provider.status) &&
    Number.isFinite(provider.observedAt) && provider.observedAt > 0 &&
    provider.observedAt <= now + 60 && now - provider.observedAt <= 900 && provider.windows.length > 0 &&
    provider.windows.every(w => Number.isFinite(w.remainingPercent) &&
      (!w.resetsAt || w.resetsAt > now));
}

export function usageSummary(providers: ProviderState[], now: number) {
  const windows = providers.filter(provider => freshProvider(provider, now))
    .flatMap(provider => provider.windows.map(window => ({ ...window, provider: provider.displayName })))
    .sort((a, b) => a.remainingPercent - b.remainingPercent);
  const tightest = windows[0];
  return {
    remaining: tightest ? Math.round(tightest.remainingPercent) : null,
    nextReset: tightest?.resetsAt ?? null,
    label: tightest ? `${tightest.provider} ${tightest.label}` : null,
  };
}
function addUsage(usage: SessionUsage[], series: WindowSeries, used: number, reset: number | null): SessionUsage[] {
  const found = usage.find(u => u.key === series.key);
  return found ? usage.map(u => u.key === series.key ? { ...u, used: u.used + used, reset,
    cycleUsed: (u.reset === reset ? u.cycleUsed || 0 : 0) + used } : u)
    : [...usage, { key: series.key, provider: series.provider, label: series.label, used, reset, cycleUsed: used }];
}

// Compare observations from the SAME window and cycle. Missing intervals are never invented.
export function recordInsights(data: InsightData, state: DashboardState): InsightData {
  const now = state.refreshedAt;
  const result: InsightData = { ...data, series: [...data.series], days: [...data.days], active: data.active ? { ...data.active } : null };
  const today = dateKey(now);
  let day = result.days.find(d => d.date === today) || { date: today, usage: [], partial: false };
  for (const provider of state.providers) {
    if (!freshProvider(provider, now)) {
      if (result.active && (provider.windows.length || result.active.usage.some(u => u.provider === provider.provider))) result.active.partial = true;
      continue;
    }
    for (const w of provider.windows.slice(0, 8)) {
      if (!percent(w.remainingPercent)) continue;
      const key = windowKey(provider.provider, w.id);
      const index = result.series.findIndex(s => s.key === key);
      const old = result.series[index];
      const series: WindowSeries = { key, provider: provider.provider, label: w.label, minutes: w.windowMinutes || 0, points: [...(old?.points || [])] };
      const before = series.points.at(-1);
      const at = provider.observedAt;
      if (before && at <= before[0]) continue;
      const reset = w.resetsAt || null;
      const sameCycle = before && reset === before[2] && (!before[2] || at < before[2]);
      const gap = before ? at - before[0] : 0;
      const valid = Boolean(before && sameCycle && gap <= 900 && w.remainingPercent <= before[1]);
      if (before && !valid) {
        day = { ...day, partial: true };
        if (result.active) result.active.partial = true;
        if (reset !== before[2] && w.remainingPercent > before[1]) result.lastResetAt = now;
      }
      if (valid && before) {
        const delta = before[1] - w.remainingPercent;
        // Attribute intervals to their observation day; midnight crossings are marked partial.
        if (dateKey(before[0]) === dateKey(at) && dateKey(at) === today) day = { ...day, usage: addUsage(day.usage, series, delta, reset) };
        else day = { ...day, partial: true };
        if (result.active && before[0] >= result.active.startedAt) {
          result.active.usage = addUsage(result.active.usage, series, delta, reset);
        } else if (result.active && at > result.active.startedAt) result.active.partial = true;
      }
      series.points.push([at, w.remainingPercent, reset]);
      series.points = series.points.filter(p => p[0] >= now - 172800).slice(-600);
      if (index < 0) result.series.push(series); else result.series[index] = series;
    }
  }
  result.series = result.series.filter(s => (s.points.at(-1)?.[0] || 0) >= now - 172800).slice(-16);
  result.days = [...result.days.filter(d => d.date !== today), day].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
  return result;
}

export function startSession(data: InsightData, state: DashboardState, name: string): InsightData {
  if (data.active) return data;
  const next = recordInsights(data, state);
  return { ...next, active: { id: crypto.randomUUID(), name: name.trim().slice(0, 100) || "Coding session",
    startedAt: state.refreshedAt, endedAt: null, usage: [], partial: false } };
}
export function finishSession(data: InsightData, state: DashboardState): InsightData {
  const next = recordInsights(data, state);
  if (!next.active) return next;
  return { ...next, sessions: [...next.sessions, { ...next.active, endedAt: Math.max(next.active.startedAt, state.refreshedAt) }].slice(-300), active: null };
}

export type Pace = { rate: number; low: number; high: number; intervals: number };
export function paceFor(series: WindowSeries | undefined, now: number, reset: number | null): Pace | null {
  if (!series) return null;
  const points = series.points.filter(p => p[0] >= now - 43200 && p[2] === reset);
  const rates: number[] = [];
  let totalUsed = 0, totalSeconds = 0, chunkUsed = 0, chunkSeconds = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seconds = b[0] - a[0], used = a[1] - b[1];
    if (seconds <= 0 || seconds > 900 || used < 0 || (reset && b[0] >= reset)) {
      chunkUsed = 0; chunkSeconds = 0; continue;
    }
    totalUsed += used; totalSeconds += seconds; chunkUsed += used; chunkSeconds += seconds;
    if (chunkSeconds >= 900) { rates.push(chunkUsed * 3600 / chunkSeconds); chunkUsed = 0; chunkSeconds = 0; }
  }
  if (totalSeconds < 900 || !points.length || now - points.at(-1)![0] > 900) return null;
  const rate = totalUsed * 3600 / totalSeconds;
  rates.sort((a, b) => a - b);
  return { rate, low: rates.length >= 4 ? Math.min(rate, rates[Math.floor((rates.length - 1) * 0.2)]) : rate,
    high: rates.length >= 4 ? Math.max(rate, rates[Math.ceil((rates.length - 1) * 0.8)]) : rate, intervals: rates.length };
}

export function recommendProvider(providers: ProviderState[], data: InsightData, now: number): { name: string; reason: string } {
  const candidates = providers.filter(p => freshProvider(p, now) && p.windows.every(w => !w.resetsAt || w.resetsAt > now)).map(p => {
    const headroom = Math.min(...p.windows.map(w => w.remainingPercent));
    const risks = p.windows.map(w => {
      const pace = paceFor(data.series.find(s => s.key === windowKey(p.provider, w.id)), now, w.resetsAt || null);
      return pace && w.resetsAt && pace.rate > 0 ? Math.min(1, w.remainingPercent / (pace.rate * (w.resetsAt - now) / 3600)) : null;
    });
    return { provider: p, headroom, safety: Math.min(1, ...risks.filter((r): r is number => r !== null)), learned: risks.some(r => r !== null) };
  }).filter(c => c.headroom > 0).sort((a, b) => b.safety - a.safety || b.headroom - a.headroom);
  const best = candidates[0];
  if (!best) return { name: "Waiting for headroom", reason: "Connect a provider with fresh, available allowance to get a suggestion." };
  const nextReset = Math.min(...best.provider.windows.map(w => w.resetsAt || Infinity));
  const resetText = Number.isFinite(nextReset) ? ` Next reset in ${duration(nextReset - now)}.` : "";
  return { name: `Use ${best.provider.displayName}`, reason: `${Math.round(best.headroom)}% remains in its tightest window. ${best.learned ? "Recent pace and time to each reset inform this suggestion." : "Based on available headroom while your usage pace is still learning."}${resetText}` };
}

export function budgetFor(provider: ProviderState, data: InsightData, now: number) {
  if (!freshProvider(provider, now)) return null;
  const w = [...provider.windows].filter(w => w.resetsAt && w.resetsAt > now && w.windowMinutes && w.windowMinutes >= 1440)
    .sort((a, b) => (b.windowMinutes || 0) - (a.windowMinutes || 0))[0];
  if (!w?.resetsAt) return null;
  const today = data.days.find(d => d.date === dateKey(now))?.usage.find(u => u.key === windowKey(provider.provider, w.id));
  const used = today?.reset === w.resetsAt ? today.cycleUsed || 0 : 0;
  const date = new Date(now * 1000); date.setHours(0, 0, 0, 0);
  const todayWorking = data.workingDays.includes(date.getDay());
  let workdays = 0;
  for (let i = 0; i < 370 && date.getTime() < w.resetsAt * 1000; i++) {
    if (data.workingDays.includes(date.getDay())) workdays++;
    date.setDate(date.getDate() + 1);
  }
  const daily = Math.max(0, w.remainingPercent + used - data.reserve) / Math.max(1, workdays);
  return { label: w.label, used, daily, left: Math.max(0, daily - used), workdays, todayWorking, over: used > daily, reserved: w.remainingPercent <= data.reserve };
}
export function duration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return minutes ? `${minutes}m` : "<1m";
}
