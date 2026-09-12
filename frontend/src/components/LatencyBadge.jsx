import React from "react";

export default function LatencyBadge({ lastLatencyMs = 180 }) {
  return (
    <div className="panel-card latency-panel">
      <div className="latency-row">
        <span className="latency-label">Last interrupt-stop latency:</span>
        <span className="latency-value" id="latency-metric">
          {lastLatencyMs} ms
        </span>
      </div>
      <div className="latency-hint">
        Measured from user speech barge-in detection to AI audio output cutoff.
      </div>
    </div>
  );
}
