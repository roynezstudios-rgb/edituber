import { type AvatarLayerState, resolveAvatarAtFrame } from "@edituber/avatar-engine";
import type {
  AudioEnvelopeV1,
  AvatarManifestV1,
  EdituberProjectV1,
  ValidationResult,
} from "@edituber/contracts";
import { validateProject } from "@edituber/contracts";

export interface EdituberBundle {
  project: EdituberProjectV1;
  avatar: AvatarManifestV1;
  envelope: AudioEnvelopeV1;
  audioSource: string;
}

export interface EdituberFrameState {
  frame: number;
  backgroundColor: string;
  positionX: number;
  positionY: number;
  scale: number;
  avatar: AvatarLayerState;
}

const validateManifest = (project: EdituberProjectV1, avatar: AvatarManifestV1): string[] => {
  const errors: string[] = [];
  const emojis = new Set(avatar.expressions.map((expression) => expression.emoji));
  for (const event of project.expressionEvents) {
    if (!emojis.has(event.emoji))
      errors.push(`Avatar manifest is missing expression ${event.emoji}`);
  }
  if (!emojis.has(project.avatar.defaultExpression)) {
    errors.push(
      `Avatar manifest is missing default expression ${project.avatar.defaultExpression}`,
    );
  }
  if (avatar.expressions.length === 0) errors.push("Avatar manifest has no expressions");
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
  return {
    frame: safeFrame,
    backgroundColor: bundle.project.stage.backgroundColor,
    positionX: bundle.project.avatar.positionX,
    positionY: bundle.project.avatar.positionY,
    scale: bundle.project.avatar.scale,
    avatar: resolveAvatarAtFrame(
      bundle.project,
      bundle.avatar,
      bundle.envelope.frames[safeFrame],
      safeFrame,
    ),
  };
};
