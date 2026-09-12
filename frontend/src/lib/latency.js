/**
 * latency.js
 *
 * Interruption (barge-in) latency measurement module.
 *
 * WHAT IS AND ISN'T BEING MEASURED:
 * This measures the full end-to-end perceived round-trip latency:
 * from local (client-side, approximate) energy-based detection of the user
 * beginning to speak over the AI, through audio streaming over WebSocket,
 * Gemini's server-side VAD interruption classification, the serverContent.interrupted
 * signal returning over the network, to the exact moment client-side audio playback
 * is silenced via hardStop().
 *
 * This is NOT a lab-precise server-side metric; it reflects the real-world user-perceived
 * barge-in cutoff delay including network transit in both directions.
 */

// Exported array of all recorded interruption latency measurements (in ms)
export const latencyLog = [];

let lastSpeechStartTs = null;
const listeners = new Set();

function notifyListeners() {
  const stats = getStats();
  listeners.forEach((listener) => {
    try {
      listener(stats);
    } catch (err) {
      console.error("[Latency] Error in listener:", err);
    }
  });
}

/**
 * Records the timestamp when user speech onset is locally detected over AI speech.
 *
 * @param {number} [ts=performance.now()] - Timestamp in milliseconds
 * @returns {number} The recorded timestamp
 */
export function recordSpeechStart(ts = performance.now()) {
  lastSpeechStartTs = ts;
  console.log(`[Latency] Speech start detected at t=${ts.toFixed(2)}ms`);
  return ts;
}

/**
 * Records the timestamp when AI audio playback is actually silenced by hardStop().
 * If speech start was previously recorded, computes round-trip latency, pushes to latencyLog,
 * clears the start timestamp, and notifies subscribers.
 *
 * @param {number} [ts=performance.now()] - Timestamp in milliseconds
 * @returns {number|null} The computed latencyMs, or null if no speech start was pending
 */
export function recordAudioStop(ts = performance.now()) {
  if (lastSpeechStartTs !== null) {
    const latencyMs = Math.round(ts - lastSpeechStartTs);
    latencyLog.push(latencyMs);
    console.log(
      `[Latency] Audio stop recorded at t=${ts.toFixed(2)}ms · Round-trip barge-in latency: ${latencyMs}ms`
    );
    lastSpeechStartTs = null;
    notifyListeners();
    return latencyMs;
  }
  return null;
}

/**
 * Cancels / clears any pending speech start timestamp (e.g. when AI finishes speaking naturally).
 */
export function clearSpeechStart() {
  lastSpeechStartTs = null;
}

/**
 * Returns current latency statistics.
 *
 * @returns {{ last: number|null, avg: number|null, count: number }}
 */
export function getStats() {
  const count = latencyLog.length;
  const last = count > 0 ? latencyLog[count - 1] : null;
  const avg = count > 0 ? Math.round(latencyLog.reduce((sum, v) => sum + v, 0) / count) : null;
  return { last, avg, count };
}

/**
 * Subscribes a listener to latency updates.
 *
 * @param {Function} listener - Callback receiving { last, avg, count }
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  // Emit current stats immediately upon subscription
  listener(getStats());
  return () => {
    listeners.delete(listener);
  };
}

// Backward compatibility alias for any existing imports
export const recordInterruptStop = recordAudioStop;
export function getInterruptStops() {
  return [...latencyLog];
}
