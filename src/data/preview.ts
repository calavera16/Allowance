import type { DashboardState } from "../types";

export const previewStartedAt = Math.floor(Date.now() / 1_000);

export function previewState(): DashboardState {
  const now = Math.floor(Date.now() / 1_000);
  return {
    refreshedAt: now,
    claudeHookInstalled: false,
    claudeHookCommand: null,
    providers: [
      {
        provider: "codex",
        displayName: "Codex",
        status: "connected",
        source: "browser-preview",
        plan: "pro",
        version: null,
        observedAt: now,
        stale: false,
        windows: [
          {
            id: "preview-codex-five",
            label: "5-hour",
            usedPercent: 32,
            remainingPercent: 68,
            resetsAt: previewStartedAt + 7_820,
            windowMinutes: 300,
          },
          {
            id: "preview-codex-week",
            label: "7-day",
            usedPercent: 57,
            remainingPercent: 43,
            resetsAt: previewStartedAt + 311_200,
            windowMinutes: 10_080,
          },
        ],
        credits: { balance: 350, hasCredits: true, unlimited: false },
      },
      {
        provider: "claude",
        displayName: "Claude",
        status: "connected",
        source: "browser-preview",
        plan: null,
        version: "2.1.x",
        observedAt: now,
        stale: false,
        windows: [
          {
            id: "preview-claude-five",
            label: "5-hour",
            usedPercent: 18,
            remainingPercent: 82,
            resetsAt: previewStartedAt + 11_540,
            windowMinutes: 300,
          },
          {
            id: "preview-claude-week",
            label: "7-day",
            usedPercent: 66,
            remainingPercent: 34,
            resetsAt: previewStartedAt + 422_000,
            windowMinutes: 10_080,
          },
        ],
        credits: null,
      },
    ],
  };
}
