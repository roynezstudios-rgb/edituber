import type {
  AudioEnvelopeFrame,
  AvatarExpression,
  AvatarFaceStates,
  AvatarManifestV1,
  BouncePreset,
  EdituberProjectV1,
} from "@edituber/contracts";
import { resolveExpressionAtFrame } from "@edituber/timeline-engine";

export interface AvatarLayerState {
  shell: string;
  currentFace: string;
  previousFace: string | null;
  currentOpacity: number;
  previousOpacity: number;
  mouthOpen: boolean;
  eyesClosed: boolean;
  bouncePixels: number;
  emoji: string;
}

const bouncePixels: Record<BouncePreset, number> = { soft: 7, normal: 14, emphasis: 22 };

const seededUnit = (seed: number, index: number): number => {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4_294_967_296;
};

export const isBlinkClosedAtFrame = (frame: number, fps: number, seed: number): boolean => {
  let cursor = Math.round(fps * (1.8 + seededUnit(seed, 0) * 1.1));
  for (let blinkIndex = 1; cursor <= frame + 1; blinkIndex += 1) {
    const duration = Math.max(2, Math.round(fps * 0.13));
    if (frame >= cursor && frame < cursor + duration) return true;
    cursor += Math.round(fps * (2.3 + seededUnit(seed, blinkIndex) * 2.7));
  }
  return false;
};

const expressionByEmoji = (manifest: AvatarManifestV1, emoji: string): AvatarExpression => {
  const expression = manifest.expressions.find((candidate) => candidate.emoji === emoji);
  if (!expression) throw new Error(`Avatar does not define expression ${emoji}`);
  return expression;
};

const selectFace = (states: AvatarFaceStates, eyesClosed: boolean, mouthOpen: boolean): string => {
  if (eyesClosed && mouthOpen) return states.eyesClosedMouthOpen ?? states.eyesOpenMouthOpen;
  if (eyesClosed) return states.eyesClosedMouthClosed ?? states.eyesOpenMouthClosed;
  if (mouthOpen) return states.eyesOpenMouthOpen;
  return states.eyesOpenMouthClosed;
};

export const resolveAvatarAtFrame = (
  project: EdituberProjectV1,
  manifest: AvatarManifestV1,
  envelopeFrame: AudioEnvelopeFrame | undefined,
  frame: number,
): AvatarLayerState => {
  const timeline = resolveExpressionAtFrame(
    frame,
    project.expressionEvents,
    project.avatar.defaultExpression,
    project.settings.transitionFrames,
  );
  const expression = expressionByEmoji(manifest, timeline.currentEmoji);
  const adjustedMouth =
    (envelopeFrame?.mouthOpenAmount ?? 0) * (0.55 + project.settings.mouthSensitivity);
  const mouthOpen = Boolean(envelopeFrame?.voiceActive) && adjustedMouth >= 0.16;
  const eyesClosed =
    project.settings.blinkEnabled &&
    expression.blinkPolicy === "auto" &&
    isBlinkClosedAtFrame(frame, project.fps, project.seed);
  const previousExpression = timeline.previousEmoji
    ? expressionByEmoji(manifest, timeline.previousEmoji)
    : null;
  const bounce = project.settings.talkBounceEnabled
    ? -Math.round((envelopeFrame?.bounceAmount ?? 0) * bouncePixels[project.settings.bouncePreset])
    : 0;

  return {
    shell: manifest.shell,
    currentFace: selectFace(expression.states, eyesClosed, mouthOpen),
    previousFace: previousExpression
      ? selectFace(previousExpression.states, false, mouthOpen)
      : null,
    currentOpacity: timeline.transitionProgress,
    previousOpacity: timeline.previousEmoji ? 1 - timeline.transitionProgress : 0,
    mouthOpen,
    eyesClosed,
    bouncePixels: bounce,
    emoji: timeline.currentEmoji,
  };
};
