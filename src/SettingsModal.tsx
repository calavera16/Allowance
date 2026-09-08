import { BudgetPreferences } from "./components/BudgetPreferences";
import { CompanionCustomizer } from "./CompanionCustomizer";
import { type InsightData } from "./insights";
import { useEffect, useRef, useState } from "react";
import type { DashboardState, DiagnosticsState, OverlayPreferences, UpdateState } from "./types";
import { CloseIcon } from "./BrandMark";
import { ProfileManager } from "./ProfileManager";
import { type ProfileSettings, type Profile, type AllowanceData } from "./data/schema";
import { DiagnosticList } from "./components/icons";
import { useDialogFocus } from "./hooks/useDialogFocus";

export function SettingsModal({
  storageIssue,
  data,
  profile,
  state,
  diagnostics,
  diagnosticsLoading,
  startupEnabled,
  overlayPreferences,
  updateState,
  installing,
  onClose,
  onSettings,
  onStartup,
  onOverlay,
  onOverlayPreferences,
  onResetOverlay,
  onInstallHook,
  onRemoveHook,
  onOpenSetup,
  onInsights,
  onDiagnostics,
  onCopyDiagnostics,
  onExportBackup,
  onExportCsv,
  onImport,
  onAddProfile,
  onRenameProfile,
  onDeleteProfile,
  onSelectProfile,
  onCheckUpdates,
  onInstallUpdate,
  error,
  message,
  onDismissFeedback,
}: {
  storageIssue: string | null;
  data: AllowanceData;
  profile: Profile;
  state: DashboardState | null;
  diagnostics: DiagnosticsState | null;
  diagnosticsLoading: boolean;
  startupEnabled: boolean;
  overlayPreferences: OverlayPreferences;
  updateState: UpdateState | null;
  installing: boolean;
  onClose: () => void;
  onSettings: (patch: Partial<ProfileSettings>) => void;
  onStartup: (enabled: boolean) => void;
  onOverlay: (enabled: boolean) => void;
  onOverlayPreferences: (
    patch: Partial<Pick<OverlayPreferences, "opacity" | "locked">>,
  ) => void;
  onResetOverlay: () => void;
  onInstallHook: () => void;
  onRemoveHook: () => void;
  onOpenSetup: () => void;
  onInsights: (patch: Partial<InsightData>) => void;
  onDiagnostics: () => void;
  onCopyDiagnostics: () => void;
  onExportBackup: () => void;
  onExportCsv: () => void;
  onImport: () => void;
  onAddProfile: (name: string) => void;
  onRenameProfile: (name: string) => void;
  onDeleteProfile: () => void;
  onSelectProfile: (id: string) => void;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
  error: string | null;
  message: string | null;
  onDismissFeedback: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [tab, setTab] = useState("general");
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [tab]);
  const tabs = [
    ["general", "General"],
    ["connections", "Connections"],
    ["planning", "Planning"],
    ["companion", "Companion"],
    ["alerts", "Alerts"],
    ["profiles", "Profiles"],
    ["data", "Data"],
    ["health", "Health"],
    ["updates", "Updates"],
  ];
  const toggleThreshold = (threshold: number) => {
    const next = profile.settings.thresholds.includes(threshold)
      ? profile.settings.thresholds.filter((item) => item !== threshold)
      : [...profile.settings.thresholds, threshold].sort();
    onSettings({ thresholds: next });
  };
  return (
    <div className="modal-backdrop">
      <section
        className="settings-modal"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Allowance settings"
      >
        <header className="settings-header">
          <div>
            <p className="eyebrow">Allowance</p>
            <h2>Settings</h2>
          </div>
          <button
            className="close-button"
            type="button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-content" ref={contentRef}>
            {error && <div className="settings-feedback settings-feedback--error" role="alert"><span>{error}</span><button type="button" className="close-button" aria-label="Dismiss error" onClick={onDismissFeedback}><CloseIcon /></button></div>}
            {message && <div className="settings-feedback" role="status"><span>{message}</span><button type="button" className="close-button" aria-label="Dismiss message" onClick={onDismissFeedback}><CloseIcon /></button></div>}
            {tab === "alerts" && (
              <section>
                <p className="eyebrow">Notifications</p>
                <h3>Usage alerts</h3>
                <label className="toggle-row">
                  <span>
                    <strong>Enable notifications</strong>
                    <small>Notifications are native Windows alerts.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={profile.settings.notificationsEnabled}
                    onChange={(event) =>
                      onSettings({
                        notificationsEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <div className="setting-block">
                  <strong>Alert when usage reaches</strong>
                  <div className="threshold-grid">
                    {[70, 80, 90].map((threshold) => (
                      <label key={threshold}>
                        <input
                          type="checkbox"
                          checked={profile.settings.thresholds.includes(
                            threshold,
                          )}
                          onChange={() => toggleThreshold(threshold)}
                        />
                        {threshold}% used
                      </label>
                    ))}
                  </div>
                </div>
                <label className="field-row">
                  <span>
                    <strong>Reset reminder</strong>
                    <small>Notify shortly before a window resets.</small>
                  </span>
                  <select
                    value={profile.settings.resetReminderMinutes}
                    onChange={(event) =>
                      onSettings({
                        resetReminderMinutes: Number(event.target.value),
                      })
                    }
                  >
                    <option value={0}>Off</option>
                    <option value={10}>10 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Usage spike alerts</strong>
                    <small>Warn after a 15% drop within 15 minutes.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={profile.settings.spikeAlerts}
                    onChange={(event) =>
                      onSettings({ spikeAlerts: event.target.checked })
                    }
                  />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>Quiet hours</strong>
                    <small>Pause alerts during your chosen hours.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={profile.settings.quietHours.enabled}
                    onChange={(event) =>
                      onSettings({
                        quietHours: {
                          ...profile.settings.quietHours,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                </label>
                {profile.settings.quietHours.enabled && (
                  <div className="time-grid">
                    <label>
                      From
                      <select
                        value={profile.settings.quietHours.start}
                        onChange={(event) =>
                          onSettings({
                            quietHours: {
                              ...profile.settings.quietHours,
                              start: Number(event.target.value),
                            },
                          })
                        }
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option key={hour} value={hour}>
                            {String(hour).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Until
                      <select
                        value={profile.settings.quietHours.end}
                        onChange={(event) =>
                          onSettings({
                            quietHours: {
                              ...profile.settings.quietHours,
                              end: Number(event.target.value),
                            },
                          })
                        }
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option key={hour} value={hour}>
                            {String(hour).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </section>
            )}
            {tab === "general" && (
              <section>
                <p className="eyebrow">Behavior</p>
                <h3>General</h3>
                <h4 className="settings-group-heading">Desktop overlay</h4>
                <label className="toggle-row">
                  <span>
                    <strong>Always-on-top usage overlay</strong>
                    <small>
                      Show remaining percentages over other apps. The overlay
                      is click-through and stays out of the taskbar.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={profile.settings.overlayEnabled}
                    onChange={(event) => onOverlay(event.target.checked)}
                  />
                </label>
                {profile.settings.overlayEnabled && (
                  <div className="overlay-settings-card">
                    <label className="opacity-control">
                      <span>
                        <strong>Overlay opacity</strong>
                        <small>
                          {Math.round(overlayPreferences.opacity * 100)}%
                        </small>
                      </span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        step={1}
                        value={Math.round(
                          overlayPreferences.opacity * 100,
                        )}
                        onChange={(event) =>
                          onOverlayPreferences({
                            opacity: Number(event.target.value) / 100,
                          })
                        }
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className={
                          "button " +
                          (overlayPreferences.locked
                            ? "button--accent"
                            : "button--secondary")
                        }
                        type="button"
                        onClick={() =>
                          onOverlayPreferences({
                            locked: !overlayPreferences.locked,
                          })
                        }
                      >
                        {overlayPreferences.locked
                          ? "Edit position and size"
                          : "Finish editing"}
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={onResetOverlay}
                      >
                        Reset position and size
                      </button>
                    </div>
                    <p>
                      {overlayPreferences.locked
                        ? "Unlock the overlay to move or resize it with the mouse or keyboard. Arrow keys adjust the focused handle; Shift makes larger steps."
                        : "The overlay is unlocked. Drag its header or resize its edges, then finish editing to make it click-through again."}
                    </p>
                  </div>
                )}
                <h4 className="settings-group-heading">Application</h4>
                <label className="toggle-row">
                  <span>
                    <strong>Launch with Windows</strong>
                    <small>Start hidden in the system tray.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={startupEnabled}
                    onChange={(event) => onStartup(event.target.checked)}
                  />
                </label>
                <label className="field-row">
                  <span>
                    <strong>Refresh interval</strong>
                    <small>Reconnects automatically after tool restarts.</small>
                  </span>
                  <select
                    value={profile.settings.refreshSeconds}
                    onChange={(event) =>
                      onSettings({
                        refreshSeconds: Number(event.target.value),
                      })
                    }
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>High contrast</strong>
                    <small>Increase borders and text contrast.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={profile.settings.highContrast}
                    onChange={(event) =>
                      onSettings({ highContrast: event.target.checked })
                    }
                  />
                </label>
              </section>
            )}
            {tab === "connections" && <section><h3>Connections</h3><div className="setting-block"><strong>Claude Code integration</strong>
              <p>Store only quota percentages, reset times, version and observation time. Other Claude settings are preserved.</p>
              <div className="button-row"><button type="button" className="button button--primary" disabled={installing} onClick={onInstallHook}>
                {installing ? "Updating hook..." : state?.claudeHookInstalled ? "Update local hook" : "Install local hook"}</button>
                {state?.claudeHookInstalled && <button type="button" className="button button--secondary" disabled={installing} onClick={onRemoveHook}>Remove local hook</button>}
              </div></div><div className="setting-block"><strong>Guided setup</strong><p>Review connections and startup preferences again.</p><button className="button button--secondary" onClick={onOpenSetup}>Run setup again</button></div></section>}
            {tab === "planning" && <section><h3>Planning preferences</h3><p className="planner-note">Working days and allowance reserve for this profile.</p><BudgetPreferences data={profile.insights} onChange={onInsights} /></section>}
            {tab === "companion" && <CompanionCustomizer data={profile.insights} now={Date.now() / 1000} remaining={null} overlayEnabled={profile.settings.overlayEnabled} onChange={onInsights} onOverlay={onOverlay} />}
            {tab === "profiles" && (
              <ProfileManager profiles={data.profiles.map(item => ({ id: item.id, name: item.name, snapshots: item.history.length }))}
                activeId={profile.id} sessionActive={Boolean(profile.insights.active)} onAdd={onAddProfile}
                onRename={onRenameProfile} onDelete={onDeleteProfile} onSelect={onSelectProfile} />
            )}
            {tab === "data" && (
              <section>
                <p className="eyebrow">Portable data</p>
                <h3>Backup and export</h3>
                <div className="action-card">
                  <div>
                    <strong>Full JSON backup</strong>
                    <p>Profiles, settings, notifications, history, budgets, and session receipts.</p>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={onExportBackup}
                  >
                    Export
                  </button>
                </div>
                <div className="action-card">
                  <div>
                    <strong>History CSV</strong>
                    <p>All profile snapshots for spreadsheet analysis.</p>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={onExportCsv}
                  >
                    Export CSV
                  </button>
                </div>
                <div className="action-card">
                  <div>
                    <strong>Restore a backup</strong>
                    <p>Replaces local profiles after confirmation.</p>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={onImport}
                  >
                    Import
                  </button>
                </div>
              </section>
            )}
            {tab === "health" && (
              <section>
                <div className="settings-title-row">
                  <div>
                    <p className="eyebrow">Troubleshooting</p>
                    <h3>Connection health</h3>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={onDiagnostics}
                  >
                    Recheck
                  </button>
                </div>
                <DiagnosticList
                  diagnostics={diagnostics}
                  loading={diagnosticsLoading}
                />
                <div className="button-row">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={onCopyDiagnostics}
                  >
                    Copy safe report
                  </button>
                </div>
                <details className="raw-inspector">
                  <summary>Inspect current local snapshot</summary>
                  <pre>{JSON.stringify(state, null, 2)}</pre>
                </details>
              </section>
            )}
            {tab === "updates" && (
              <section>
                <p className="eyebrow">Distribution</p>
                <h3>Software updates</h3>
                <div className="update-card">
                  <div>
                    <strong>
                      Allowance v
                      {window.allowance?.appVersion || "preview"}
                    </strong>
                    <p>
                      {updateState?.message ||
                        "Update status is not available yet."}
                    </p>
                  </div>
                </div>
                {updateState?.status === "downloading" &&
                  updateState.progress !== null && (
                    <div className="meter">
                      <span
                        className="meter__fill"
                        style={{
                          width: (updateState.progress || 0) + "%",
                        }}
                      />
                    </div>
                  )}
                <div className="button-row">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={onCheckUpdates}
                    disabled={
                      updateState?.status === "checking" ||
                      updateState?.status === "downloading"
                    }
                  >
                    Check for updates
                  </button>
                  {updateState?.status === "downloaded" && (
                    <button
                      className="button button--accent"
                      type="button"
                      onClick={onInstallUpdate}
                    >
                      Restart and install
                    </button>
                  )}
                </div>
                <p className="settings-footnote">
                  Your usage stays local. Update checks are available when an
                  update channel has been configured for this build.
                </p>
              </section>
            )}
          </div>
        </div>
        <footer className="settings-footer"><span role={storageIssue ? "status" : undefined}>{storageIssue || "Changes are saved automatically"}</span><span>Allowance {window.allowance?.appVersion || "preview"}</span></footer>
      </section>
    </div>
  );
}
