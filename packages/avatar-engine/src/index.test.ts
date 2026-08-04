import type {
  AudioEnvelopeFrame,
  AvatarManifestV2,
  AvatarState,
  EdituberProjectV2,
} from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import { isBlinkClosedAtFrame, resolveAvatarAtFrame, resolveStateImage } from "./index";

const stateId = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const project = {
  schemaVersion: 2,
  fps: 30,
  seed: 7302026,
  avatar: { defaultStateId: stateId },
  stateEvents: [{ frame: 0, stateId }],
  settings: {
    transitionFrames: 8,
    mouthSensitivity: 0.55,
    blinkEnabled: true,
    talkBounceEnabled: true,
    bouncePreset: "normal",
  },
} as EdituberProjectV2;
const avatarState: AvatarState = {
  id: stateId,
  name: "Smile",
  emoji: "🙂",
  blinkPolicy: "auto",
  motionPreset: "idle",
  images: {
    eyesOpen: { mouthClosed: "closed.svg", mouthOpen: "open.svg" },
    eyesClosed: { mouthClosed: "blink.svg", mouthOpen: "blink-open.svg" },
  },
};
const manifest = { shell: "shell.svg", states: [avatarState] } as AvatarManifestV2;

describe("avatar state resolver", () => {
  it("selects all four complete image combinations and falls back for two-image states", () => {
    expect(resolveStateImage(avatarState, false, false)).toBe("closed.svg");
    expect(resolveStateImage(avatarState, true, false)).toBe("open.svg");
    expect(resolveStateImage(avatarState, false, true)).toBe("blink.svg");
    expect(resolveStateImage(avatarState, true, true)).toBe("blink-open.svg");
    expect(
      resolveStateImage(
        { ...avatarState, images: { eyesOpen: avatarState.images.eyesOpen } },
        false,
        true,
      ),
    ).toBe("closed.svg");
  });

  it("moves and squashes the complete avatar through one parent transform", () => {
    const audio = {
      voiceActive: true,
      mouthOpenAmount: 0.8,
      bounceAmount: 0.5,
      emphasisPulse: 0.4,
    } as AudioEnvelopeFrame;
    const state = resolveAvatarAtFrame(project, manifest, audio, 10);
    expect(state.currentFace).toBe("open.svg");
    expect(state.transform.translateY).toBeLessThan(0);
    expect(state.transform.scaleX).toBeGreaterThan(state.transform.scaleY);
    expect(state.shell).toBe("shell.svg");
  });

  it("produces deterministic blink and motion schedules", () => {
    const frames = Array.from({ length: 300 }, (_, frame) =>
      isBlinkClosedAtFrame(frame, 30, 7302026),
    );
    expect(frames).toEqual(
      Array.from({ length: 300 }, (_, frame) => isBlinkClosedAtFrame(frame, 30, 7302026)),
    );
    expect(frames.some(Boolean)).toBe(true);
    const first = resolveAvatarAtFrame(project, manifest, undefined, 42).transform;
    expect(resolveAvatarAtFrame(project, manifest, undefined, 42).transform).toEqual(first);
  });
});
