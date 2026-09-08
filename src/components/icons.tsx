import type { DiagnosticsState } from "../types";

export function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5M10 6.2v.2" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4.5" y="8" width="11" height="8" rx="2" />
      <path d="M7 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function RefreshIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={active ? "spin" : ""}
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M16 7.2A6.5 6.5 0 1 0 16 13" />
      <path d="M16 3.8v3.8h-3.8" />
    </svg>
  );
}

export function DiagnosticList({
  diagnostics,
  loading,
}: {
  diagnostics: DiagnosticsState | null;
  loading: boolean;
}) {
  if (loading && !diagnostics) {
    return <p className="muted-copy">Checking this computer…</p>;
  }
  return (
    <div className="diagnostic-list">
      {diagnostics?.items.map((item) => (
        <div className="diagnostic-row" key={item.id}>
          <span
            className={"diagnostic-status diagnostic-status--" + item.status}
          >
            {{ ok: "Ready", warning: "Review", error: "Unavailable", info: "Info" }[item.status]}
          </span>
          <div>
            <strong>{item.label}</strong>
            <span>{item.summary}</span>
            {item.detail && <small>{item.detail}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}
