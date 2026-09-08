import { memo } from "react";
import type { HistoryPoint } from "../types";
import { historyStats } from "../data/history";

function UsageHistoryView({
  history,
  range,
  onRange,
}: {
  history: HistoryPoint[];
  range: 7 | 30 | 90;
  onRange: (range: 7 | 30 | 90) => void;
}) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const recent = history.filter(
    (point) => point.at >= nowSeconds - range * 86_400,
  );
  const width = 760;
  const height = 190;
  const padding = 14;
  const firstAt = recent[0]?.at || nowSeconds - range * 86_400;
  const lastAt = recent.at(-1)?.at || nowSeconds;
  const span = Math.max(1, lastAt - firstAt);
  const pointsFor = (provider: "codex" | "claude") =>
    recent
      .map((point) => {
        const value = point[provider];
        if (value === undefined) return null;
        const x =
          padding +
          ((point.at - firstAt) / span) * (width - padding * 2);
        const y =
          padding +
          ((100 - value) / 100) * (height - padding * 2);
        return x.toFixed(1) + "," + y.toFixed(1);
      })
      .filter(Boolean)
      .join(" ");
  const codex = pointsFor("codex");
  const claude = pointsFor("claude");
  const enoughData =
    recent.length > 1 &&
    (codex.includes(" ") || claude.includes(" "));
  const stats = historyStats(recent);

  return (
    <section className="history-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Local history</p>
          <h2>Allowance over time</h2>
        </div>
        <div className="history-actions">
          <div className="segmented" aria-label="History time range">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                className={range === days ? "active" : ""}
                onClick={() => onRange(days)}
              >
                {days}d
              </button>
            ))}
          </div>
          <div className="legend" aria-label="Chart legend">
            <span>
              <i className="legend__dot legend__dot--codex" />
              Codex
            </span>
            <span>
              <i className="legend__dot legend__dot--claude" />
              Claude
            </span>
          </div>
        </div>
      </div>
      <div className="chart-wrap">
        <div className="chart-axis" aria-hidden="true">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <svg
          className="history-chart"
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label="Remaining usage history"
        >
          {[0, 0.5, 1].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={padding + ratio * (height - padding * 2)}
              x2={width}
              y2={padding + ratio * (height - padding * 2)}
              className="chart-grid"
            />
          ))}
          {enoughData ? (
            <>
              {codex.includes(" ") && (
                <polyline
                  points={codex}
                  className="chart-line chart-line--codex"
                />
              )}
              {claude.includes(" ") && (
                <polyline
                  points={claude}
                  className="chart-line chart-line--claude"
                />
              )}
            </>
          ) : (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              className="chart-empty"
            >
              History will appear as new snapshots arrive
            </text>
          )}
        </svg>
      </div>
      <div className="chart-caption">
        <span>
          {recent.length
            ? new Date(recent[0].at * 1_000).toLocaleDateString()
            : range + " days ago"}
        </span>
        <span>Now</span>
      </div>
      <div className="history-stats">
        <span>
          <strong>{stats.points.toLocaleString()}</strong>
          snapshots
        </span>
        <span>
          <strong>{stats.lowest === null ? "—" : stats.lowest + "%"}</strong>
          lowest reserve
        </span>
        <span>
          <strong>{stats.peakHour}</strong>
          peak usage hour
        </span>
      </div>
    </section>
  );
}

export const UsageHistory = memo(UsageHistoryView);
