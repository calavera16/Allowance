import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardState, DiagnosticsState, OverlayPreferences, UpdateState } from "./types";
import { PlanningHub } from "./PlanningHub";
import { BrandMark, CloseIcon, SettingsIcon } from "./BrandMark";
import { exportCompanionGifs, restoreCompanionGifs } from "./companion-assets";
import { recordInsights, startSession, finishSession, freshProvider, usageSummary, type InsightData } from "./insights";
import { DATA_KEY, type ProfileSettings, type Profile, type AllowanceData, newProfile, normalizeData } from "./data/schema";
import { loadStoredData, persistData, recoverStoredData } from "./data/storage";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { previewState } from "./data/preview";
import { lowestRemaining, recordHistory, historyCsv } from "./data/history";
import { evaluateAlerts } from "./data/alerts";
import { type Forecast, formatReset, relativeTime, forecastFor } from "./format";
import { ProviderCard } from "./components/ProviderCard";
import { UsageHistory } from "./components/UsageHistory";
import { InfoIcon, LockIcon, RefreshIcon } from "./components/icons";
import { SetupWizard } from "./SetupWizard";
import { SettingsModal } from "./SettingsModal";
import { IS_DESKTOP } from "./runtime";

export function DashboardApp() {
  const [initialStorage] = useState(() => loadStoredData(localStorage));
  const [data, setData] = useState<AllowanceData>(initialStorage.data);
  const [storageBlocked, setStorageBlocked] = useState(initialStorage.blocked);
  const [recoveryAvailable, setRecoveryAvailable] = useState(initialStorage.recovery);
  const [storageIssue, setStorageIssue] = useState<string | null>(initialStorage.issue);
  const [view, setView] = useState<"overview" | "plan" | "activity" | "companion">("overview");
  const [pendingImport, setPendingImport] = useState<{ data: AllowanceData; assets: unknown; filePath?: string } | null>(null);
  const dataRef = useRef(data);
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const loadingRef = useRef(false);
  const sessionRef = useRef(false);
  const appliedSnapshot = useRef<DashboardState | null>(null);
  const [installing, setInstalling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [startupEnabled, setStartupEnabledState] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<DiagnosticsState | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [overlayPreferences, setOverlayPreferencesState] =
    useState<OverlayPreferences>({
      enabled: false,
      opacity: 0.9,
      locked: true,
      bounds: null,
    });

  const activeProfile =
    data.profiles.find((profile) => profile.id === data.activeProfileId) ||
    data.profiles[0];

  useEffect(() => {
    dataRef.current = data;
    if (storageBlocked) return;
    const result = persistData(localStorage, data);
    if (result.issue) setStorageIssue(result.issue);
    if (result.saved && result.data !== data) setData(result.data);
  }, [data, storageBlocked]);

  const updateProfile = useCallback(
    (profileId: string, updater: (profile: Profile) => Profile) => {
      setData((current) => ({
        ...current,
        profiles: current.profiles.map((profile) =>
          profile.id === profileId ? updater(profile) : profile,
        ),
      }));
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<ProfileSettings>) => {
    updateProfile(activeProfile.id, (profile) => ({
      ...profile,
      settings: { ...profile.settings, ...patch },
    }));
  }, [activeProfile.id, updateProfile]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const profileId = dataRef.current.activeProfileId;
    setRefreshing(true);
    setError(null);
    try {
      const next = window.allowance
        ? await window.allowance.getDashboardState()
        : previewState();
      if (appliedSnapshot.current === next) return;
      appliedSnapshot.current = next;
      setState(next);
      const currentData = dataRef.current;
      const profile =
        currentData.profiles.find(
          (item) => item.id === profileId,
        ) || currentData.profiles[0];
      const notified = await evaluateAlerts(next, profile, window.allowance?.notify);
      updateProfile(profile.id, (current) => ({
        ...current,
        history: recordHistory(next, current.history),
        insights: recordInsights(current.insights, next),
        notified,
      }));
    } catch (cause) {
      setState(previous => previous ? { ...previous, providers: previous.providers.map(provider => ({ ...provider, stale: true })) } : null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [updateProfile]);

  const refreshDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      if (window.allowance) {
        setDiagnostics(await window.allowance.getDiagnostics());
      } else {
        setDiagnostics({
          checkedAt: Math.floor(Date.now() / 1_000),
          appVersion: "preview",
          platform: "browser",
          architecture: "browser",
          packaged: false,
          dataDirectory: "Browser local storage",
          items: [
            {
              id: "preview",
              label: "Browser preview",
              status: "info",
              summary: "Desktop checks require Electron",
              detail: "Run npm run dev to use live desktop integrations.",
            },
          ],
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void refreshDiagnostics();
    void window.allowance?.getStartupEnabled().then(setStartupEnabledState);
    void window.allowance?.getUpdateState().then(setUpdateState);
    void window.allowance
      ?.getOverlayPreferences()
      .then(setOverlayPreferencesState);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const removeRefresh = window.allowance?.onRefresh(() => void load());
    const removeSnapshot = window.allowance?.onDashboardState?.(next => {
      if (loadingRef.current || sessionRef.current || appliedSnapshot.current === next) return;
      appliedSnapshot.current = next; setState(next); setError(null);
      const profile = dataRef.current.profiles.find(profile => profile.id === dataRef.current.activeProfileId);
      if (!profile) return;
      void evaluateAlerts(next, profile, window.allowance?.notify).then(notified => updateProfile(profile.id, current => ({ ...current,
        history: recordHistory(next, current.history), insights: recordInsights(current.insights, next), notified,
      }))).catch(cause => setError(String(cause)));
    });
    const removeUpdate = window.allowance?.onUpdateState(setUpdateState);
    const removeOverlayToggle = window.allowance?.onOverlayToggle(
      (enabled) => {
        const current = dataRef.current;
        updateProfile(current.activeProfileId, (profile) => ({
          ...profile,
          settings: { ...profile.settings, overlayEnabled: enabled },
        }));
      },
    );
    const removeOverlayPreferences =
      window.allowance?.onOverlayPreferences(
        setOverlayPreferencesState,
      );
    const storage = (event: StorageEvent) => {
      if (event.key && event.key !== DATA_KEY) return;
      const loaded = loadStoredData(localStorage);
      setStorageBlocked(loaded.blocked); setStorageIssue(loaded.issue); setRecoveryAvailable(loaded.recovery);
      setData(loaded.data);
    };
    window.addEventListener("storage", storage);
    return () => {
      window.clearInterval(tick);
      removeRefresh?.();
      removeSnapshot?.();
      removeUpdate?.();
      removeOverlayToggle?.();
      removeOverlayPreferences?.();
      window.removeEventListener("storage", storage);
    };
  }, [load, refreshDiagnostics, updateProfile]);

  useEffect(() => {
    void window.allowance?.setOverlayEnabled(
      activeProfile.settings.overlayEnabled,
    );
  }, [activeProfile.id, activeProfile.settings.overlayEnabled]);

  useEffect(() => {
    const poll = window.setInterval(
      () => void load(),
      activeProfile.settings.refreshSeconds * 1_000,
    );
    return () => window.clearInterval(poll);
  }, [activeProfile.settings.refreshSeconds, load]);

  const summary = useMemo(() => usageSummary(state?.providers || [], now / 1000), [state, now]);
  const freshnessKey = state?.providers.map(provider => freshProvider(provider, now / 1000)).join(":");

  useEffect(() => {
    if (!state || !window.allowance) return;
    void window.allowance.setTrayState({
      profileName: activeProfile.name,
      companion: activeProfile.insights.companion,
      customCompanion: activeProfile.insights.customCompanion,
      companionSize: activeProfile.insights.companionSize,
      companionAnimated: activeProfile.insights.companionAnimated,
      lastResetAt: activeProfile.insights.lastResetAt,
      minimumRemaining: summary.remaining,
      minimumLabel: summary.label || "Minimum remaining",
      providers: state.providers.map((provider) => ({
        name: provider.displayName,
        remaining: lowestRemaining(provider, now / 1000) ?? null,
        status: provider.windows.length && !freshProvider(provider, now / 1000) ? "stale" : provider.status,
      })),
    });
  }, [activeProfile.name, activeProfile.insights.companion, activeProfile.insights.customCompanion, activeProfile.insights.companionSize, activeProfile.insights.companionAnimated, activeProfile.insights.lastResetAt, state, summary.remaining, freshnessKey]);

  const changeInsights = useCallback((patch: Partial<InsightData>) => {
    updateProfile(activeProfile.id, profile => ({ ...profile, insights: { ...profile.insights, ...patch } }));
  }, [activeProfile.id, updateProfile]);
  const handleSession = useCallback(async (action: "start" | "finish", name = "") => {
    if (sessionRef.current) { setMessage("Your session action is already being processed."); return; }
    if (storageBlocked) { setError("Recover or restore saved data before starting a session."); return; }
    sessionRef.current = true;
    setSessionBusy(true);
    const profileId = activeProfile.id;
    try {
      const next = window.allowance ? await window.allowance.getDashboardState() : previewState();
      if (action === "start" && !next.providers.some(p => freshProvider(p, next.refreshedAt))) {
        throw new Error("A fresh provider observation is needed to start a session.");
      }
      setState(next);
      updateProfile(profileId, profile => ({ ...profile, history: recordHistory(next, profile.history),
        insights: action === "start" ? startSession(profile.insights, next, name) : finishSession(profile.insights, next) }));
      setMessage(action === "start" ? "Session started. Usage will be tracked while Allowance runs in the tray." : "Session receipt saved. Open Activity to review it.");
    } catch (cause) {
      if (action === "finish") {
        // A failed refresh must not trap the user in an unfinishable session.
        updateProfile(profileId, profile => {
          if (!profile.insights.active) return profile;
          const receipt = { ...profile.insights.active, endedAt: Date.now() / 1000, partial: true };
          return { ...profile, insights: { ...profile.insights, active: null, sessions: [...profile.insights.sessions, receipt].slice(-300) } };
        });
        setMessage("Session saved with partial usage because the final refresh failed.");
      } else setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      sessionRef.current = false;
      setSessionBusy(false);
    }
  }, [activeProfile.id, storageBlocked, updateProfile]);

  const installClaude = async (remove = false) => {
    if (!window.allowance) return;
    setInstalling(true);
    setError(null);
    try {
      setMessage(await (remove ? window.allowance.uninstallClaudeHook() : window.allowance.installClaudeHook()));
      await load();
      await refreshDiagnostics();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInstalling(false);
    }
  };

  const setStartup = async (enabled: boolean) => {
    try {
      const actual = window.allowance
        ? await window.allowance.setStartupEnabled(enabled)
        : enabled;
      setStartupEnabledState(actual);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const setOverlay = useCallback(async (enabled: boolean) => {
    updateSettings({ overlayEnabled: enabled });
    try {
      await window.allowance?.setOverlayEnabled(enabled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [updateSettings]);

  const changeOverlayPreferences = async (
    patch: Partial<Pick<OverlayPreferences, "opacity" | "locked">>,
  ) => {
    try {
      if (window.allowance) {
        setOverlayPreferencesState(
          await window.allowance.setOverlayPreferences(patch),
        );
      } else {
        setOverlayPreferencesState((current) => ({
          ...current,
          ...patch,
        }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const resetOverlay = async () => {
    try {
      if (window.allowance) {
        setOverlayPreferencesState(
          await window.allowance.resetOverlayBounds(),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const exportBackup = async () => {
    if (!window.allowance) return;
    try {
      const companionAssets = await exportCompanionGifs(data.profiles.flatMap(profile => profile.insights.customCompanion ? [profile.insights.customCompanion.id] : []));
      const backup = JSON.stringify(
        {
          format: "allowance-backup",
          version: 2,
          exportedAt: new Date().toISOString(),
          data,
          companionAssets,
        },
        null,
        2,
      );
      const date = new Date().toISOString().slice(0, 10);
      const result = await window.allowance.exportData(
        "json",
        backup,
        "Allowance-backup-" + date + ".json",
      );
      if (!result.canceled) setMessage("Backup saved to " + result.filePath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const exportCsv = async () => {
    if (!window.allowance) return;
    setError(null);
    setMessage(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const result = await window.allowance.exportData(
        "csv",
        historyCsv(data),
        "Allowance-history-" + date + ".csv",
      );
      if (!result.canceled) setMessage("CSV saved to " + result.filePath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const importBackup = async () => {
    if (!window.allowance) return;
    try {
      const result = await window.allowance.importData();
      if (result.canceled || !result.content) return;
      const parsed = JSON.parse(result.content);
      if (
        parsed?.format !== "allowance-backup" ||
        Number(parsed?.version) !== 2
      ) {
        throw new Error("This is not an Allowance v2 backup.");
      }
      const restored = normalizeData(parsed.data);
      setPendingImport({ data: restored, assets: parsed.companionAssets, filePath: result.filePath });
      setSettingsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    try {
      const restored = pendingImport.data;
      await restoreCompanionGifs(pendingImport.assets, restored.profiles.flatMap(profile => profile.insights.customCompanion ? [profile.insights.customCompanion.id] : []));
      const saved = persistData(localStorage, restored);
      if (!saved.saved) throw new Error(saved.issue || "The backup could not be saved.");
      setData(saved.data); setStorageBlocked(false); setStorageIssue(saved.issue);
      setPendingImport(null); setMessage("Backup restored.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const exportRecovery = async () => {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      await window.allowance?.exportData("json", JSON.stringify({ format: "allowance-recovery", raw }, null, 2), "Allowance-recovery.json");
    } catch (cause) { setError(String(cause)); }
  };
  const recover = () => {
    try { const restored = recoverStoredData(localStorage); setData(restored); setStorageBlocked(false); setStorageIssue("Recovery copy restored. The original damaged data is preserved locally."); }
    catch { setError("Recovery could not be saved. Export the original data, then restore a backup from a file."); }
  };
  const changeHistoryRange = useCallback((historyDays: 7 | 30 | 90) => updateSettings({ historyDays }), [updateSettings]);

  const addProfile = (name: string) => {
    if (!name.trim() || data.profiles.length >= 20 || activeProfile.insights.active || sessionBusy || storageBlocked) return;
    const profile = newProfile(name.trim().slice(0, 40));
    setData((current) => ({
      ...current,
      activeProfileId: profile.id,
      profiles: [...current.profiles, profile],
    }));
  };

  const renameProfile = (name: string) => {
    if (!name.trim()) return;
    updateProfile(activeProfile.id, (profile) => ({
      ...profile,
      name: name.trim().slice(0, 40),
    }));
  };

  const selectProfile = (id: string) => {
    if (activeProfile.insights.active || sessionBusy) return;
    setData(current => current.profiles.some(profile => profile.id === id) ? { ...current, activeProfileId: id } : current);
  };

  const deleteProfile = () => {
    if (data.profiles.length <= 1 || activeProfile.insights.active || sessionBusy) return;
    setData((current) => {
      const profiles = current.profiles.filter(
        (profile) => profile.id !== current.activeProfileId,
      );
      return {
        ...current,
        profiles,
        activeProfileId: profiles[0].id,
      };
    });
  };

  const copyDiagnostics = async () => {
    if (!window.allowance || !diagnostics) return;
    setError(null);
    setMessage(null);
    try {
      const report = {
        generatedAt: new Date().toISOString(),
        app: {
          version: diagnostics.appVersion,
          platform: diagnostics.platform,
          architecture: diagnostics.architecture,
          packaged: diagnostics.packaged,
        },
        checks: diagnostics.items,
        recentErrors: diagnostics.recentErrors,
        providers: state?.providers.map((provider) => ({
          provider: provider.provider,
          status: provider.status,
          source: provider.source,
          stale: provider.stale,
          observedAt: provider.observedAt,
          windowCount: provider.windows.length,
          error: provider.error,
        })),
      };
      await window.allowance.copyText(JSON.stringify(report, null, 2));
      setMessage("Diagnostic report copied to the clipboard.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const checkUpdates = async () => {
    if (!window.allowance) return;
    try {
      setUpdateState(await window.allowance.checkForUpdates());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const lastKnown = useMemo(() => (state?.providers || []).flatMap(provider => provider.observedAt > 0 ? provider.windows.map(window => ({
    remaining: window.remainingPercent, label: provider.displayName + " " + window.label, at: provider.observedAt,
  })) : []).filter(value => Number.isFinite(value.remaining)).sort((a, b) => a.remaining - b.remaining)[0], [state]);

  const planningNow = useMemo(() => now / 1000, [Math.floor(now / 15000), freshnessKey]);

  const forecasts = useMemo(
    () =>
      Object.fromEntries(
        (state?.providers || []).map((provider) => [
          provider.provider,
          forecastFor(activeProfile.insights, provider),
        ]),
      ) as Record<string, Forecast>,
    [activeProfile.insights, state, Math.floor(now / 15000), freshnessKey],
  );

  return (
    <div
      className={
        "app-shell " +
        (activeProfile.settings.highContrast ? "high-contrast" : "")
      }
    >
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <span className="brand__name">Allowance</span>
            <span className="brand__tagline">
              Subscription usage
            </span>
          </div>
        </div>
        <div className="topbar__actions">
          {data.profiles.length > 1 && <label className="profile-select">
            <span className="sr-only">Active profile</span>
            <select value={activeProfile.id} disabled={Boolean(activeProfile.insights.active) || sessionBusy}
              title={activeProfile.insights.active ? "Finish your session before switching profiles" : "Switch profile"}
              onChange={event => selectProfile(event.target.value)}>
              {data.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>}
          <button className="toolbar-button" type="button" onClick={() => void load()} disabled={refreshing}
            title="Refresh usage" aria-label="Refresh usage" aria-busy={refreshing}>
            <RefreshIcon active={refreshing} /><span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
          <button className="toolbar-button" type="button" onClick={() => { setError(null); setMessage(null); setSettingsOpen(true); }}
            title="Settings" aria-label="Settings">
            <SettingsIcon /><span>Settings</span>
          </button>
        </div>
      </header>

      <main>
        {!IS_DESKTOP && (
          <div className="preview-banner">
            Browser preview · launch with <code>npm run dev</code> for live data
          </div>
        )}
        {storageIssue && <section className="storage-notice" role="alert"><p>{storageIssue}</p><div className="button-row">
          {storageBlocked && <><button className="button button--secondary" onClick={() => void exportRecovery()}>Export original data</button>
            {recoveryAvailable && <button className="button button--primary" onClick={recover}>Use recovery copy</button>}
            <button className="button button--secondary" onClick={() => void importBackup()}>Restore a backup</button></>}
          {!storageBlocked && <button className="button button--ghost" onClick={() => setStorageIssue(null)}>Dismiss</button>}
        </div></section>}
        <section className="hero">
          <div>
            <p className="eyebrow">{data.profiles.length > 1 || activeProfile.name !== "Default" ? activeProfile.name + " / " : ""}Current allowance</p>
            <h1 aria-live="polite" aria-atomic="true">
              {summary.remaining === null
                ? (lastKnown ? `Last known: ${Math.round(lastKnown.remaining)}%` : refreshing ? "Checking your accounts" : "Waiting for fresh usage")
                : summary.remaining + "% remaining"}
            </h1>
            <p className="hero__copy">
              {summary.nextReset
                ? (summary.label || "Your tightest active window") + " " +
                  formatReset(summary.nextReset, now).toLowerCase() +
                  "."
                : summary.remaining === null ? (lastKnown ? `${lastKnown.label} ? stale, observed ${relativeTime(lastKnown.at, now)}. Refresh to check current allowance.` : "Refresh usage or check each provider below. Last known readings are excluded from this total.") : "Reset time unavailable for the tightest window."}
            </p>
          </div>
          <div className="summary-details">
            <span>Last checked</span>
            <strong>{state ? relativeTime(state.refreshedAt, now) : "Waiting for data"}</strong>
            <small>Refreshes every {activeProfile.settings.refreshSeconds} seconds</small>
          </div>
        </section>

        {error && !settingsOpen && <div className="toast toast--error" role="alert">
          <InfoIcon /><span>{error}</span><button type="button" className="close-button" aria-label="Dismiss error" onClick={() => setError(null)}><CloseIcon /></button>
        </div>}
        {message && !settingsOpen && <div className="toast toast--success" role="status">
          <InfoIcon /><span>{message}</span><button type="button" className="close-button" aria-label="Dismiss message" onClick={() => setMessage(null)}><CloseIcon /></button>
        </div>}

        <nav className="workspace-nav" aria-label="Workspace views">{([['overview', 'Overview'], ['plan', 'Plan'], ['activity', 'Activity'], ['companion', 'Companion']] as const).map(([id, label]) =>
          <button key={id} type="button" aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>
        {view === "overview" && <section className="providers">
          {loading && !state
            ? ["codex", "claude"].map((provider) => (
                <article
                  className={
                    "provider-card provider-card--loading provider-card--" +
                    provider
                  }
                  key={provider}
                >
                  <div className="skeleton skeleton--title" />
                  <div className="skeleton skeleton--large" />
                  <div className="skeleton skeleton--medium" />
                </article>
              ))
            : state?.providers.map((provider) => (
                <ProviderCard
                  key={provider.provider}
                  provider={provider}
                  now={now}
                  onInstallClaude={() => void installClaude()}
                  installing={installing}
                  claudeHookInstalled={state.claudeHookInstalled}
                  forecast={
                    forecasts[provider.provider] || {
                      rate: null,
                      hoursToEmpty: null,
                      message: "Collecting forecast data.",
                    }
                  }
                />
              ))}
        </section>}

        <PlanningHub
          key={activeProfile.id}
          data={activeProfile.insights}
          view={view}
          state={state}
          now={planningNow}
          busy={sessionBusy || storageBlocked}
          overlayEnabled={activeProfile.settings.overlayEnabled}
          onChange={changeInsights}
          onSession={handleSession}
          onOverlay={setOverlay}
        />

        {view === "activity" && <UsageHistory
          history={activeProfile.history}
          range={activeProfile.settings.historyDays}
          onRange={changeHistoryRange}
        />}

        <footer className="app-footer">
          <span>
            <LockIcon /> No credentials, prompts, or code stored
          </span>
          <span>
            Refreshes every {activeProfile.settings.refreshSeconds}s · tray
            stays active when closed
          </span>
        </footer>
      </main>

      {!data.setupComplete && !storageBlocked && (
        <SetupWizard
          diagnostics={diagnostics}
          diagnosticsLoading={diagnosticsLoading}
          startupEnabled={startupEnabled}
          settings={activeProfile.settings}
          hookInstalled={Boolean(state?.claudeHookInstalled)}
          installing={installing}
          onRefreshDiagnostics={() => void refreshDiagnostics()}
          onInstallHook={() => void installClaude()}
          onStartup={(enabled) => void setStartup(enabled)}
          onSettings={updateSettings}
          onFinish={() =>
            setData((current) => ({ ...current, setupComplete: true }))
          }
        />
      )}

      {pendingImport && <ConfirmationDialog title="Restore backup" confirmLabel="Restore backup" onCancel={() => setPendingImport(null)} onConfirm={confirmImport}
        message={`Restore ${pendingImport.data.profiles.length} profile(s)? This replaces your current profiles, history and sessions.`} error={error} />}
      {settingsOpen && (
        <SettingsModal
          storageIssue={storageIssue}
          error={error}
          message={message}
          data={data}
          profile={activeProfile}
          state={state}
          diagnostics={diagnostics}
          diagnosticsLoading={diagnosticsLoading}
          startupEnabled={startupEnabled}
          overlayPreferences={overlayPreferences}
          updateState={updateState}
          installing={installing}
          onClose={() => setSettingsOpen(false)}
          onSettings={updateSettings}
          onStartup={(enabled) => void setStartup(enabled)}
          onOverlay={setOverlay}
          onOverlayPreferences={(patch) =>
            void changeOverlayPreferences(patch)
          }
          onResetOverlay={() => void resetOverlay()}
          onInstallHook={() => void installClaude()}
          onRemoveHook={() => void installClaude(true)}
          onInsights={changeInsights}
          onOpenSetup={() => { setSettingsOpen(false); setData(current => ({ ...current, setupComplete: false })); }}
          onDiagnostics={() => void refreshDiagnostics()}
          onCopyDiagnostics={() => void copyDiagnostics()}
          onExportBackup={() => void exportBackup()}
          onExportCsv={() => void exportCsv()}
          onImport={() => void importBackup()}
          onAddProfile={addProfile}
          onRenameProfile={renameProfile}
          onDeleteProfile={deleteProfile}
          onSelectProfile={selectProfile}
          onDismissFeedback={() => { setError(null); setMessage(null); }}
          onCheckUpdates={() => void checkUpdates()}
          onInstallUpdate={() =>
            void window.allowance?.installUpdate()
          }
        />
      )}
    </div>
  );
}
