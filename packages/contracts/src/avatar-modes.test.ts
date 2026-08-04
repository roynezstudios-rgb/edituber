import { describe, expect, it } from "vitest";
import { defaultEffect, emptyAvatarEffects } from "./defaults";
import type { AvatarEffect, AvatarManifestV2, AvatarState } from "./types";
import { validateAvatarManifest } from "./validate";

const stateId = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const baseState = {
  id: stateId,
  name: "Estado",
  emoji: "🙂",
  blinkPolicy: "disabled",
} as const;
const manifest = (state: unknown): AvatarManifestV2 =>
  ({
    schemaVersion: 2,
    avatarId: "avatar",
    name: "Prueba",
    canvas: { width: 800, height: 800 },
    shell: "shell.svg",
    defaultStateId: stateId,
    states: [state],
  }) as AvatarManifestV2;

describe("avatar image modes and parameter bounds", () => {
  it.each([
    ["one", { eyesOpen: { mouthClosed: "base.png" } }],
    ["two", { eyesOpen: { mouthClosed: "base.png", mouthOpen: "talk.png" } }],
    [
      "four",
      {
        eyesOpen: { mouthClosed: "base.png", mouthOpen: "talk.png" },
        eyesClosed: { mouthClosed: "blink.png", mouthOpen: "blink-talk.png" },
      },
    ],
  ])("accepts %s-image states", (_, images) => {
    expect(validateAvatarManifest(manifest({ ...baseState, images })).valid).toBe(true);
  });

  it.each([
    ["zero", { eyesOpen: {} }],
    [
      "three",
      {
        eyesOpen: { mouthClosed: "base.png", mouthOpen: "talk.png" },
        eyesClosed: { mouthClosed: "blink.png" },
      },
    ],
    [
      "more than four",
      {
        eyesOpen: { mouthClosed: "base.png", mouthOpen: "talk.png", extra: "bad.png" },
        eyesClosed: { mouthClosed: "blink.png", mouthOpen: "blink-talk.png" },
      },
    ],
  ])("rejects %s-image structures", (_, images) => {
    expect(validateAvatarManifest(manifest({ ...baseState, images })).valid).toBe(false);
  });

  it("rejects inverted blink intervals and unsafe effect frequencies", () => {
    const invalidBlink = {
      ...baseState,
      blinkPolicy: "auto",
      blink: {
        intervalMinSeconds: 5,
        intervalMaxSeconds: 2,
        durationMilliseconds: 130,
        syncAnimatedImages: true,
        playAnimationToEnd: false,
      },
      images: {
        eyesOpen: { mouthClosed: "base.png", mouthOpen: "talk.png" },
        eyesClosed: { mouthClosed: "blink.png", mouthOpen: "blink-talk.png" },
      },
    };
    expect(validateAvatarManifest(manifest(invalidBlink)).errors.join(" ")).toContain("minimum");

    const invalidEffect = {
      ...baseState,
      effects: {
        mouthClosed: [
          {
            id: "18518776-1336-4e22-85fa-6784945ae28c",
            type: "waveMove",
            enabled: true,
            preset: "custom",
            amountX: 2,
            amountY: 2,
            periodSeconds: 0,
            phaseOffset: Number.POSITIVE_INFINITY,
          },
        ],
        mouthOpen: [],
        closedToOpen: [],
        openToClosed: [],
        stateEnter: [],
      },
      images: { eyesOpen: { mouthClosed: "base.png" } },
    } as unknown as AvatarState;
    expect(validateAvatarManifest(manifest(invalidEffect)).valid).toBe(false);
  });

  it.each([
    ["randomMove", "velocity", 0],
    ["waveMove", "periodSeconds", 0],
    ["jump", "frequencyHz", 0],
    ["waveRotate", "periodSeconds", 0],
    ["darken", "amount", 1],
    ["squashStretch", "frequencyHz", 0],
    ["emphasis", "durationMilliseconds", 0],
  ] as const)("rejects unsafe %s.%s values", (type, key, value) => {
    const effects = emptyAvatarEffects();
    effects.mouthClosed.push({
      ...defaultEffect(type, "18518776-1336-4e22-85fa-6784945ae28c"),
      [key]: value,
    } as AvatarEffect);
    expect(
      validateAvatarManifest(
        manifest({
          ...baseState,
          effects,
          images: { eyesOpen: { mouthClosed: "base.png" } },
        }),
      ).valid,
    ).toBe(false);
  });
});
