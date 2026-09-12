/**
 * PCMDownsamplerProcessor
 *
 * AudioWorkletProcessor that receives Float32 audio input at the browser's
 * native sample rate (e.g. 44.1kHz, 48kHz), downsamples it to 16kHz using linear
 * interpolation, converts samples to 16-bit signed PCM, and emits chunks of ~32ms
 * (512 samples / 1024 bytes) as transferable ArrayBuffers.
 */
class PCMDownsamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.inputSampleRate = sampleRate; // Provided by AudioWorkletGlobalScope
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;

    // Buffer accumulation (~32ms at 16kHz = 512 samples = 1024 bytes)
    this.bufferSize = 512;
    this.outputBuffer = new Int16Array(this.bufferSize);
    this.outputIndex = 0;

    // Resampling state preserved across process() quantum boundaries (128 samples)
    this.lastInputSample = 0;
    this.phase = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    let prevSample = this.lastInputSample;
    let phase = this.phase;
    const ratio = this.resampleRatio;

    for (let i = 0; i < channelData.length; i++) {
      const currentSample = channelData[i];

      // Interpolate any output samples that fall within [prevSample, currentSample]
      while (phase < 1.0) {
        // Linear interpolation
        const interpolated = prevSample + (currentSample - prevSample) * phase;

        // Clamp to [-1.0, 1.0] and convert to 16-bit signed PCM [-32768, 32767]
        const clamped = Math.max(-1, Math.min(1, interpolated));
        const pcm16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
        this.outputBuffer[this.outputIndex++] = Math.max(-32768, Math.min(32767, pcm16));

        // When buffer is full (~32ms / 512 samples / 1024 bytes), post to main thread
        if (this.outputIndex >= this.bufferSize) {
          const chunk = this.outputBuffer.buffer;
          this.port.postMessage(chunk, [chunk]);
          this.outputBuffer = new Int16Array(this.bufferSize);
          this.outputIndex = 0;
        }

        phase += ratio;
      }

      // Advance by 1 input sample interval
      phase -= 1.0;
      prevSample = currentSample;
    }

    this.lastInputSample = prevSample;
    this.phase = phase;

    return true;
  }
}

registerProcessor("pcm-downsampler", PCMDownsamplerProcessor);
