export type BlinkPolicy = "auto" | "disabled" | "expressionControlled";
export type BouncePreset = "soft" | "normal" | "emphasis";

export interface ExpressionEvent {
  frame: number;
  emoji: string;
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
  audio: {
    source: string;
    durationSeconds: number;
    envelope: string;
  };
  stage: {
    backgroundType: "solid";
    backgroundColor: string;
  };
  avatar: {
    manifest: string;
    defaultExpression: string;
    positionX: number;
    positionY: number;
    scale: number;
  };
  expressionEvents: ExpressionEvent[];
  settings: {
    blinkEnabled: boolean;
    talkBounceEnabled: boolean;
    mouthSensitivity: number;
    transitionFrames: number;
    bouncePreset: BouncePreset;
  };
}

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

export interface AvatarFaceStates {
  eyesOpenMouthClosed: string;
  eyesOpenMouthOpen: string;
  eyesClosedMouthClosed?: string;
  eyesClosedMouthOpen?: string;
}

export interface AvatarExpression {
  id: string;
  emoji: string;
  blinkPolicy: BlinkPolicy;
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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
