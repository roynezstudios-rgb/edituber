import { describe, expect, it } from "vitest";
import type { EdituberBundle } from "./index";
import { resolveFrameState, validateBundle } from "./index";

const stateId = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const bundle = {
  project: {
    schemaVersion: 2,
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
      defaultStateId: stateId,
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
    },
    stateEvents: [{ frame: 0, stateId }],
    settings: {
      blinkEnabled: true,
      talkBounceEnabled: true,
      mouthSensitivity: 0.55,
      transitionFrames: 8,
      bouncePreset: "normal",
    },
  },
  avatar: {
    schemaVersion: 2,
    avatarId: "robot",
    name: "Robot fixture",
    canvas: { width: 800, height: 800 },
    shell: "shell.svg",
    defaultStateId: stateId,
    states: [
      {
        id: stateId,
        name: "Smile",
        emoji: "🙂",
        blinkPolicy: "auto",
        images: { eyesOpen: { mouthClosed: "closed.svg", mouthOpen: "open.svg" } },
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
    expect(state.avatarVisible).toBe(true);
    expect(state.avatar.shell).toBeTruthy();
    expect(state.avatar.currentFace).toBeTruthy();
    expect(state.avatar.currentOpacity + state.avatar.previousOpacity).toBe(1);
  });

  it("can hide the avatar while keeping its state library intact", () => {
    const hidden = resolveFrameState(
      {
        ...bundle,
        project: { ...bundle.project, avatar: { ...bundle.project.avatar, visible: false } },
      },
      0,
    );
    expect(hidden.avatarVisible).toBe(false);
    expect(hidden.avatar.currentFace).toBeTruthy();
  });

  it("alternates the mouth during one continuous voice segment", () => {
    const silent = bundle.envelope.frames[0];
    if (!silent) throw new Error("Test fixture is incomplete");
    const voice = {
      ...silent,
      voiceActive: true,
      mouthOpenAmount: 0.8,
      amplitudeRaw: 0.8,
      amplitudeSmoothed: 0.8,
    };
    const loopBundle: EdituberBundle = {
      ...bundle,
      project: {
        ...bundle.project,
        fps: 10,
        durationInFrames: 6,
        audio: { ...bundle.project.audio, durationSeconds: 0.6 },
        settings: {
          ...bundle.project.settings,
          mouthLoop: { enabled: true, openMilliseconds: 200, closedMilliseconds: 100 },
        },
      },
      envelope: {
        ...bundle.envelope,
        fps: 10,
        frames: Array.from({ length: 6 }, (_, frame) => ({ ...voice, frame })),
      },
    };
    expect(
      [0, 1, 2, 3, 4, 5].map((frame) => resolveFrameState(loopBundle, frame).avatar.mouthOpen),
    ).toEqual([true, true, false, true, true, false]);
  });

  it("returns identical shared Web Lab and renderer samples for the same frames", () => {
    const effects = {
      mouthClosed: [
        {
          id: "18518776-1336-4e22-85fa-6784945ae28c",
          type: "randomMove" as const,
          enabled: true,
          preset: "shaking" as const,
          amount: 10,
          velocity: 3,
        },
      ],
      mouthOpen: [],
      closedToOpen: [],
      openToClosed: [],
      stateEnter: [],
    };
    const frame = bundle.envelope.frames[0];
    const avatarState = bundle.avatar.states[0];
    if (!frame || !avatarState) throw new Error("Test fixture is incomplete");
    const sharedBundle: EdituberBundle = {
      ...bundle,
      avatar: {
        ...bundle.avatar,
        states: [{ ...avatarState, effects }],
      },
      project: { ...bundle.project, durationInFrames: 4 },
      envelope: { ...bundle.envelope, frames: [frame, frame, frame, frame] },
    };
    const webSamples = [0, 1, 2, 3].map((sample) => resolveFrameState(sharedBundle, sample));
    const rendererSamples = [0, 1, 2, 3].map((sample) => resolveFrameState(sharedBundle, sample));
    expect(rendererSamples).toEqual(webSamples);
    expect(webSamples[3]?.avatar.transform.translateX).not.toBe(0);
  });
});
