import { useEffect, useState } from "react";
import { getStats, LinkStats } from "../api";
import { BarChart } from "./BarChart";

export function StatsPanel({ code }: { code: string | null }) {
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStats(code)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code) {
    return (
      <div className="card empty">
        <h2>Analytics</h2>
        <p className="muted">Select a link to view its click analytics.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Analytics</h2>
        <code>{code}</code>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {stats && (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-num" data-testid="total-clicks">
                {stats.clickCount}
              </span>
              <span className="stat-label">Total clicks</span>
            </div>
            <div className="stat">
              <span className="stat-num" data-testid="last-30-days">
                {stats.timeline.reduce((a, d) => a + d.count, 0)}
              </span>
              <span className="stat-label">Last 30 days</span>
            </div>
          </div>

          <h3>Clicks over time</h3>
          <BarChart data={stats.timeline} />

          <h3>Top referrers</h3>
          {stats.topReferrers.length === 0 ? (
            <p className="muted">No clicks recorded yet.</p>
          ) : (
            <ul className="referrers" data-testid="top-referrers">
              {stats.topReferrers.map((r) => (
                <li key={r.referer} data-testid="referrer-row">
                  <span className="ref-host">{r.referer}</span>
                  <span className="ref-count">{r.count}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="muted small">
            Headline total is the exact atomic counter; the breakdown samples the
            most recent {stats.sampledClicks} click
            {stats.sampledClicks === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </div>
  );
}
