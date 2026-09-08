import type { ProviderState } from "./types";
import { freshProvider, paceFor, windowKey, duration, type InsightData } from "./insights";

export type Forecast = {
  rate: number | null;
  hoursToEmpty: number | null;
  message: string;
};

export function formatReset(reset?: number | null, now = Date.now()): string {
  if (!reset) return "Reset time unavailable";
  let seconds = Math.max(0, Math.floor(reset - now / 1_000));
  if (seconds === 0) return "Resetting now";
  const days = Math.floor(seconds / 86_400);
  seconds -= days * 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds -= hours * 3_600;
  const minutes = Math.floor(seconds / 60);
  if (days) return "Resets in " + days + "d " + hours + "h";
  if (hours) return "Resets in " + hours + "h " + minutes + "m";
  return "Resets in " + Math.max(1, minutes) + "m";
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp || timestamp * 1000 > now + 60_000) return "time unknown";
  const seconds = Math.max(0, Math.floor(now / 1_000 - timestamp));
  if (seconds < 10) return "just now";
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3_600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86_400) return Math.floor(seconds / 3_600) + "h ago";
  return Math.floor(seconds / 86_400) + "d ago";
}

export function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    "codex-app-server": "Codex account",
    "codex-session-fallback": "Local session snapshot",
    "claude-status-line": "Claude Code session",
    "browser-preview": "Preview data",
    none: "Not connected",
  };
  return labels[source] || source;
}

export function forecastFor(
  insights: InsightData,
  provider: ProviderState,
): Forecast {
  const now = Date.now() / 1000;
  const waiting = { rate: null, hoursToEmpty: null, message: "Learning each window's pace from fresh local observations." };
  if (!freshProvider(provider, now)) return { ...waiting, message: "Waiting for fresh usage to estimate your pace." };
  const windows = provider.windows.map(w => ({ w,
    pace: paceFor(insights.series.find(s => s.key === windowKey(provider.provider, w.id)), now, w.resetsAt || null),
  }));
  const risk = windows.filter(({ w, pace }) => pace && pace.rate > 0 && (!w.resetsAt || w.resetsAt > now) &&
    (!w.resetsAt || w.remainingPercent / pace.rate < (w.resetsAt - now) / 3600))
    .sort((a, b) => a.w.remainingPercent / a.pace!.rate - b.w.remainingPercent / b.pace!.rate)[0];
  if (risk) {
    const hoursToEmpty = risk.w.remainingPercent / risk.pace!.rate;
    return { rate: risk.pace!.rate, hoursToEmpty, message: `${risk.w.label} may run out in ${duration(hoursToEmpty * 3600)} at your recent pace.` };
  }
  if (windows.length && windows.every(({ w, pace }) => pace && w.resetsAt && w.resetsAt > now)) {
    return { ...waiting, message: "At your recent pace, each tracked window should last until its reset." };
  }
  return waiting;
}
