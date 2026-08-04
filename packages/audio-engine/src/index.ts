import type { AudioEnvelopeFrame, AudioEnvelopeV1 } from "@edituber/contracts";

export interface AnalyzeAudioOptions {
  fps: number;
  sampleRate: number;
  sourceHash: string;
  threshold?: number;
  hysteresis?: number;
  attack?: number;
  release?: number;
  minimumPulseIntervalFrames?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number): number => Number(value.toFixed(6));

const percentile = (values: number[], position: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * position))] ?? 0;
};

export const analyzeSamples = (
  samples: Float32Array,
  options: AnalyzeAudioOptions,
): AudioEnvelopeV1 => {
  const samplesPerFrame = options.sampleRate / options.fps;
  const frameCount = Math.max(1, Math.ceil(samples.length / samplesPerFrame));
  const rmsValues: number[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = Math.floor(frame * samplesPerFrame);
    const end = Math.min(samples.length, Math.floor((frame + 1) * samplesPerFrame));
    let sumSquares = 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index] ?? 0;
      sumSquares += sample * sample;
    }
    rmsValues.push(Math.sqrt(sumSquares / Math.max(1, end - start)));
  }

  const noiseFloor = Math.min(percentile(rmsValues, 0.12), 0.03);
  const signalPeak = Math.max(percentile(rmsValues, 0.95), noiseFloor + 0.0001);
  const threshold = options.threshold ?? 0.09;
  const hysteresis = options.hysteresis ?? 0.035;
  const attack = options.attack ?? 0.62;
  const release = options.release ?? 0.24;
  const pulseInterval =
    options.minimumPulseIntervalFrames ?? Math.max(5, Math.round(options.fps * 0.22));
  const frames: AudioEnvelopeFrame[] = [];
  let smoothed = 0;
  let voiceActive = false;
  let previousSmoothed = 0;
  let lastPulseFrame = -pulseInterval;
  let pulse = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const amplitudeRaw = clamp01(
      ((rmsValues[frame] ?? 0) - noiseFloor) / (signalPeak - noiseFloor),
    );
    const smoothing = amplitudeRaw > smoothed ? attack : release;
    smoothed += (amplitudeRaw - smoothed) * smoothing;

    if (voiceActive) voiceActive = smoothed >= Math.max(0, threshold - hysteresis);
    else voiceActive = smoothed >= threshold;

    const rising = smoothed - previousSmoothed;
    const mayPulse = frame - lastPulseFrame >= pulseInterval;
    if (
      voiceActive &&
      mayPulse &&
      (rising > 0.12 || (previousSmoothed < threshold && smoothed >= threshold))
    ) {
      pulse = clamp01(0.55 + rising * 2.4);
      lastPulseFrame = frame;
    } else {
      pulse *= 0.58;
    }

    const mouthOpenAmount = voiceActive
      ? clamp01((smoothed - threshold * 0.45) / Math.max(0.1, 1 - threshold * 0.45))
      : 0;
    const bounceAmount = voiceActive ? pulse : 0;

    frames.push({
      frame,
      amplitudeRaw: round(amplitudeRaw),
      amplitudeSmoothed: round(smoothed),
      voiceActive,
      mouthOpenAmount: round(mouthOpenAmount),
      emphasisPulse: round(pulse),
      bounceAmount: round(bounceAmount),
    });
    previousSmoothed = smoothed;
  }

  return {
    version: 1,
    fps: options.fps,
    sampleRate: options.sampleRate,
    sourceHash: options.sourceHash,
    frames,
  };
};

export const analyzeAudioBuffer = async (
  buffer: ArrayBuffer,
  fps: number,
  sourceHash = "browser-upload",
): Promise<AudioEnvelopeV1> => {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const mixed = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) {
        mixed[index] = (mixed[index] ?? 0) + (data[index] ?? 0) / decoded.numberOfChannels;
      }
    }
    return analyzeSamples(mixed, { fps, sampleRate: decoded.sampleRate, sourceHash });
  } finally {
    await context.close();
  }
};
