import type { ProviderState, UsageWindow } from "../types";
import { freshProvider } from "../insights";
import { type Forecast, formatReset, relativeTime, sourceLabel } from "../format";
import { InfoIcon, LockIcon } from "./icons";
import { IS_DESKTOP } from "../runtime";

export function StatusPill({ provider, now = Date.now(), waiting = false }: { provider: ProviderState; now?: number; waiting?: boolean }) {
  const fresh = freshProvider(provider, now / 1000);
  const connected = provider.status === "connected" && fresh;
  const label = connected
    ? "Live"
    : provider.windows.length && !fresh
      ? "Stale"
      : waiting ? "Waiting" : provider.status === "fallback" ? "Snapshot" : provider.status === "error" ? "Unavailable" : "Setup needed";
  return (
    <span
      className={
        "status-pill status-pill--" +
        (connected ? "live" : label === "Stale" ? "stale" : provider.status)
      }
    >
      {label}
    </span>
  );
}

export function WindowRow({
  usageWindow,
  now,
  stale = false,
}: {
  usageWindow: UsageWindow;
  now: number;
  stale?: boolean;
}) {
  const remaining = Math.round(usageWindow.remainingPercent);
  const tone =
    stale ? "stale" : remaining <= 10 ? "danger" : remaining <= 30 ? "warning" : "healthy";
  return (
    <div className="window-row">
      <div className="window-row__heading">
        <div>
          <span className="window-row__label">{usageWindow.label}</span>
          <span className="window-row__reset">
            {formatReset(usageWindow.resetsAt, now)}
          </span>
        </div>
        <div className={"window-row__value window-row__value--" + tone}>
          <strong>{remaining}%</strong>
          <span>left</span>
        </div>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-label={usageWindow.label + " remaining"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={remaining}
      >
        <span
          className={"meter__fill meter__fill--" + tone}
          style={{ width: usageWindow.remainingPercent + "%" }}
        />
      </div>
      <div className="window-row__scale">
        <span>{Math.round(usageWindow.usedPercent)}% used</span>
      </div>
    </div>
  );
}

export function ProviderCard({
  provider,
  now,
  onInstallClaude,
  installing,
  claudeHookInstalled,
  forecast,
}: {
  provider: ProviderState;
  now: number;
  onInstallClaude: () => void;
  installing: boolean;
  claudeHookInstalled: boolean;
  forecast: Forecast;
}) {
  const hasUsage = provider.windows.length > 0;
  return (
    <article className={"provider-card provider-card--" + provider.provider}>
      <header className="provider-card__header">
        <div className="provider-title">
          <div>
            <h2>{provider.displayName}</h2>
            <div className="provider-meta">
              {provider.plan && (
                <span className="plan-chip">{provider.plan}</span>
              )}
              {provider.version && <span>v{provider.version}</span>}
              <span>{sourceLabel(provider.source)}</span>
            </div>
          </div>
        </div>
        <StatusPill provider={provider} now={now} waiting={provider.provider === "claude" && claudeHookInstalled && !hasUsage} />
      </header>

      {hasUsage && !freshProvider(provider, now / 1000) && (
        <p className="provider-note" role="status">Last known usage · waiting for a fresh observation. Excluded from current totals and alerts.</p>
      )}

      {hasUsage ? (
        <div className="window-list">
          {provider.windows.map((usageWindow) => (
            <WindowRow
              key={usageWindow.id}
              usageWindow={usageWindow}
              now={now}
              stale={!freshProvider(provider, now / 1000)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-provider">
          <h3>
            {provider.provider === "claude"
              ? claudeHookInstalled
                ? "Waiting for Claude Code"
                : "Connect Claude Code"
              : "Connect Codex"}
          </h3>
          <p>
            {provider.provider === "claude" && claudeHookInstalled
              ? "The hook is ready. Start or resume a Claude Code session."
              : provider.error || (provider.provider === "codex" ? "Sign in to Codex, then refresh to see your allowance." : "Install the local hook, then start a Claude Code session.")}
          </p>
          {provider.provider === "claude" && (
            <button
              className={
                "button " +
                (claudeHookInstalled
                  ? "button--installed"
                  : "button--primary")
              }
              type="button"
              onClick={onInstallClaude}
              disabled={
                installing ||
                !IS_DESKTOP ||
                claudeHookInstalled
              }
            >
              {installing
                ? "Installing…"
                : claudeHookInstalled
                  ? "Hook installed"
                  : "Install local hook"}
            </button>
          )}
        </div>
      )}

      {hasUsage && forecast.rate !== null && freshProvider(provider, now / 1000) && (
        <div className="forecast-strip">
          <span>{forecast.message}</span>
        </div>
      )}

      {provider.credits &&
        (provider.credits.balance !== null ||
          provider.credits.unlimited) && (
          <div className="credit-row">
            <span>Credit balance</span>
            <strong>
              {provider.credits.unlimited
                ? "Unlimited"
                : (provider.credits.balance?.toLocaleString() || "—") +
                  " credits"}
            </strong>
          </div>
        )}

      {hasUsage && provider.error && (
        <p className="provider-note" title={provider.error}>
          <InfoIcon />
          {provider.error}
        </p>
      )}

      <footer className="provider-card__footer">
        <span>{provider.observedAt ? "Observed " + relativeTime(provider.observedAt, now) : "Observation time unknown"}</span>
        <span className="privacy-note">
          <LockIcon /> Local only
        </span>
      </footer>
    </article>
  );
}
