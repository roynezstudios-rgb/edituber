import type { AvatarEffect, AvatarEffects, AvatarTransition, BlinkSettings } from "./types";

export const defaultBlinkSettings = (): BlinkSettings => ({
  intervalMinSeconds: 2.3,
  intervalMaxSeconds: 5,
  durationMilliseconds: 130,
  syncAnimatedImages: true,
  playAnimationToEnd: false,
});

export const emptyAvatarEffects = (): AvatarEffects => ({
  mouthClosed: [],
  mouthOpen: [],
  closedToOpen: [],
  openToClosed: [],
  stateEnter: [],
});

export const defaultEffect = (type: AvatarEffect["type"], id: string): AvatarEffect => {
  switch (type) {
    case "randomMove":
      return { id, type, enabled: true, preset: "relaxed", amount: 4, velocity: 0.7 };
    case "waveMove":
      return {
        id,
        type,
        enabled: true,
        preset: "breathing",
        amountX: 0,
        amountY: 4,
        periodSeconds: 2.4,
        phaseOffset: 0,
      };
    case "jump":
      return {
        id,
        type,
        enabled: true,
        preset: "bouncy",
        amountX: 0,
        amountY: 14,
        frequencyHz: 1.8,
      };
    case "waveRotate":
      return {
        id,
        type,
        enabled: true,
        preset: "swaying",
        amountDegrees: 2,
        periodSeconds: 2.8,
        phaseOffset: 0,
      };
    case "darken":
      return { id, type, enabled: true, preset: "custom", amount: 0.2 };
    case "squashStretch":
      return {
        id,
        type,
        enabled: true,
        preset: "custom",
        amount: 0.05,
        frequencyHz: 2,
        axisBalance: 0.5,
      };
    case "emphasis":
      return {
        id,
        type,
        enabled: true,
        preset: "custom",
        amount: 0.7,
        durationMilliseconds: 180,
        cooldownMilliseconds: 250,
      };
  }
};

export const defaultTransition = (
  type: AvatarTransition["type"],
  id: string,
): AvatarTransition => ({
  id,
  type,
  enabled: true,
  amount: type === "stateEnter" ? 18 : 14,
  durationMilliseconds: type === "stateEnter" ? 280 : 180,
});
