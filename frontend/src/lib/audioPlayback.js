/**
 * audioPlayback.js
 *
 * Audio playback queue for Gemini Live 24kHz PCM16 audio output.
 * Decodes base64 PCM16 chunks, converts to Float32, resamples if necessary,
 * seamlessly schedules AudioBufferSourceNodes, and supports instant hard-stop
 * barge-in interruption.
 */

import { recordAudioStop } from "./latency";

export class AudioPlaybackQueue {
  constructor() {
    // 1. Initialize AudioContext at 24kHz if supported, otherwise fallback to native rate
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    try {
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });
    } catch {
      this.audioContext = new AudioContextClass();
    }

    this.sampleRate = this.audioContext.sampleRate;
    this.sourceSampleRate = 24000;
    this.nextStartTime = 0;

    // Array holding currently scheduled / active AudioBufferSourceNodes
    this.activeSources = [];

    // Monotonically-increasing turn counter to drop late/out-of-order chunks across interruptions
    this.currentTurnId = 0;
  }

  /**
   * Advances turn ID when a new AI response turn begins.
   * @returns {number} The new turn ID
   */
  startNewTurn() {
    this.currentTurnId++;
    return this.currentTurnId;
  }

  /**
   * Enqueues and schedules a base64-encoded PCM16 audio chunk.
   *
   * @param {string} base64PcmChunk - Little-endian 16-bit signed PCM at 24kHz
   * @param {number} [turnId] - The turnId current when the chunk was received
   */
  enqueueChunk(base64PcmChunk, turnId) {
    if (!base64PcmChunk) return;

    // Defensive guard: drop chunk if turnId no longer matches current active turn
    if (turnId !== undefined && turnId !== this.currentTurnId) {
      console.warn(
        `[AudioPlayback] Dropping out-of-order/interrupted chunk for turnId=${turnId} (active=${this.currentTurnId})`
      );
      return;
    }

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }

    // 1. Decode base64 to raw bytes
    const binary = window.atob(base64PcmChunk);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // 2. Interpret as little-endian 16-bit signed PCM
    const numSamples = Math.floor(len / 2);
    if (numSamples === 0) return;

    const dataView = new DataView(bytes.buffer, bytes.byteOffset, numSamples * 2);
    const float32Samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      float32Samples[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
    }

    // 3. Resample to audioContext.sampleRate if not natively 24000Hz
    let playbackSamples = float32Samples;
    const targetSampleRate = this.sampleRate;

    if (targetSampleRate !== this.sourceSampleRate) {
      const resampleRatio = this.sourceSampleRate / targetSampleRate;
      const targetLength = Math.round(numSamples / resampleRatio);
      const resampled = new Float32Array(targetLength);

      for (let j = 0; j < targetLength; j++) {
        const srcPos = j * resampleRatio;
        const i0 = Math.floor(srcPos);
        const i1 = Math.min(i0 + 1, numSamples - 1);
        const frac = srcPos - i0;
        resampled[j] = float32Samples[i0] + (float32Samples[i1] - float32Samples[i0]) * frac;
      }

      playbackSamples = resampled;
    }

    // 4. Create AudioBuffer and copy channel data
    const audioBuffer = this.audioContext.createBuffer(
      1,
      playbackSamples.length,
      targetSampleRate
    );
    audioBuffer.getChannelData(0).set(playbackSamples);

    // 5. Create AudioBufferSourceNode and connect to output
    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(this.audioContext.destination);

    // 6. Schedule playback back-to-back without gaps or overlaps
    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      // If queue ran dry or this is the first chunk, start immediately with tiny safety lead
      this.nextStartTime = currentTime + 0.02;
    }

    sourceNode.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    // 7. Track source node in activeSources
    this.activeSources.push(sourceNode);

    sourceNode.onended = () => {
      const idx = this.activeSources.indexOf(sourceNode);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
    };
  }

  /**
   * Instantly and synchronously stops all currently scheduled and playing audio.
   * Increments turnId so any delayed or in-flight chunks are dropped immediately.
   */
  hardStop() {
    // 1. Advance turn counter to invalidate any subsequent chunks from the interrupted turn
    this.currentTurnId++;

    // 2. Synchronously stop and disconnect every active AudioBufferSourceNode
    for (const source of this.activeSources) {
      try {
        source.stop(0);
        source.disconnect();
      } catch {
        // Safe to ignore if node already ended naturally
      }
    }

    // 3. Clear active sources list
    this.activeSources = [];

    // Module 8: Record audio stop timestamp when playback is silenced
    recordAudioStop();

    // 4. Reset nextStartTime to current context time
    this.nextStartTime = this.audioContext.currentTime;
  }

  /**
   * Resets the playback queue and running timestamp.
   */
  reset() {
    this.hardStop();
    this.nextStartTime = 0;
  }
}

/**
 * Factory function to create a new AudioPlaybackQueue instance.
 */
export function createPlaybackQueue() {
  return new AudioPlaybackQueue();
}
