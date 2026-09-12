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
      <div className="latency-header">
        <div className="latency-title-row">
          <span className="latency-icon">⚡</span>
          <span className="latency-label">Interruption Latency</span>
        </div>
        <span className="latency-tag">Real Barge-In</span>
      </div>

      <div className="latency-hero-display">
        <span className="latency-value" id="latency-metric">
          {last !== null ? `${last} ms` : "—"}
        </span>
      </div>

      <div className="latency-stats-line" id="latency-stats-summary">
        {count > 0
          ? `Last interrupt-stop latency: ${last} ms · avg over ${count}: ${avg} ms`
          : "Last interrupt-stop latency: — ms · avg over 0: — ms"}
      </div>

      <p className="latency-hint">
        Measured from user speech barge-in detection to AI audio output cutoff.
      </p>
    </div>
  );
}
