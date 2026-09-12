import React, { useState, useEffect } from "react";
import { subscribe, getStats } from "../lib/latency";

export default function LatencyBadge() {
  const [stats, setStats] = useState(getStats());

  useEffect(() => {
    const unsubscribe = subscribe((newStats) => {
      setStats(newStats);
    });
    return () => unsubscribe();
  }, []);

  const { last, avg, count } = stats;

  return (
    <div className="panel-card latency-panel">
      <div className="latency-row">
        <span className="latency-label">Interruption Latency:</span>
        <span className="latency-value" id="latency-metric">
          {last !== null ? `${last} ms` : "—"}
        </span>
      </div>
      <div
        className="latency-stats-line"
        id="latency-stats-summary"
        style={{
          fontSize: "0.82rem",
          color: count > 0 ? "var(--text-secondary)" : "var(--text-muted)",
          marginTop: "2px",
        }}
      >
        {count > 0
          ? `Last interrupt-stop latency: ${last} ms · avg over ${count}: ${avg} ms`
          : "Last interrupt-stop latency: — ms · avg over 0: — ms"}
      </div>
      <div className="latency-hint">
        Measured from user speech barge-in detection to AI audio output cutoff.
      </div>
    </div>
  );
}
