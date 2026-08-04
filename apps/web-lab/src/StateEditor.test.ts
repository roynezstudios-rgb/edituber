import { validateAvatarManifest } from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import {
  draftFromState,
  draftWithoutBlinkImages,
  draftWithoutMouthImages,
  stateFromDraft,
} from "./StateEditor";

const stateId = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const isValid = (state: ReturnType<typeof stateFromDraft>) =>
  validateAvatarManifest({
    schemaVersion: 2,
    avatarId: "avatar",
    name: "Editor",
    canvas: { width: 800, height: 800 },
    shell: "shell.svg",
    defaultStateId: stateId,
    states: [state],
  }).valid;

describe("progressive state editor model", () => {
  it("builds and round-trips modes 1, 2, and 4 without losing effects", () => {
    const simpleDraft = { ...draftFromState(), id: stateId, openClosed: "base.png" };
    const simple = stateFromDraft(simpleDraft);
    expect(isValid(simple)).toBe(true);
    expect(simple.images.eyesOpen.mouthOpen).toBeUndefined();

    const mouth = stateFromDraft({
      ...simpleDraft,
      mouthEnabled: true,
      openOpen: "talk.png",
    });
    expect(isValid(mouth)).toBe(true);
    expect(mouth.images.eyesOpen.mouthOpen).toBe("talk.png");

    const complete = stateFromDraft({
      ...simpleDraft,
      mouthEnabled: true,
      blinkEnabled: true,
      blinkPolicy: "auto",
      openOpen: "talk.png",
      closedClosed: "blink.png",
      closedOpen: "blink-talk.png",
    });
    expect(isValid(complete)).toBe(true);
    expect(complete.images.eyesClosed?.mouthOpen).toBe("blink-talk.png");
    expect(draftFromState(complete).effects).toEqual(complete.effects);
  });

  it("refuses zero-image, incomplete mouth, and three-image drafts", () => {
    const base = { ...draftFromState(), id: stateId };
    expect(() => stateFromDraft(base)).toThrow("base");
    expect(() => stateFromDraft({ ...base, openClosed: "base.png", mouthEnabled: true })).toThrow(
      "hablar",
    );
    expect(() =>
      stateFromDraft({
        ...base,
        openClosed: "base.png",
        mouthEnabled: true,
        openOpen: "talk.png",
        blinkEnabled: true,
        closedClosed: "blink.png",
      }),
    ).toThrow("cuatro");
  });

  it("requires confirmation before discarding progressive image blocks", () => {
    const complete = {
      ...draftFromState(),
      openClosed: "base.png",
      mouthEnabled: true,
      openOpen: "talk.png",
      blinkEnabled: true,
      closedClosed: "blink.png",
      closedOpen: "blink-talk.png",
    };
    expect(draftWithoutBlinkImages(complete, () => false)).toBeNull();
    expect(draftWithoutMouthImages(complete, () => false)).toBeNull();
    expect(draftWithoutBlinkImages(complete, () => true)).toMatchObject({
      mouthEnabled: true,
      blinkEnabled: false,
      closedClosed: "",
      closedOpen: "",
    });
    expect(draftWithoutMouthImages(complete, () => true)).toMatchObject({
      mouthEnabled: false,
      blinkEnabled: false,
      openOpen: "",
      closedClosed: "",
      closedOpen: "",
    });
  });

  it("refuses non-finite and out-of-range blink settings", () => {
    const base = { ...draftFromState(), id: stateId, openClosed: "base.png" };
    expect(() =>
      stateFromDraft({
        ...base,
        blink: { ...base.blink, durationMilliseconds: Number.POSITIVE_INFINITY },
      }),
    ).toThrow("fuera de rango");
    expect(() =>
      stateFromDraft({
        ...base,
        blink: { ...base.blink, intervalMinSeconds: 0.1 },
      }),
    ).toThrow("fuera de rango");
  });
});
