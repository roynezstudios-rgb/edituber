import { describe, expect, it } from "vitest";
import { analyzeSamples } from "./index";

describe("analyzeSamples", () => {
  it("closes the mouth in silence and produces deterministic frames", () => {
    const sampleRate = 3_000;
    const samples = new Float32Array(sampleRate * 2);
    for (let index = sampleRate / 2; index < sampleRate; index += 1) {
      samples[index] = Math.sin(index * 0.2) * 0.7;
    }
    const options = { fps: 30, sampleRate, sourceHash: "fixture" };
    const first = analyzeSamples(samples, options);
    const second = analyzeSamples(samples, options);
    expect(first).toEqual(second);
    expect(first.frames[0]?.mouthOpenAmount).toBe(0);
    expect(first.frames.some((frame) => frame.voiceActive)).toBe(true);
    expect(first.frames.at(-1)?.mouthOpenAmount).toBe(0);
  });
});
