import type {
  AudioEnvelopeFrame,
  AvatarEffect,
  AvatarEffects,
  AvatarManifestV2,
  AvatarState,
  AvatarTransition,
  BlinkSettings,
  BouncePreset,
  EdituberProjectV2,
  MotionPreset,
  MouthLoopSettings,
} from "@edituber/contracts";
import { defaultBlinkSettings } from "@edituber/contracts";
import { resolveStateAtFrame } from "@edituber/timeline-engine";

export interface AvatarTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  brightness: number;
  transitionActive: boolean;
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
  imageMode: "smooth" | "pixel";
}

export interface EffectResolverInput {
  state: AvatarState;
  effects?: AvatarEffects;
  frame: number;
  fps: number;
  isSpeaking: boolean;
  voiceChange: "closedToOpen" | "openToClosed" | null;
  voiceChangeFrame: number;
  stateEnterFrame: number;
  emphasisPulse: number;
  emphasisFrames?: number[];
  seed: number;
  motionScale: number;
}

const identityTransform = (): AvatarTransform => ({
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  brightness: 1,
  transitionActive: false,
});

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const hashString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const deriveStateSeed = (projectSeed: number, stateId: string): number =>
  projectSeed ^ hashString(stateId);

const seededUnit = (seed: number, index: number): number => {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4_294_967_296;
};

const smooth = (value: number): number => value * value * (3 - 2 * value);
const valueNoise = (time: number, seed: number, channel: number): number => {
  const cell = Math.floor(time);
  const fraction = smooth(time - cell);
  const left = seededUnit(seed ^ Math.imul(channel, 7919), cell) * 2 - 1;
  const right = seededUnit(seed ^ Math.imul(channel, 7919), cell + 1) * 2 - 1;
  return left + (right - left) * fraction;
};

export const isBlinkClosedAtFrame = (
  frame: number,
  fps: number,
  seed: number,
  settings: BlinkSettings = defaultBlinkSettings(),
): boolean => {
  const minimum = clamp(settings.intervalMinSeconds, 0.8, 30);
  const maximum = clamp(settings.intervalMaxSeconds, minimum, 60);
  const duration = Math.max(
    2,
    Math.round((clamp(settings.durationMilliseconds, 60, 1000) / 1000) * fps),
  );
  let cursor = Math.round(fps * (minimum + seededUnit(seed, 0) * (maximum - minimum)));
  for (let blinkIndex = 1; cursor <= frame + 1; blinkIndex += 1) {
    if (frame >= cursor && frame < cursor + duration) return true;
    cursor += Math.round(fps * (minimum + seededUnit(seed, blinkIndex) * (maximum - minimum)));
  }
  return false;
};

export const resolveStateImage = (
  state: AvatarState,
  isSpeaking: boolean,
  isBlinking: boolean,
): string => {
  const canBlink = Boolean(state.images.eyesClosed);
  const eyePair = canBlink && isBlinking ? state.images.eyesClosed : state.images.eyesOpen;
  if (!eyePair) return state.images.eyesOpen.mouthClosed;
  return isSpeaking && eyePair.mouthOpen
    ? eyePair.mouthOpen
    : eyePair.mouthClosed || state.images.eyesOpen.mouthClosed;
};

const applyEffect = (
  output: AvatarTransform,
  effect: AvatarEffect,
  input: EffectResolverInput,
): void => {
  if (!effect.enabled) return;
  const time = input.frame / input.fps;
  const effectSeed = input.seed ^ hashString(`${input.state.id}:${effect.id}`);
  switch (effect.type) {
    case "randomMove": {
      const amount = clamp(effect.amount, 0, 80);
      const velocity = clamp(effect.velocity, 0.05, 8);
      output.translateX += valueNoise(time * velocity, effectSeed, 1) * amount;
      output.translateY += valueNoise(time * velocity, effectSeed, 2) * amount;
      break;
    }
    case "waveMove": {
      const phase = (time / clamp(effect.periodSeconds, 0.25, 30)) * Math.PI * 2;
      output.translateX += Math.sin(phase + effect.phaseOffset) * clamp(effect.amountX, -80, 80);
      output.translateY += Math.cos(phase + effect.phaseOffset) * clamp(effect.amountY, -80, 80);
      break;
    }
    case "jump": {
      const cycle = (time * clamp(effect.frequencyHz, 0.1, 8)) % 1;
      const arc = 4 * cycle * (1 - cycle);
      output.translateX += Math.sin(cycle * Math.PI * 2) * clamp(effect.amountX, -60, 60);
      output.translateY -= arc * clamp(effect.amountY, 0, 120);
      break;
    }
    case "waveRotate": {
      const phase = (time / clamp(effect.periodSeconds, 0.25, 30)) * Math.PI * 2;
      output.rotation +=
        Math.sin(phase + effect.phaseOffset) * clamp(effect.amountDegrees, -25, 25);
      break;
    }
    case "darken":
      output.brightness *= 1 - clamp(effect.amount, 0, 0.85);
      break;
    case "squashStretch": {
      const pulse =
        Math.sin(time * Math.PI * 2 * clamp(effect.frequencyHz, 0.1, 8)) *
        clamp(effect.amount, 0, 0.25);
      const balance = clamp(effect.axisBalance, 0, 1);
      output.scaleX *= 1 + pulse * balance;
      output.scaleY *= 1 - pulse * (1 - balance);
      break;
    }
    case "emphasis": {
      const durationFrames = Math.max(
        1,
        Math.round((clamp(effect.durationMilliseconds, 50, 2000) / 1000) * input.fps),
      );
      const cooldownFrames = Math.max(
        0,
        Math.round((clamp(effect.cooldownMilliseconds, 0, 10000) / 1000) * input.fps),
      );
      let accepted = Number.NEGATIVE_INFINITY;
      for (const trigger of input.emphasisFrames ?? []) {
        if (trigger - accepted >= cooldownFrames) accepted = trigger;
      }
      const age = input.frame - accepted;
      const window = age >= 0 && age <= durationFrames ? 1 - age / durationFrames : 0;
      const strength = clamp(input.emphasisPulse, 0, 1) * clamp(effect.amount, 0, 2) * window;
      output.translateY -= strength * 9;
      output.scaleX *= 1 + strength * 0.025;
      output.scaleY *= 1 + strength * 0.04;
      break;
    }
  }
};

const applyTransitions = (
  output: AvatarTransform,
  transitions: AvatarTransition[],
  triggerFrame: number,
  input: EffectResolverInput,
): void => {
  for (const transition of transitions) {
    if (!transition.enabled || triggerFrame < 0) continue;
    const durationFrames = Math.max(
      1,
      Math.round((clamp(transition.durationMilliseconds, 50, 2000) / 1000) * input.fps),
    );
    const progress = (input.frame - triggerFrame) / durationFrames;
    if (progress < 0 || progress > 1) continue;
    const pulse = 4 * progress * (1 - progress);
    output.translateY -= pulse * clamp(transition.amount, 0, 150);
    output.scaleX *= 1 + pulse * 0.025;
    output.scaleY *= 1 - pulse * 0.018;
    output.transitionActive = true;
  }
};

export const resolveAvatarEffects = (input: EffectResolverInput): AvatarTransform => {
  const output = identityTransform();
  const effects = input.effects ?? input.state.effects;
  if (!effects) return output;
  for (const effect of input.isSpeaking ? effects.mouthOpen : effects.mouthClosed)
    applyEffect(output, effect, input);
  if (input.voiceChange)
    applyTransitions(output, effects[input.voiceChange], input.voiceChangeFrame, input);
  applyTransitions(output, effects.stateEnter, input.stateEnterFrame, input);
  output.translateX *= input.motionScale;
  output.translateY *= input.motionScale;
  output.rotation *= input.motionScale;
  output.scaleX = 1 + (output.scaleX - 1) * input.motionScale;
  output.scaleY = 1 + (output.scaleY - 1) * input.motionScale;
  output.brightness = clamp(output.brightness, 0.15, 1);
  return output;
};

const bouncePixels: Record<BouncePreset, number> = { soft: 7, normal: 14, emphasis: 22 };
const presetStrength: Record<MotionPreset, { idle: number; squash: number; emphasis: number }> = {
  idle: { idle: 1, squash: 1, emphasis: 0.25 },
  surprise: { idle: 0.45, squash: 1.15, emphasis: 1.3 },
  emphasis: { idle: 0.7, squash: 1.25, emphasis: 1.6 },
  kiss: { idle: 0.7, squash: 0.7, emphasis: 0.65 },
};

const hasConfiguredVoiceBounce = (effects: AvatarEffects): boolean =>
  effects.mouthOpen.some((effect) => effect.enabled && effect.type === "jump") ||
  effects.closedToOpen.some((effect) => effect.enabled) ||
  effects.openToClosed.some((effect) => effect.enabled);

const resolveAudioBounceTransform = (
  bouncePreset: BouncePreset,
  envelope: AudioEnvelopeFrame | undefined,
  motionScale: number,
): AvatarTransform => {
  const scale = clamp(motionScale, 0, 2);
  const bounceAmount = envelope?.bounceAmount ?? 0;
  const bounce = bounceAmount * bouncePixels[bouncePreset] * scale;
  const squash = Math.min(0.045, bounceAmount * 0.045) * scale;
  return {
    ...identityTransform(),
    translateY: -bounce,
    scaleX: 1 + squash,
    scaleY: 1 - squash,
  };
};

const composeTransforms = (first: AvatarTransform, second: AvatarTransform): AvatarTransform => ({
  translateX: first.translateX + second.translateX,
  translateY: first.translateY + second.translateY,
  scaleX: first.scaleX * second.scaleX,
  scaleY: first.scaleY * second.scaleY,
  rotation: first.rotation + second.rotation,
  brightness: first.brightness * second.brightness,
  transitionActive: first.transitionActive || second.transitionActive,
});

/** Compatibility path for v2 states written before explicit effect lists. */
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
    ...identityTransform(),
    translateY: -bounce + idle * 1.8 - emphasis * 3.5,
    scaleX: 1 + squash + emphasis * 0.018,
    scaleY: 1 - squash + emphasis * 0.035,
    rotation: idle * 0.35 + (preset === "kiss" ? Math.sin((frame / fps) * 2.2) * 0.45 : 0),
  };
};

const stateById = (manifest: AvatarManifestV2, stateId: string): AvatarState => {
  const state = manifest.states.find((candidate) => candidate.id === stateId);
  if (!state) throw new Error(`Avatar does not define state ${stateId}`);
  return state;
};

export interface AvatarResolutionContext {
  previousEnvelopeFrame?: AudioEnvelopeFrame;
  voiceChange?: "closedToOpen" | "openToClosed" | null;
  voiceChangeFrame?: number;
  voiceSegmentStartFrame?: number;
  emphasisFrames?: number[];
}

export const isSpeakingAtFrame = (
  envelopeFrame: AudioEnvelopeFrame | undefined,
  mouthSensitivity: number,
): boolean =>
  Boolean(envelopeFrame?.voiceActive) &&
  (envelopeFrame?.mouthOpenAmount ?? 0) * (0.55 + mouthSensitivity) >= 0.16;

export interface MouthFrameState {
  open: boolean;
  changeFrame: number;
}

export const isMouthLoopOpenAtFrame = (
  frame: number,
  fps: number,
  settings: MouthLoopSettings | undefined,
  voiceSegmentStartFrame: number,
): boolean => {
  if (!settings?.enabled) return true;
  const openFrames = Math.max(1, Math.round((settings.openMilliseconds / 1000) * fps));
  const closedFrames = Math.max(1, Math.round((settings.closedMilliseconds / 1000) * fps));
  const elapsed = Math.max(0, frame - voiceSegmentStartFrame);
  return elapsed % (openFrames + closedFrames) < openFrames;
};

export const resolveMouthAtFrame = (
  envelopeFrame: AudioEnvelopeFrame | undefined,
  mouthSensitivity: number,
  frame: number,
  fps: number,
  settings: MouthLoopSettings | undefined,
  voiceSegmentStartFrame: number,
): MouthFrameState => {
  const voiceDetected = isSpeakingAtFrame(envelopeFrame, mouthSensitivity);
  if (!voiceDetected) return { open: false, changeFrame: voiceSegmentStartFrame };
  if (!settings?.enabled) return { open: true, changeFrame: voiceSegmentStartFrame };
  const openFrames = Math.max(1, Math.round((settings.openMilliseconds / 1000) * fps));
  const closedFrames = Math.max(1, Math.round((settings.closedMilliseconds / 1000) * fps));
  const cycleFrames = openFrames + closedFrames;
  const elapsed = Math.max(0, frame - voiceSegmentStartFrame);
  const phase = elapsed % cycleFrames;
  const cycleStart = frame - phase;
  return isMouthLoopOpenAtFrame(frame, fps, settings, voiceSegmentStartFrame)
    ? { open: true, changeFrame: cycleStart }
    : { open: false, changeFrame: cycleStart + openFrames };
};

export const resolveAvatarAtFrame = (
  project: EdituberProjectV2,
  manifest: AvatarManifestV2,
  envelopeFrame: AudioEnvelopeFrame | undefined,
  frame: number,
  context: AvatarResolutionContext = {},
): AvatarLayerState => {
  const timeline = resolveStateAtFrame(
    frame,
    project.stateEvents,
    project.avatar.defaultStateId,
    project.settings.transitionFrames,
  );
  const current = stateById(manifest, timeline.currentStateId);
  const voiceDetected = isSpeakingAtFrame(envelopeFrame, project.settings.mouthSensitivity);
  const voiceSegmentStartFrame = context.voiceSegmentStartFrame ?? frame;
  const mouth = resolveMouthAtFrame(
    envelopeFrame,
    project.settings.mouthSensitivity,
    frame,
    project.fps,
    project.settings.mouthLoop,
    voiceSegmentStartFrame,
  );
  const mouthOpen = mouth.open;
  const previousMouthOpen = resolveMouthAtFrame(
    context.previousEnvelopeFrame,
    project.settings.mouthSensitivity,
    frame - 1,
    project.fps,
    project.settings.mouthLoop,
    voiceSegmentStartFrame,
  ).open;
  const inferredChange =
    previousMouthOpen === mouthOpen ? null : mouthOpen ? "closedToOpen" : "openToClosed";
  const voiceChange = context.voiceChange === undefined ? inferredChange : context.voiceChange;
  const blinkSettings = project.settings.blink ?? current.blink ?? defaultBlinkSettings();
  const eyesClosed =
    project.settings.blinkEnabled &&
    Boolean(current.images.eyesClosed) &&
    isBlinkClosedAtFrame(frame, project.fps, project.seed, blinkSettings);
  const previous = timeline.previousStateId ? stateById(manifest, timeline.previousStateId) : null;
  const activeEffects = project.effects ?? current.effects;
  const transform = activeEffects
    ? composeTransforms(
        resolveAvatarEffects({
          state: current,
          effects: activeEffects,
          frame,
          fps: project.fps,
          isSpeaking: voiceDetected,
          voiceChange,
          voiceChangeFrame: context.voiceChangeFrame ?? mouth.changeFrame,
          stateEnterFrame: timeline.eventFrame,
          emphasisPulse: envelopeFrame?.emphasisPulse ?? 0,
          emphasisFrames: context.emphasisFrames,
          seed: project.seed,
          motionScale: project.settings.motionScale ?? 1,
        }),
        project.settings.talkBounceEnabled && !hasConfiguredVoiceBounce(activeEffects)
          ? resolveAudioBounceTransform(
              project.settings.bouncePreset,
              envelopeFrame,
              project.settings.motionScale ?? 1,
            )
          : identityTransform(),
      )
    : resolveAvatarTransform(
        frame,
        project.fps,
        project.seed,
        current.motionPreset ?? "idle",
        project.settings.bouncePreset,
        project.settings.talkBounceEnabled,
        envelopeFrame,
      );
  return {
    shell: manifest.shell,
    currentFace: resolveStateImage(current, mouthOpen, eyesClosed),
    previousFace: previous ? resolveStateImage(previous, mouthOpen, false) : null,
    currentOpacity: timeline.transitionProgress,
    previousOpacity: timeline.previousStateId ? 1 - timeline.transitionProgress : 0,
    mouthOpen,
    eyesClosed,
    transform,
    stateId: current.id,
    emoji: current.emoji,
    imageMode: current.imageMode ?? "smooth",
  };
};
