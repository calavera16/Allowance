import type { HistoryPoint } from "../types";
import { freshInsights, normalizeInsights, type InsightData } from "../insights";

export const DATA_KEY = "allowance.data.v2";

export const LEGACY_HISTORY_KEY = "allowance.history.v1";

export const LEGACY_THRESHOLD_KEY = "allowance.notification-threshold";

export type QuietHours = {
  enabled: boolean;
  start: number;
  end: number;
};

export type ProfileSettings = {
  notificationsEnabled: boolean;
  thresholds: number[];
  resetReminderMinutes: number;
  spikeAlerts: boolean;
  quietHours: QuietHours;
  refreshSeconds: number;
  historyDays: 7 | 30 | 90;
  highContrast: boolean;
  overlayEnabled: boolean;
};

export type Profile = {
  id: string;
  name: string;
  createdAt: number;
  settings: ProfileSettings;
  history: HistoryPoint[];
  insights: InsightData;
  notified: Record<string, boolean>;
};

export type AllowanceData = {
  schemaVersion: 2;
  setupComplete: boolean;
  activeProfileId: string;
  profiles: Profile[];
};

export const defaultSettings: ProfileSettings = {
  notificationsEnabled: true,
  thresholds: [80, 90],
  resetReminderMinutes: 10,
  spikeAlerts: true,
  quietHours: { enabled: false, start: 22, end: 8 },
  refreshSeconds: 30,
  historyDays: 7,
  highContrast: false,
  overlayEnabled: false,
};

export function newProfile(name: string): Profile {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "profile-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  return {
    id,
    name,
    createdAt: Math.floor(Date.now() / 1_000),
    settings: {
      ...defaultSettings,
      quietHours: { ...defaultSettings.quietHours },
      thresholds: [...defaultSettings.thresholds],
    },
    history: [],
    insights: freshInsights(),
    notified: {},
  };
}

export function normalizeProfile(value: unknown, index: number): Profile {
  const candidate = value && typeof value === "object" ? (value as Partial<Profile>) : {};
  const base = newProfile(
    typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim().slice(0, 40)
      : "Profile " + (index + 1),
  );
  const settings =
    candidate.settings && typeof candidate.settings === "object"
      ? candidate.settings
      : ({} as Partial<ProfileSettings>);
  const history: HistoryPoint[] = Array.isArray(candidate.history)
    ? candidate.history.filter(point => point && Number.isFinite(point.at) && point.at > 0)
      .map(point => ({ at: point.at,
        ...(Number.isFinite(point.codex) ? { codex: Math.max(0, Math.min(100, point.codex!)) } : {}),
        ...(Number.isFinite(point.claude) ? { claude: Math.max(0, Math.min(100, point.claude!)) } : {}),
      })).filter(point => point.codex !== undefined || point.claude !== undefined).sort((a, b) => a.at - b.at).slice(-26_000)
    : [];
  const historyDays =
    settings.historyDays === 30 || settings.historyDays === 90
      ? settings.historyDays
      : 7;
  return {
    ...base,
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id.slice(0, 100)
        : base.id,
    createdAt:
      Number.isFinite(candidate.createdAt) && typeof candidate.createdAt === "number"
        ? candidate.createdAt
        : base.createdAt,
    settings: {
      notificationsEnabled:
        settings.notificationsEnabled !== false,
      thresholds: Array.isArray(settings.thresholds)
        ? settings.thresholds
            .filter((item) => [70, 80, 90].includes(Number(item)))
            .map(Number)
        : [...defaultSettings.thresholds],
      resetReminderMinutes: [0, 10, 30, 60].includes(
        Number(settings.resetReminderMinutes),
      )
        ? Number(settings.resetReminderMinutes)
        : 10,
      spikeAlerts: settings.spikeAlerts !== false,
      quietHours: {
        enabled: Boolean(settings.quietHours?.enabled),
        start: Math.max(
          0,
          Math.min(23, Number.isFinite(settings.quietHours?.start) ? settings.quietHours!.start : 22),
        ),
        end: Math.max(
          0,
          Math.min(23, Number.isFinite(settings.quietHours?.end) ? settings.quietHours!.end : 8),
        ),
      },
      refreshSeconds: [15, 30, 60, 120].includes(
        Number(settings.refreshSeconds),
      )
        ? Number(settings.refreshSeconds)
        : 30,
      historyDays,
      highContrast: Boolean(settings.highContrast),
      overlayEnabled: Boolean(settings.overlayEnabled),
    },
    history,
    insights: normalizeInsights(candidate.insights),
    notified:
      candidate.notified &&
      typeof candidate.notified === "object" &&
      !Array.isArray(candidate.notified)
        ? Object.fromEntries(Object.entries(candidate.notified).filter(([key, value]) => key.length <= 250 && value === true).slice(-500))
        : {},
  };
}

export function normalizeData(value: unknown): AllowanceData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Saved profiles are not a valid Allowance data object.");
  const input = value as Partial<AllowanceData>;
  if (input.schemaVersion !== 2 || !Array.isArray(input.profiles) || !input.profiles.length || input.profiles.length > 20 ||
      input.profiles.some(profile => !profile || typeof profile !== "object" || Array.isArray(profile) || typeof profile.id !== "string" || !profile.id || profile.id.length > 100)) {
    throw new Error("Saved profiles are incomplete or use an unsupported version.");
  }
  if (new Set(input.profiles.map(profile => profile.id)).size !== input.profiles.length) throw new Error("Saved profiles contain duplicate identifiers.");
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<AllowanceData>)
      : {};
  const profiles = Array.isArray(candidate.profiles)
    ? candidate.profiles.slice(0, 20).map(normalizeProfile)
    : [];
  if (!profiles.length) profiles.push(newProfile("Default"));
  const activeProfileId = profiles.some(
    (profile) => profile.id === candidate.activeProfileId,
  )
    ? String(candidate.activeProfileId)
    : profiles[0].id;
  return {
    schemaVersion: 2,
    setupComplete: Boolean(candidate.setupComplete),
    activeProfileId,
    profiles,
  };
}
