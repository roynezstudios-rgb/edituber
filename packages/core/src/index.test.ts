import { describe, expect, it } from "vitest";
import type { EdituberBundle } from "./index";
import { resolveFrameState, validateBundle } from "./index";

const bundle = {
  project: {
    schemaVersion: 1,
    projectId: "f86ff1e3-567d-4c44-97a0-71a444c8c51d",
    title: "Test",
    fps: 30,
    width: 1080,
    height: 1080,
    durationInFrames: 1,
    seed: 1,
    audio: { source: "audio.wav", durationSeconds: 1 / 30, envelope: "envelope.json" },
    stage: { backgroundType: "solid", backgroundColor: "#00FF00" },
    avatar: {
      manifest: "avatar.json",
      defaultExpression: "🙂",
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
    },
    expressionEvents: [{ frame: 0, emoji: "🙂" }],
    settings: {
      blinkEnabled: true,
      talkBounceEnabled: true,
      mouthSensitivity: 0.55,
      transitionFrames: 8,
      bouncePreset: "normal",
    },
  },
  avatar: {
    schemaVersion: 1,
    avatarId: "robot",
    name: "Robot fixture",
    canvas: { width: 800, height: 800 },
    shell: "shell.svg",
    defaultExpression: "🙂",
    expressions: [
      {
        id: "smile",
        emoji: "🙂",
        blinkPolicy: "auto",
        states: { eyesOpenMouthClosed: "closed.svg", eyesOpenMouthOpen: "open.svg" },
      },
    ],
  },
  envelope: {
    version: 1,
    fps: 30,
    sampleRate: 48_000,
    sourceHash: "fixture",
    frames: [
      {
        frame: 0,
        amplitudeRaw: 0,
        amplitudeSmoothed: 0,
        voiceActive: false,
        mouthOpenAmount: 0,
        emphasisPulse: 0,
        bounceAmount: 0,
      },
    ],
  },
  audioSource: "data:audio/wav;base64,UklGRg==",
} satisfies EdituberBundle;

describe("bundle", () => {
  it("validates and always resolves visible shell and face layers", () => {
    expect(validateBundle(bundle)).toEqual({ valid: true, errors: [] });
    const state = resolveFrameState(bundle, 0);
    expect(state.avatar.shell).toBeTruthy();
    expect(state.avatar.currentFace).toBeTruthy();
    expect(state.avatar.currentOpacity + state.avatar.previousOpacity).toBe(1);
  });
});
