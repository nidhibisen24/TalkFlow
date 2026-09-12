/**
 * audioCapture.js
 *
 * Captures microphone audio using getUserMedia, pipes it through
 * the PCMDownsampler AudioWorklet at 16kHz 16-bit PCM, and triggers
 * onChunk(arrayBuffer) for each ~32ms chunk.
 */

export async function startMicCapture(onChunk) {
  // 1. Request microphone stream with echo cancellation and noise suppression
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  // 2. Initialize AudioContext at browser's native sample rate
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();

  // If created before user interaction, resume context if suspended
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  // 3. Load the PCM downsampler worklet module
  const workletUrl = new URL(
    "../worklets/pcm-downsampler-worklet.js",
    import.meta.url
  ).href;

  try {
    await audioContext.audioWorklet.addModule(workletUrl);
  } catch {
    // Fallback to static public path if URL fails
    await audioContext.audioWorklet.addModule("/worklets/pcm-downsampler-worklet.js");
  }

  // 4. Create source and worklet nodes
  const sourceNode = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, "pcm-downsampler");

  // 5. Listen for downsampled 16-bit PCM ArrayBuffers from the worklet
  workletNode.port.onmessage = (event) => {
    if (typeof onChunk === "function" && event.data instanceof ArrayBuffer) {
      onChunk(event.data);
    }
  };

  // Connect microphone stream into the downsampler worklet
  sourceNode.connect(workletNode);

  // 6. Define cleanup/stop function
  const stop = async () => {
    try {
      workletNode.port.onmessage = null;
      sourceNode.disconnect();
      workletNode.disconnect();
    } catch {
      // Ignore disconnect errors during teardown
    }

    // Stop all media tracks to turn off recording indicator
    stream.getTracks().forEach((track) => track.stop());

    // Close AudioContext
    if (audioContext.state !== "closed") {
      try {
        await audioContext.close();
      } catch {
        // Ignore close errors
      }
    }
  };

  // Allow both direct function call `stop()` and object destructuring `{ stop }`
  stop.stop = stop;
  return stop;
}
