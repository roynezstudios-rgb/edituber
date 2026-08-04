import { describe, expect, it } from "vitest";
import {
  evaluateFreeDesktopAudioInsertion,
  FREE_DESKTOP_AUDIO_POLICY,
  FREE_DESKTOP_SHORT_CLIP_WARNING,
} from "./product-policy";

describe("future free desktop audio policy", () => {
  it("requires one rewarded permit for every successful insertion", () => {
    expect(evaluateFreeDesktopAudioInsertion(60, false)).toEqual({
      allowed: false,
      reason: "reward-required",
    });
    expect(evaluateFreeDesktopAudioInsertion(60, true)).toEqual({
      allowed: true,
      consumePermit: true,
      warnAboutUnusedWindow: false,
    });
  });

  it("consumes the complete window even when the clip is short", () => {
    expect(evaluateFreeDesktopAudioInsertion(15, true)).toEqual({
      allowed: true,
      consumePermit: true,
      warnAboutUnusedWindow: true,
    });
    expect(FREE_DESKTOP_AUDIO_POLICY.carryUnusedSeconds).toBe(false);
    expect(FREE_DESKTOP_SHORT_CLIP_WARNING).toContain("próximo fragmento requerirá otro anuncio");
  });

  it("rejects clips over one minute without consuming a valid permit", () => {
    expect(evaluateFreeDesktopAudioInsertion(60.01, true)).toEqual({
      allowed: false,
      reason: "clip-too-long",
    });
  });
});
