import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardState } from "./types";
import { BrandMark } from "./BrandMark";
import { usageSummary } from "./insights";
import { type AllowanceData } from "./data/schema";
import { loadData } from "./data/storage";
import { previewState } from "./data/preview";
import { lowestRemaining } from "./data/history";
import { formatReset, relativeTime } from "./format";
import { StatusPill } from "./components/ProviderCard";
import { RefreshIcon } from "./components/icons";

export function CompactApp() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [data, setData] = useState<AllowanceData>(loadData);
  const profile = data.profiles.find(item => item.id === data.activeProfileId) || data.profiles[0];
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    setError(null);
    try {
      setState(window.allowance ? await window.allowance.getDashboardState() : previewState());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState(previous => previous ? { ...previous, providers: previous.providers.map(provider => ({ ...provider, stale: true })) } : null);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const remove = window.allowance?.onRefresh(() => void load());
    const removeState = window.allowance?.onDashboardState?.(next => { setState(next); setError(null); });
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const storage = () => setData(loadData());
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") void window.allowance?.closeCompact().catch(cause => setError(String(cause)));
    };
    window.addEventListener("storage", storage);
    window.addEventListener("keydown", escape);
    return () => {
      remove?.(); removeState?.(); window.clearInterval(tick);
      window.removeEventListener("storage", storage);
      window.removeEventListener("keydown", escape);
    };
  }, [load]);
  const summary = usageSummary(state?.providers || [], now / 1000);
  return (
    <div className={"compact-shell " + (profile.settings.highContrast ? "high-contrast" : "")}>
      <header className="compact-header">
        <div className="brand">
          <BrandMark />
          <div><span className="brand__name">Allowance</span><span className="brand__tagline">{profile.name}</span></div>
        </div>
        <button className="icon-button" type="button" onClick={() => void load()} disabled={refreshing} aria-label="Refresh usage">
          <RefreshIcon active={refreshing} />
        </button>
      </header>
      <div className="compact-summary" aria-live="polite">
        <strong>{summary.remaining === null ? "—" : summary.remaining + "%"}</strong>
        <span>{summary.remaining === null ? (refreshing ? "Checking usage…" : "Waiting for fresh usage") : "minimum remaining"}</span>
        {summary.label && <small>{summary.label}{summary.nextReset ? " · " + formatReset(summary.nextReset, now) : " · Reset time unavailable"}</small>}
      </div>
      {error && <p className="compact-error" role="alert">Refresh failed: {error}. Use Refresh to retry.</p>}
      <div className="compact-providers">
        {state?.providers.map(provider => {
          const remaining = lowestRemaining(provider, now / 1000);
          const lastKnown = provider.windows.length ? Math.min(...provider.windows.map(w => w.remainingPercent)) : undefined;
          return (
            <div className="compact-provider" key={provider.provider}>
              <div>
                <strong>{provider.displayName}</strong>
                <span>{remaining !== undefined ? Math.round(remaining) + "% left" : lastKnown !== undefined ? "Last known: " + Math.round(lastKnown) + "%" : "Setup needed"}</span>
                <small>{provider.windows.length ? relativeTime(provider.observedAt, now) : "Open dashboard to connect"}</small>
              </div>
              <StatusPill provider={provider} now={now} />
            </div>
          );
        })}
      </div>
      <button className="compact-open" type="button" onClick={() => void window.allowance?.openDashboard().catch(cause => setError(String(cause)))}>
        Open dashboard
      </button>
    </div>
  );
}
