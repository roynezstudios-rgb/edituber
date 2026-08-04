export type BlinkPolicy = "auto" | "disabled";
export type BouncePreset = "soft" | "normal" | "emphasis";
export type MotionPreset = "idle" | "surprise" | "emphasis" | "kiss";
export type ImageMode = "smooth" | "pixel";
export type EffectPreset =
  | "custom"
  | "relaxed"
  | "shaking"
  | "shakingHard"
  | "breathing"
  | "circling"
  | "bouncy"
  | "happy"
  | "agitated"
  | "swaying"
  | "swayingHard";

export interface StateEvent {
  frame: number;
  stateId: string;
}

/** @deprecated v1 compatibility only. Use StateEvent. */
export interface ExpressionEvent {
  frame: number;
  emoji: string;
}

export interface ProjectAudio {
  source: string;
  durationSeconds: number;
  envelope: string;
}

export interface MouthLoopSettings {
  enabled: boolean;
  openMilliseconds: number;
  closedMilliseconds: number;
}

export interface ProjectSettings {
  blinkEnabled: boolean;
  /** Global blink behavior for the complete recording. */
  blink?: BlinkSettings;
  talkBounceEnabled: boolean;
  mouthSensitivity: number;
  /** Global mouth flap used only while voice is detected. */
  mouthLoop?: MouthLoopSettings;
  transitionFrames: number;
  bouncePreset: BouncePreset;
  motionScale?: number;
}

export interface EdituberProjectV1 {
  schemaVersion: 1;
  projectId: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  seed: number;
  audio: ProjectAudio;
  stage: { backgroundType: "solid"; backgroundColor: string };
  avatar: {
    manifest: string;
    defaultExpression: string;
    positionX: number;
    positionY: number;
    scale: number;
  };
  expressionEvents: ExpressionEvent[];
  settings: ProjectSettings;
}

export interface EdituberProjectV2 {
  schemaVersion: 2;
  projectId: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  seed: number;
  audio: ProjectAudio;
  stage: {
    backgroundType: "solid" | "transparent" | "image";
    backgroundColor: string;
    backgroundImage?: string;
  };
  avatar: {
    manifest: string;
    defaultStateId: string;
    visible?: boolean;
    positionX: number;
    positionY: number;
    scale: number;
  };
  stateEvents: StateEvent[];
  /** Effects applied to the complete recording, independent of timeline state changes. */
  effects?: AvatarEffects;
  settings: ProjectSettings;
}

export type EdituberProject = EdituberProjectV2;
export type EdituberProjectDocument = EdituberProjectV1 | EdituberProjectV2;

export interface AudioEnvelopeFrame {
  frame: number;
  amplitudeRaw: number;
  amplitudeSmoothed: number;
  voiceActive: boolean;
  mouthOpenAmount: number;
  emphasisPulse: number;
  bounceAmount: number;
}

export interface AudioEnvelopeV1 {
  version: 1;
  fps: number;
  sampleRate: number;
  sourceHash: string;
  frames: AudioEnvelopeFrame[];
}

type BaseImage = { mouthClosed: string };
type MouthPair = { mouthClosed: string; mouthOpen: string };
export type AvatarStateImages =
  | { eyesOpen: BaseImage & { mouthOpen?: never }; eyesClosed?: never }
  | { eyesOpen: MouthPair; eyesClosed?: never }
  | { eyesOpen: MouthPair; eyesClosed: MouthPair };

export interface BlinkSettings {
  intervalMinSeconds: number;
  intervalMaxSeconds: number;
  durationMilliseconds: number;
  syncAnimatedImages: boolean;
  playAnimationToEnd: boolean;
}

interface EffectBase {
  id: string;
  enabled: boolean;
  preset: EffectPreset;
}

export interface RandomMoveEffect extends EffectBase {
  type: "randomMove";
  amount: number;
  velocity: number;
}

export interface WaveMoveEffect extends EffectBase {
  type: "waveMove";
  amountX: number;
  amountY: number;
  periodSeconds: number;
  phaseOffset: number;
}

export interface JumpEffect extends EffectBase {
  type: "jump";
  amountX: number;
  amountY: number;
  frequencyHz: number;
}

export interface WaveRotateEffect extends EffectBase {
  type: "waveRotate";
  amountDegrees: number;
  periodSeconds: number;
  phaseOffset: number;
}

export interface DarkenEffect extends EffectBase {
  type: "darken";
  amount: number;
}

export interface SquashStretchEffect extends EffectBase {
  type: "squashStretch";
  amount: number;
  frequencyHz: number;
  axisBalance: number;
}

export interface EmphasisEffect extends EffectBase {
  type: "emphasis";
  amount: number;
  durationMilliseconds: number;
  cooldownMilliseconds: number;
}

export type AvatarEffect =
  | RandomMoveEffect
  | WaveMoveEffect
  | JumpEffect
  | WaveRotateEffect
  | DarkenEffect
  | SquashStretchEffect
  | EmphasisEffect;

export interface AvatarTransition {
  id: string;
  type: "jump" | "stateEnter";
  enabled: boolean;
  amount: number;
  durationMilliseconds: number;
}

export interface AvatarEffects {
  mouthClosed: AvatarEffect[];
  mouthOpen: AvatarEffect[];
  closedToOpen: AvatarTransition[];
  openToClosed: AvatarTransition[];
  stateEnter: AvatarTransition[];
}

export interface AvatarState {
  id: string;
  name: string;
  emoji: string;
  images: AvatarStateImages;
  /** @deprecated v2 compatibility only. Blink behavior now lives in project.settings. */
  blinkPolicy?: BlinkPolicy;
  /** @deprecated v2 compatibility only. Blink behavior now lives in project.settings. */
  blink?: BlinkSettings;
  imageMode?: ImageMode;
  resetAnimationOnEnter?: boolean;
  effects?: AvatarEffects;
  /** @deprecated Kept so v2 documents created before effect lists remain readable. */
  motionPreset?: MotionPreset;
}

/** @deprecated v1 compatibility only. */
export interface AvatarFaceStates {
  eyesOpenMouthClosed: string;
  eyesOpenMouthOpen: string;
  eyesClosedMouthClosed?: string;
  eyesClosedMouthOpen?: string;
}

/** @deprecated v1 compatibility only. */
export interface AvatarExpression {
  id: string;
  emoji: string;
  blinkPolicy: BlinkPolicy | "expressionControlled";
  states: AvatarFaceStates;
}

export interface AvatarManifestV1 {
  schemaVersion: 1;
  avatarId: string;
  name: string;
  canvas: { width: number; height: number };
  shell: string;
  defaultExpression: string;
  expressions: AvatarExpression[];
}

export interface AvatarManifestV2 {
  schemaVersion: 2;
  avatarId: string;
  name: string;
  canvas: { width: number; height: number };
  shell: string;
  defaultStateId: string;
  states: AvatarState[];
}

export type AvatarManifest = AvatarManifestV2;
export type AvatarManifestDocument = AvatarManifestV1 | AvatarManifestV2;

export interface PortableEdituberDocumentV1 {
  format: "edituber-portable";
  version: 1;
  project: EdituberProjectV2;
  avatar: AvatarManifestV2;
  envelope: AudioEnvelopeV1;
  audioSource?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
