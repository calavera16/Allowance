import { DATA_KEY, LEGACY_HISTORY_KEY, LEGACY_THRESHOLD_KEY, type AllowanceData, newProfile, normalizeData, normalizeProfile } from "./schema";

export const PREVIOUS_KEY = "allowance.data.v2.previous";
export const RECOVERY_KEY = "allowance.data.v2.recovery";
const MAX_CHARACTERS = 900_000;
type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type StorageState = { data: AllowanceData; issue: string | null; blocked: boolean; recovery: boolean };
function emptyData(): AllowanceData {
  const profile = newProfile("Default");
  return { schemaVersion: 2, setupComplete: false, activeProfileId: profile.id, profiles: [profile] };
}
export function loadStoredData(storage: Reader): StorageState {
  let raw: string | null;
  try { raw = storage.getItem(DATA_KEY); }
  catch { return { data: emptyData(), issue: "Local storage is unavailable. Changes cannot be saved; export a backup before closing.", blocked: true, recovery: false }; }
  if (raw !== null) {
    try { return { data: normalizeData(JSON.parse(raw)), issue: null, blocked: false, recovery: false }; }
    catch {
      let previous: AllowanceData | null = null;
      try { const backup = storage.getItem(PREVIOUS_KEY); if (backup) previous = normalizeData(JSON.parse(backup)); } catch { /* Keep the damaged primary untouched. */ }
      return { data: previous || emptyData(), blocked: true, recovery: Boolean(previous),
        issue: previous ? "Saved data needs repair. A recovery copy is available. Export the original or use the recovery copy to resume saving."
          : "Saved data could not be read. The original is untouched. Export it for recovery or restore a valid backup." };
    }
  }
  const initial = emptyData();
  try {
    const history = JSON.parse(storage.getItem(LEGACY_HISTORY_KEY) || "[]");
    const threshold = Number(storage.getItem(LEGACY_THRESHOLD_KEY) || 80);
    initial.profiles[0] = normalizeProfile({ ...initial.profiles[0], history,
      settings: { ...initial.profiles[0].settings, thresholds: [70, 80, 90].includes(threshold) ? [threshold] : [80] } }, 0);
    return { data: initial, issue: null, blocked: false, recovery: false };
  } catch { return { data: initial, issue: "Older history could not be read. The legacy copy has been preserved.", blocked: false, recovery: false }; }
}
// Read-only entry point for the compact window. Only DashboardApp persists data.
export function loadData(): AllowanceData { return loadStoredData(localStorage).data; }
function trimOldest(data: AllowanceData): AllowanceData {
  let changed = false;
  const profiles = data.profiles.map(profile => {
    const history = profile.history.length > 2 ? profile.history.slice(Math.max(1, Math.floor(profile.history.length / 4))) : profile.history;
    const series = profile.insights.series.map(series => ({ ...series,
      points: series.points.length > 2 ? series.points.slice(Math.max(1, Math.floor(series.points.length / 4))) : series.points }));
    if (history !== profile.history || series.some((series, index) => series.points !== profile.insights.series[index].points)) changed = true;
    return { ...profile, history, insights: { ...profile.insights, series } };
  });
  if (changed) return { ...data, profiles };
  if (data.profiles.some(profile => profile.insights.sessions.length > 1 || profile.insights.days.length > 1)) {
    return { ...data, profiles: data.profiles.map(profile => ({ ...profile, insights: { ...profile.insights,
      sessions: profile.insights.sessions.length > 1 ? profile.insights.sessions.slice(Math.max(1, Math.floor(profile.insights.sessions.length / 4))) : profile.insights.sessions,
      days: profile.insights.days.length > 1 ? profile.insights.days.slice(Math.max(1, Math.floor(profile.insights.days.length / 4))) : profile.insights.days,
    } })) };
  }
  return data;
}
export function compactStoredData(data: AllowanceData, maxCharacters = MAX_CHARACTERS): { data: AllowanceData; trimmed: boolean } {
  let next = data;
  for (let attempt = 0; attempt < 40 && JSON.stringify(next).length > maxCharacters; attempt++) {
    const smaller = trimOldest(next); if (smaller === next) break; next = smaller;
  }
  return { data: next, trimmed: next !== data };
}
function quotaError(error: unknown): boolean { return error instanceof Error && ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error.name); }
export function persistData(storage: Writer, data: AllowanceData): { data: AllowanceData; saved: boolean; issue: string | null } {
  let next = compactStoredData(data).data;
  let previous: string | null = null;
  try { previous = storage.getItem(DATA_KEY); } catch { /* Report errors on the write below. */ }
  for (let attempt = 0; attempt < 12; attempt++) {
    const serialized = JSON.stringify(next);
    try {
      if (serialized !== previous) {
        storage.setItem(DATA_KEY, serialized);
        if (previous) {
          try { const valid = normalizeData(JSON.parse(previous)); storage.setItem(PREVIOUS_KEY, JSON.stringify(compactStoredData(valid).data)); }
          catch { /* A checkpoint failure does not undo the successfully saved primary. */ }
        }
      }
      return { data: next, saved: true, issue: next !== data ? "Older observations were trimmed to keep all profiles within local storage capacity. Settings and active sessions were preserved." : null };
    } catch (error) {
      if (!quotaError(error)) return { data: next, saved: false, issue: "Local storage could not be written. Changes are only in memory; export a backup before closing." };
      // The primary remains intact if writing fails. Only our replaceable checkpoint is removed.
      try { storage.removeItem(PREVIOUS_KEY); } catch { /* Report a storage error below. */ }
      const smaller = trimOldest(next);
      if (smaller === next && attempt > 0) break;
      next = smaller;
    }
  }
  return { data, saved: false, issue: "Local storage is full. Changes are only in memory; export a backup before closing. Existing saved profiles are intact." };
}
export function recoverStoredData(storage: Writer): AllowanceData {
  const backup = storage.getItem(PREVIOUS_KEY);
  if (!backup) throw new Error("No recovery copy is available. Restore an exported backup instead.");
  const recovered = normalizeData(JSON.parse(backup));
  const original = storage.getItem(DATA_KEY);
  if (original !== null) storage.setItem(RECOVERY_KEY, original);
  storage.setItem(DATA_KEY, JSON.stringify(recovered));
  return recovered;
}
