import { csvEscape } from "../csv";
import type { DashboardState, HistoryPoint, ProviderState } from "../types";
import { freshProvider } from "../insights";
import { type AllowanceData } from "./schema";

export const MAX_HISTORY_SECONDS = 90 * 24 * 60 * 60;

export function lowestRemaining(provider: ProviderState, now = Date.now() / 1000): number | undefined {
  if (!freshProvider(provider, now)) return undefined;
  return Math.min(
    ...provider.windows.map((usageWindow) => usageWindow.remainingPercent),
  );
}

export function recordHistory(
  state: DashboardState,
  history: HistoryPoint[],
): HistoryPoint[] {
  const current: HistoryPoint = { at: state.refreshedAt };
  for (const provider of state.providers) {
    const remaining = lowestRemaining(provider, state.refreshedAt);
    if (remaining !== undefined) current[provider.provider] = remaining;
  }
  const recent = history.filter(
    (point) => point.at > state.refreshedAt - MAX_HISTORY_SECONDS,
  );
  const previous = recent.at(-1);
  const changed =
    !previous ||
    Math.abs((previous.codex ?? -1) - (current.codex ?? -1)) >= 0.5 ||
    Math.abs((previous.claude ?? -1) - (current.claude ?? -1)) >= 0.5;
  if (!previous || current.at - previous.at >= 5 * 60 || changed) {
    recent.push(current);
  }
  return recent.slice(-26_000);
}

export function historyStats(history: HistoryPoint[]) {
  const values = history.flatMap((point) =>
    [point.codex, point.claude].filter(
      (value): value is number => typeof value === "number",
    ),
  );
  const drops = new Map<number, number>();
  for (let index = 1; index < history.length; index += 1) {
    for (const provider of ["codex", "claude"] as const) {
      const before = history[index - 1][provider];
      const after = history[index][provider];
      if (
        before === undefined ||
        after === undefined ||
        before <= after ||
        before - after > 35
      ) {
        continue;
      }
      const hour = new Date(history[index].at * 1_000).getHours();
      drops.set(hour, (drops.get(hour) || 0) + before - after);
    }
  }
  const peak = [...drops.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  return {
    lowest: values.length ? Math.round(Math.min(...values)) : null,
    points: history.length,
    peakHour:
      peak === undefined
        ? "Learning"
        : new Date(2020, 0, 1, peak[0]).toLocaleTimeString([], {
            hour: "numeric",
          }),
  };
}

export function historyCsv(data: AllowanceData): string {
  const rows = [
    ["profile", "timestamp", "local_time", "codex_remaining", "claude_remaining"],
  ];
  for (const profile of data.profiles) {
    for (const point of profile.history) {
      rows.push([
        profile.name,
        String(point.at),
        new Date(point.at * 1_000).toISOString(),
        point.codex === undefined ? "" : String(point.codex),
        point.claude === undefined ? "" : String(point.claude),
      ]);
    }
  }
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
