import { useEffect, useState } from "react";
import type { DiagnosticsState } from "./types";
import { BrandMark } from "./BrandMark";
import { type ProfileSettings } from "./data/schema";
import { DiagnosticList } from "./components/icons";
import { useDialogFocus } from "./hooks/useDialogFocus";
import { IS_DESKTOP } from "./runtime";

export function SetupWizard({
  diagnostics,
  diagnosticsLoading,
  startupEnabled,
  settings,
  hookInstalled,
  installing,
  onRefreshDiagnostics,
  onInstallHook,
  onStartup,
  onSettings,
  onFinish,
}: {
  diagnostics: DiagnosticsState | null;
  diagnosticsLoading: boolean;
  startupEnabled: boolean;
  settings: ProfileSettings;
  hookInstalled: boolean;
  installing: boolean;
  onRefreshDiagnostics: () => void;
  onInstallHook: () => void;
  onStartup: (enabled: boolean) => void;
  onSettings: (patch: Partial<ProfileSettings>) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const wizardRef = useDialogFocus(onFinish);
  useEffect(() => { wizardRef.current?.querySelector<HTMLElement>("h1")?.focus(); }, [step]);
  return (
    <div className="modal-backdrop">
      <section
        className="wizard"
        ref={wizardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Set up Allowance"
      >
        <p className="wizard-step">Step {step + 1} of 3</p>
        <div className="wizard-progress" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className={item <= step ? "active" : ""}
            />
          ))}
        </div>
        {step === 0 && (
          <div className="wizard-page">
            <BrandMark large />
            <p className="eyebrow">Welcome to Allowance</p>
            <h1 tabIndex={-1}>Your coding allowance, in one place.</h1>
            <p>
              See your remaining Codex and Claude Code usage, reset times,
              and recent history. Your data stays on this device. Allowance
              does not store prompts, source code, or service credentials.
            </p>
            <div className="wizard-features">
              <span>Usage and resets</span>
              <span>Coding sessions</span>
              <span>Local history</span>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="wizard-page">
            <p className="eyebrow">Connection check</p>
            <h1 tabIndex={-1}>Let’s connect your tools.</h1>
            <DiagnosticList
              diagnostics={diagnostics}
              loading={diagnosticsLoading}
            />
            <div className="wizard-inline-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={onRefreshDiagnostics}
              >
                Recheck
              </button>
              <button
                className={
                  "button " +
                  (hookInstalled
                    ? "button--installed"
                    : "button--primary")
                }
                type="button"
                onClick={onInstallHook}
                disabled={hookInstalled || installing || !IS_DESKTOP}
              >
                {installing
                  ? "Installing…"
                  : hookInstalled
                    ? "Claude hook installed"
                    : "Install Claude hook"}
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="wizard-page">
            <p className="eyebrow">Preferences</p>
            <h1 tabIndex={-1}>Keep it useful, not noisy.</h1>
            <label className="toggle-row">
              <span>
                <strong>Launch with Windows</strong>
                <small>Start hidden in the tray after sign-in.</small>
              </span>
              <input
                type="checkbox"
                checked={startupEnabled}
                onChange={(event) => onStartup(event.target.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Usage notifications</strong>
                <small>Alert at selected thresholds and before resets.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(event) =>
                  onSettings({
                    notificationsEnabled: event.target.checked,
                  })
                }
              />
            </label>
            <label className="field-row">
              <span>
                <strong>Refresh interval</strong>
                <small>Shorter intervals use slightly more battery.</small>
              </span>
              <select
                value={settings.refreshSeconds}
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
          </div>
        )}
        <footer className="wizard-footer"><button type="button" className="button button--ghost" onClick={onFinish}>Skip setup</button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          {step < 2 ? (
            <button
              className="button button--accent"
              type="button"
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          ) : (
            <button
              className="button button--accent"
              type="button"
              onClick={onFinish}
            >
              Open dashboard
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
