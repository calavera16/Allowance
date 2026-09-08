import type { DashboardState } from "../types";
import { freshProvider } from "../insights";
import { type QuietHours, type Profile } from "./schema";
import { lowestRemaining } from "./history";

export function isQuietTime(quiet: QuietHours, date = new Date()): boolean {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  const hour = date.getHours();
  return quiet.start < quiet.end
    ? hour >= quiet.start && hour < quiet.end
    : hour >= quiet.start || hour < quiet.end;
}

export async function evaluateAlerts(
  state: DashboardState,
  profile: Profile,
  notify?: (title: string, body: string) => Promise<void>,
  date = new Date(),
): Promise<Record<string, boolean>> {
  const settings = profile.settings;
  const notified = { ...profile.notified };
  if (
    !notify ||
    !settings.notificationsEnabled ||
    isQuietTime(settings.quietHours, date)
  ) {
    return notified;
  }
  const send = async (key: string, title: string, body: string) => {
    if (notified[key]) return;
    await notify?.(title, body);
    notified[key] = true;
  };
  const now = state.refreshedAt;
  for (const provider of state.providers) {
    if (!freshProvider(provider, now)) continue;
    for (const usageWindow of provider.windows) {
      for (const threshold of settings.thresholds) {
        if (usageWindow.usedPercent < threshold) continue;
        const key = [
          "threshold",
          profile.id,
          provider.provider,
          usageWindow.id,
          usageWindow.resetsAt || "none",
          threshold,
        ].join(":");
        await send(
          key,
          provider.displayName + " allowance is running low",
          usageWindow.label +
            " has " +
            Math.round(usageWindow.remainingPercent) +
            "% remaining.",
        );
      }
      if (
        settings.resetReminderMinutes > 0 &&
        usageWindow.resetsAt &&
        usageWindow.resetsAt > now &&
        usageWindow.resetsAt - now <= settings.resetReminderMinutes * 60
      ) {
        const key = [
          "reset",
          profile.id,
          provider.provider,
          usageWindow.id,
          usageWindow.resetsAt,
          settings.resetReminderMinutes,
        ].join(":");
        await send(
          key,
          provider.displayName + " allowance resets soon",
          usageWindow.label +
            " resets within " +
            settings.resetReminderMinutes +
            " minutes.",
        );
      }
    }
  }
  if (settings.spikeAlerts) {
    const previous = profile.history.at(-1);
    if (previous && now - previous.at <= 15 * 60) {
      for (const provider of state.providers) {
        if (!freshProvider(provider, now)) continue;
        const before = previous[provider.provider];
        const current = lowestRemaining(provider, now);
        if (
          before !== undefined &&
          current !== undefined &&
          before - current >= 15
        ) {
          const key = [
            "spike",
            profile.id,
            provider.provider,
            Math.floor(now / 900),
          ].join(":");
          await send(
            key,
            provider.displayName + " usage increased quickly",
            Math.round(before - current) +
              "% of the tightest allowance was used in under 15 minutes.",
          );
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(notified).slice(-500));
}
