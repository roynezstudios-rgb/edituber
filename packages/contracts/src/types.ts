export type BlinkPolicy = "auto" | "disabled";
export type BouncePreset = "soft" | "normal" | "emphasis";
export type MotionPreset = "idle" | "surprise" | "emphasis" | "kiss";

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

export interface ProjectSettings {
  blinkEnabled: boolean;
  talkBounceEnabled: boolean;
  mouthSensitivity: number;
  transitionFrames: number;
  bouncePreset: BouncePreset;
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
  stage: { backgroundType: "solid"; backgroundColor: string };
  avatar: {
    manifest: string;
    defaultStateId: string;
    positionX: number;
    positionY: number;
    scale: number;
  };
  stateEvents: StateEvent[];
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

export interface AvatarStateImages {
  eyesOpen: { mouthClosed: string; mouthOpen: string };
  eyesClosed?: { mouthClosed: string; mouthOpen: string };
}

export interface AvatarState {
  id: string;
  name: string;
  emoji: string;
  images: AvatarStateImages;
  blinkPolicy?: BlinkPolicy;
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
  envelope?: AudioEnvelopeV1;
  audioSource?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
