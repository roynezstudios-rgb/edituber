import type {
  AudioEnvelopeFrame,
  AvatarEffects,
  AvatarManifestV2,
  AvatarState,
  EdituberProjectV2,
} from "@edituber/contracts";
import { defaultEffect, emptyAvatarEffects } from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import {
  deriveStateSeed,
  isBlinkClosedAtFrame,
  resolveAvatarAtFrame,
  resolveAvatarEffects,
  resolveStateImage,
} from "./index";

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
    motionScale: 1,
  },
} as EdituberProjectV2;
const fourImageState: AvatarState = {
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
const manifest = { shell: "shell.svg", states: [fourImageState] } as AvatarManifestV2;
const resolverInput = (state: AvatarState, overrides = {}) => ({
  state,
  frame: 6,
  fps: 30,
  isSpeaking: false,
  voiceChange: null,
  voiceChangeFrame: -1,
  stateEnterFrame: -1,
  emphasisPulse: 0,
  emphasisFrames: [],
  seed: 7302026,
  motionScale: 1,
  ...overrides,
});

describe("avatar image modes", () => {
  it("uses one base asset for voice and silence while switching effect groups", () => {
    const effects = emptyAvatarEffects();
    effects.mouthClosed.push({
      id: "18518776-1336-4e22-85fa-6784945ae28c",
      type: "darken",
      enabled: true,
      preset: "custom",
      amount: 0.4,
    });
    effects.mouthOpen.push({
      id: "02a21d60-704f-411a-93e6-5c86ea9a36e8",
      type: "jump",
      enabled: true,
      preset: "happy",
      amountX: 0,
      amountY: 24,
      frequencyHz: 2,
    });
    const simple: AvatarState = {
      ...fourImageState,
      blinkPolicy: "disabled",
      effects,
      images: { eyesOpen: { mouthClosed: "only.png" } },
    };
    expect(resolveStateImage(simple, false, false)).toBe("only.png");
    expect(resolveStateImage(simple, true, true)).toBe("only.png");
    const silent = resolveAvatarEffects(resolverInput(simple));
    const speaking = resolveAvatarEffects(resolverInput(simple, { isSpeaking: true }));
    expect(silent.brightness).toBeCloseTo(0.6);
    expect(speaking.brightness).toBe(1);
    expect(speaking.translateY).not.toBe(silent.translateY);
  });

  it("changes the mouth in two-image mode and never invents a blink", () => {
    const two: AvatarState = {
      ...fourImageState,
      images: { eyesOpen: { mouthClosed: "closed.svg", mouthOpen: "open.svg" } },
    };
    expect(resolveStateImage(two, false, true)).toBe("closed.svg");
    expect(resolveStateImage(two, true, true)).toBe("open.svg");
  });

  it("resolves all four combinations from the recording-wide blink signal", () => {
    expect(resolveStateImage(fourImageState, false, false)).toBe("closed.svg");
    expect(resolveStateImage(fourImageState, true, false)).toBe("open.svg");
    expect(resolveStateImage(fourImageState, false, true)).toBe("blink.svg");
    expect(resolveStateImage(fourImageState, true, true)).toBe("blink-open.svg");
    expect(resolveStateImage({ ...fourImageState, blinkPolicy: "disabled" }, false, true)).toBe(
      "blink.svg",
    );
  });
});

describe("deterministic blink, effects, and transitions", () => {
  it("uses one project blink configuration across every state", () => {
    const globalBlink = {
      intervalMinSeconds: 1,
      intervalMaxSeconds: 1,
      durationMilliseconds: 300,
      syncAnimatedImages: true,
      playAnimationToEnd: false,
    };
    const stateWithLegacyOverride = {
      ...fourImageState,
      blinkPolicy: "disabled" as const,
      blink: { ...globalBlink, intervalMinSeconds: 10, intervalMaxSeconds: 10 },
    };
    const result = resolveAvatarAtFrame(
      { ...project, settings: { ...project.settings, blink: globalBlink } },
      { ...manifest, states: [stateWithLegacyOverride] },
      undefined,
      30,
    );
    expect(result.eyesClosed).toBe(true);
    expect(result.currentFace).toBe("blink.svg");
  });

  it("gives recording-wide project effects priority over state-specific effects", () => {
    const stateEffects = emptyAvatarEffects();
    stateEffects.mouthClosed = [
      {
        id: "1c3bb0fc-7597-4478-b568-e3c5aa43773f",
        type: "darken",
        enabled: true,
        preset: "custom",
        amount: 0.7,
      },
    ];
    const recordingEffects = emptyAvatarEffects();
    recordingEffects.mouthClosed = [
      {
        id: "54ee2f5f-f4bb-46ba-a322-f7da817be4c7",
        type: "darken",
        enabled: true,
        preset: "custom",
        amount: 0.2,
      },
    ];
    const result = resolveAvatarAtFrame(
      { ...project, effects: recordingEffects },
      { ...manifest, states: [{ ...fourImageState, effects: stateEffects }] },
      undefined,
      6,
    );
    expect(result.transform.brightness).toBeCloseTo(0.8);
  });

  it("derives a stable per-state seed from the project seed", () => {
    expect(deriveStateSeed(7302026, stateId)).toBe(deriveStateSeed(7302026, stateId));
    expect(deriveStateSeed(7302026, stateId)).not.toBe(
      deriveStateSeed(7302026, "5be1f67b-8ae1-47b7-b3ce-c49f297bff8a"),
    );
  });

  it("uses configurable deterministic blink intervals and duration", () => {
    const settings = {
      intervalMinSeconds: 1,
      intervalMaxSeconds: 1.2,
      durationMilliseconds: 300,
      syncAnimatedImages: true,
      playAnimationToEnd: false,
    };
    const frames = Array.from({ length: 180 }, (_, frame) =>
      isBlinkClosedAtFrame(frame, 30, 7302026, settings),
    );
    expect(frames).toEqual(
      Array.from({ length: 180 }, (_, frame) => isBlinkClosedAtFrame(frame, 30, 7302026, settings)),
    );
    expect(frames.filter(Boolean).length).toBeGreaterThan(10);
    const fixed = {
      ...settings,
      intervalMinSeconds: 1,
      intervalMaxSeconds: 1,
    };
    expect(
      Array.from({ length: 45 }, (_, frame) => isBlinkClosedAtFrame(frame, 30, 1, fixed)),
    ).toEqual(Array.from({ length: 45 }, (_, frame) => frame >= 30 && frame < 39));
  });

  it("composes several effects in stable order without overwriting transforms", () => {
    const effects: AvatarEffects = emptyAvatarEffects();
    effects.mouthClosed = [
      defaultEffect("randomMove", "18518776-1336-4e22-85fa-6784945ae28c"),
      defaultEffect("waveMove", "02a21d60-704f-411a-93e6-5c86ea9a36e8"),
      defaultEffect("waveRotate", "5be1f67b-8ae1-47b7-b3ce-c49f297bff8a"),
      defaultEffect("squashStretch", "7d935dc7-a1ae-4337-92ef-f1c4e90aa6e8"),
    ];
    const state = { ...fourImageState, effects };
    const first = resolveAvatarEffects(resolverInput(state, { frame: 42 }));
    const second = resolveAvatarEffects(resolverInput(state, { frame: 42 }));
    expect(second).toEqual(first);
    expect(first.translateX).not.toBe(0);
    expect(first.translateY).not.toBe(0);
    expect(first.rotation).not.toBe(0);
    expect(first.scaleX).not.toBe(1);
  });

  it("fires voice edges and state entry only inside their bounded windows", () => {
    const effects = emptyAvatarEffects();
    effects.closedToOpen = [
      {
        id: "18518776-1336-4e22-85fa-6784945ae28c",
        type: "jump",
        enabled: true,
        amount: 20,
        durationMilliseconds: 200,
      },
    ];
    effects.openToClosed = [
      {
        id: "02a21d60-704f-411a-93e6-5c86ea9a36e8",
        type: "jump",
        enabled: true,
        amount: 12,
        durationMilliseconds: 200,
      },
    ];
    effects.stateEnter = [
      {
        id: "5be1f67b-8ae1-47b7-b3ce-c49f297bff8a",
        type: "stateEnter",
        enabled: true,
        amount: 15,
        durationMilliseconds: 300,
      },
    ];
    const state = { ...fourImageState, effects };
    const opening = resolveAvatarEffects(
      resolverInput(state, {
        frame: 3,
        isSpeaking: true,
        voiceChange: "closedToOpen",
        voiceChangeFrame: 0,
        stateEnterFrame: -1,
      }),
    );
    const closing = resolveAvatarEffects(
      resolverInput(state, {
        frame: 3,
        voiceChange: "openToClosed",
        voiceChangeFrame: 0,
        stateEnterFrame: -1,
      }),
    );
    const entered = resolveAvatarEffects(
      resolverInput(state, { frame: 3, voiceChange: null, stateEnterFrame: 0 }),
    );
    const finished = resolveAvatarEffects(
      resolverInput(state, {
        frame: 30,
        voiceChange: "closedToOpen",
        voiceChangeFrame: 0,
        stateEnterFrame: 0,
      }),
    );
    expect(opening.transitionActive).toBe(true);
    expect(closing.transitionActive).toBe(true);
    expect(entered.transitionActive).toBe(true);
    expect(finished.transitionActive).toBe(false);
  });

  it("honors emphasis duration and cooldown and keeps legacy renderer behavior", () => {
    const effects = emptyAvatarEffects();
    effects.mouthOpen = [
      {
        id: "18518776-1336-4e22-85fa-6784945ae28c",
        type: "emphasis",
        enabled: true,
        preset: "custom",
        amount: 1,
        durationMilliseconds: 200,
        cooldownMilliseconds: 500,
      },
    ];
    const state = { ...fourImageState, effects };
    const active = resolveAvatarEffects(
      resolverInput(state, {
        frame: 3,
        isSpeaking: true,
        emphasisPulse: 1,
        emphasisFrames: [0, 4],
      }),
    );
    const expired = resolveAvatarEffects(
      resolverInput(state, {
        frame: 10,
        isSpeaking: true,
        emphasisPulse: 1,
        emphasisFrames: [0, 4],
      }),
    );
    expect(active.scaleY).toBeGreaterThan(1);
    expect(expired.scaleY).toBe(1);

    const audio = {
      voiceActive: true,
      mouthOpenAmount: 0.8,
      bounceAmount: 0.5,
      emphasisPulse: 0.4,
    } as AudioEnvelopeFrame;
    const legacy = resolveAvatarAtFrame(project, manifest, audio, 10);
    expect(legacy.currentFace).toBe("open.svg");
    expect(legacy.transform.translateY).toBeLessThan(0);
  });
});
