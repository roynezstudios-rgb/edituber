import {
  type AvatarLayerState,
  isSpeakingAtFrame,
  resolveAvatarAtFrame,
} from "@edituber/avatar-engine";
import type {
  AudioEnvelopeV1,
  AvatarManifestV2,
  EdituberProjectV2,
  ValidationResult,
} from "@edituber/contracts";
import { validateAvatarManifest, validateProject } from "@edituber/contracts";

export interface EdituberBundle {
  project: EdituberProjectV2;
  avatar: AvatarManifestV2;
  envelope: AudioEnvelopeV1;
  audioSource: string;
}

export interface EdituberFrameState {
  frame: number;
  backgroundColor: string;
  backgroundType: "solid" | "transparent" | "image";
  backgroundImage?: string;
  positionX: number;
  positionY: number;
  scale: number;
  avatar: AvatarLayerState;
}

const validateManifest = (project: EdituberProjectV2, avatar: AvatarManifestV2): string[] => {
  const errors = [...validateAvatarManifest(avatar).errors];
  const stateIds = new Set(avatar.states.map((state) => state.id));
  for (const event of project.stateEvents) {
    if (!stateIds.has(event.stateId))
      errors.push(`Avatar manifest is missing state ${event.stateId}`);
  }
  if (!stateIds.has(project.avatar.defaultStateId))
    errors.push(`Avatar manifest is missing default state ${project.avatar.defaultStateId}`);
  return errors;
};

export const validateBundle = (bundle: EdituberBundle): ValidationResult => {
  const projectResult = validateProject(bundle.project);
  const errors = [...projectResult.errors, ...validateManifest(bundle.project, bundle.avatar)];
  if (bundle.envelope.fps !== bundle.project.fps) {
    errors.push("Audio envelope FPS must match project FPS");
  }
  if (bundle.envelope.frames.length < bundle.project.durationInFrames) {
    errors.push("Audio envelope is shorter than the project");
  }
  if (!bundle.audioSource) errors.push("Audio source is missing");
  return { valid: errors.length === 0, errors };
};

export const resolveFrameState = (bundle: EdituberBundle, frame: number): EdituberFrameState => {
  const safeFrame = Math.max(0, Math.min(bundle.project.durationInFrames - 1, Math.floor(frame)));
  const isSpeaking = isSpeakingAtFrame(
    bundle.envelope.frames[safeFrame],
    bundle.project.settings.mouthSensitivity,
  );
  let voiceChangeFrame = safeFrame;
  while (
    voiceChangeFrame > 0 &&
    isSpeakingAtFrame(
      bundle.envelope.frames[voiceChangeFrame - 1],
      bundle.project.settings.mouthSensitivity,
    ) === isSpeaking
  )
    voiceChangeFrame -= 1;
  const emphasisFrames: number[] = [];
  const emphasisWindowStart = Math.max(0, safeFrame - bundle.project.fps * 12);
  for (let index = emphasisWindowStart; index <= safeFrame; index += 1) {
    const currentPulse = bundle.envelope.frames[index]?.emphasisPulse ?? 0;
    const previousPulse = bundle.envelope.frames[index - 1]?.emphasisPulse ?? 0;
    if (currentPulse >= 0.8 && currentPulse > previousPulse) emphasisFrames.push(index);
  }
  return {
    frame: safeFrame,
    backgroundColor: bundle.project.stage.backgroundColor,
    backgroundType: bundle.project.stage.backgroundType,
    backgroundImage: bundle.project.stage.backgroundImage,
    positionX: bundle.project.avatar.positionX,
    positionY: bundle.project.avatar.positionY,
    scale: bundle.project.avatar.scale,
    avatar: resolveAvatarAtFrame(
      bundle.project,
      bundle.avatar,
      bundle.envelope.frames[safeFrame],
      safeFrame,
      {
        previousEnvelopeFrame: bundle.envelope.frames[safeFrame - 1],
        voiceChange:
          voiceChangeFrame === 0 && !isSpeaking
            ? null
            : isSpeaking
              ? "closedToOpen"
              : "openToClosed",
        voiceChangeFrame,
        emphasisFrames,
      },
    ),
  };
};
