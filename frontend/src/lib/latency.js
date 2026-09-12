/**
 * latency.js
 *
 * Minimal latency tracking module for recording interrupt-stop timestamps
 * and barge-in metrics.
 */

export const interruptStops = [];

export function recordInterruptStop(timestamp = performance.now()) {
  interruptStops.push({
    timestamp,
    recordedAt: new Date().toISOString(),
  });
  console.log(`[Latency] Interrupt stop recorded at t=${timestamp.toFixed(2)}ms`);
  return timestamp;
}

export function getInterruptStops() {
  return [...interruptStops];
}
