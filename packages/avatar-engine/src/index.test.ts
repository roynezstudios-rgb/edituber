import type { AudioEnvelopeFrame, AvatarManifestV1, EdituberProjectV1 } from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import { isBlinkClosedAtFrame, resolveAvatarAtFrame } from "./index";

const project = {
  schemaVersion: 1,
  fps: 30,
  seed: 7302026,
  avatar: { defaultExpression: "🙂" },
  expressionEvents: [{ frame: 0, emoji: "🙂" }],
  settings: {
    transitionFrames: 8,
    mouthSensitivity: 0.55,
    blinkEnabled: true,
    talkBounceEnabled: true,
    bouncePreset: "normal",
  },
} as EdituberProjectV1;

const manifest = {
  shell: "shell.svg",
  expressions: [
    {
      emoji: "🙂",
      blinkPolicy: "auto",
      states: {
        eyesOpenMouthClosed: "closed.svg",
        eyesOpenMouthOpen: "open.svg",
        eyesClosedMouthClosed: "blink.svg",
      },
    },
  ],
} as AvatarManifestV1;

describe("resolveAvatarAtFrame", () => {
  it("moves the complete avatar through one parent offset", () => {
    const audio = {
      voiceActive: true,
      mouthOpenAmount: 0.8,
      bounceAmount: 0.5,
    } as AudioEnvelopeFrame;
    const state = resolveAvatarAtFrame(project, manifest, audio, 10);
    expect(state.currentFace).toBe("open.svg");
    expect(state.bouncePixels).toBe(-7);
    expect(state.shell).toBe("shell.svg");
  });

  it("produces a deterministic blink schedule", () => {
    const frames = Array.from({ length: 300 }, (_, frame) =>
      isBlinkClosedAtFrame(frame, 30, 7302026),
    );
    expect(frames).toEqual(
      Array.from({ length: 300 }, (_, frame) => isBlinkClosedAtFrame(frame, 30, 7302026)),
    );
    expect(frames.some(Boolean)).toBe(true);
  });
});
