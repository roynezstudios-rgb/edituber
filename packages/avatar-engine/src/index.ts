import type {
  AudioEnvelopeFrame,
  AvatarManifestV2,
  AvatarState,
  BouncePreset,
  EdituberProjectV2,
  MotionPreset,
} from "@edituber/contracts";
import { resolveStateAtFrame } from "@edituber/timeline-engine";

export interface AvatarTransform {
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface AvatarLayerState {
  shell: string;
  currentFace: string;
  previousFace: string | null;
  currentOpacity: number;
  previousOpacity: number;
  mouthOpen: boolean;
  eyesClosed: boolean;
  transform: AvatarTransform;
  stateId: string;
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

export const resolveStateImage = (
  state: AvatarState,
  isSpeaking: boolean,
  isBlinking: boolean,
): string => {
  const eyePair =
    isBlinking && state.images.eyesClosed ? state.images.eyesClosed : state.images.eyesOpen;
  return isSpeaking ? eyePair.mouthOpen : eyePair.mouthClosed;
};

const stateById = (manifest: AvatarManifestV2, stateId: string): AvatarState => {
  const state = manifest.states.find((candidate) => candidate.id === stateId);
  if (!state) throw new Error(`Avatar does not define state ${stateId}`);
  return state;
};

const presetStrength: Record<MotionPreset, { idle: number; squash: number; emphasis: number }> = {
  idle: { idle: 1, squash: 1, emphasis: 0.25 },
  surprise: { idle: 0.45, squash: 1.15, emphasis: 1.3 },
  emphasis: { idle: 0.7, squash: 1.25, emphasis: 1.6 },
  kiss: { idle: 0.7, squash: 0.7, emphasis: 0.65 },
};

export const resolveAvatarTransform = (
  frame: number,
  fps: number,
  seed: number,
  preset: MotionPreset,
  bouncePreset: BouncePreset,
  talkBounceEnabled: boolean,
  envelope: AudioEnvelopeFrame | undefined,
): AvatarTransform => {
  const strength = presetStrength[preset];
  const phase = seededUnit(seed, 71) * Math.PI * 2;
  const idle = Math.sin((frame / fps) * Math.PI * 2 * 0.42 + phase) * strength.idle;
  const bounce = talkBounceEnabled ? (envelope?.bounceAmount ?? 0) * bouncePixels[bouncePreset] : 0;
  const squash = Math.min(0.045, (envelope?.bounceAmount ?? 0) * 0.045 * strength.squash);
  const emphasis = Math.min(1, envelope?.emphasisPulse ?? 0) * strength.emphasis;
  return {
    translateY: -bounce + idle * 1.8 - emphasis * 3.5,
    scaleX: 1 + squash + emphasis * 0.018,
    scaleY: 1 - squash + emphasis * 0.035,
    rotation: idle * 0.35 + (preset === "kiss" ? Math.sin((frame / fps) * 2.2) * 0.45 : 0),
  };
};

export const resolveAvatarAtFrame = (
  project: EdituberProjectV2,
  manifest: AvatarManifestV2,
  envelopeFrame: AudioEnvelopeFrame | undefined,
  frame: number,
): AvatarLayerState => {
  const timeline = resolveStateAtFrame(
    frame,
    project.stateEvents,
    project.avatar.defaultStateId,
    project.settings.transitionFrames,
  );
  const current = stateById(manifest, timeline.currentStateId);
  const adjustedMouth =
    (envelopeFrame?.mouthOpenAmount ?? 0) * (0.55 + project.settings.mouthSensitivity);
  const mouthOpen = Boolean(envelopeFrame?.voiceActive) && adjustedMouth >= 0.16;
  const eyesClosed =
    project.settings.blinkEnabled &&
    (current.blinkPolicy ?? "auto") === "auto" &&
    Boolean(current.images.eyesClosed) &&
    isBlinkClosedAtFrame(frame, project.fps, project.seed);
  const previous = timeline.previousStateId ? stateById(manifest, timeline.previousStateId) : null;
  return {
    shell: manifest.shell,
    currentFace: resolveStateImage(current, mouthOpen, eyesClosed),
    previousFace: previous ? resolveStateImage(previous, mouthOpen, false) : null,
    currentOpacity: timeline.transitionProgress,
    previousOpacity: timeline.previousStateId ? 1 - timeline.transitionProgress : 0,
    mouthOpen,
    eyesClosed,
    transform: resolveAvatarTransform(
      frame,
      project.fps,
      project.seed,
      current.motionPreset ?? "idle",
      project.settings.bouncePreset,
      project.settings.talkBounceEnabled,
      envelopeFrame,
    ),
    stateId: current.id,
    emoji: current.emoji,
  };
};
