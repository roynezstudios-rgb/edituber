import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import avatarSchema from "../schema/avatar-manifest.schema.json";
import projectSchema from "../schema/edituber-project.schema.json";
import type { AvatarManifestV2, EdituberProjectV2, ValidationResult } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateProjectSchema = ajv.compile<EdituberProjectV2>(projectSchema);
const validateAvatarSchema = ajv.compile<AvatarManifestV2>(avatarSchema);

const formatError = (error: ErrorObject): string =>
  `${error.instancePath || "/"} ${error.message ?? "is invalid"}`;

export const isSingleGrapheme = (value: string): boolean => {
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value.trim());
  return Array.from(segments).length === 1;
};

export const validateProject = (candidate: unknown): ValidationResult => {
  const validBySchema = validateProjectSchema(candidate);
  const errors = validBySchema ? [] : (validateProjectSchema.errors ?? []).map(formatError);
  if (validBySchema) {
    const project = candidate as EdituberProjectV2;
    for (const [index, event] of project.stateEvents.entries()) {
      if (event.frame >= project.durationInFrames)
        errors.push(`/stateEvents/${index}/frame must be inside the project duration`);
    }
    const sorted = [...project.stateEvents].sort((a, b) => a.frame - b.frame);
    if (sorted[0]?.frame !== 0) errors.push("/stateEvents must contain a state at frame 0");
    if (project.durationInFrames > Math.ceil(project.audio.durationSeconds * project.fps) + 1)
      errors.push("/durationInFrames cannot exceed the declared audio duration");
  }
  return { valid: errors.length === 0, errors };
};

export const validateAvatarManifest = (candidate: unknown): ValidationResult => {
  const validBySchema = validateAvatarSchema(candidate);
  const errors = validBySchema ? [] : (validateAvatarSchema.errors ?? []).map(formatError);
  if (validBySchema) {
    const avatar = candidate as AvatarManifestV2;
    const ids = new Set<string>();
    for (const [index, state] of avatar.states.entries()) {
      if (ids.has(state.id)) errors.push(`/states/${index}/id must be unique`);
      ids.add(state.id);
      if (!isSingleGrapheme(state.emoji))
        errors.push(`/states/${index}/emoji must be one grapheme`);
      const closed = state.images.eyesClosed;
      if (closed && (!closed.mouthClosed || !closed.mouthOpen))
        errors.push(`/states/${index}/images/eyesClosed must contain both mouth images`);
    }
    if (!ids.has(avatar.defaultStateId)) errors.push("/defaultStateId must reference a state");
  }
  return { valid: errors.length === 0, errors };
};
