import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import projectSchema from "../schema/edituber-project.schema.json";
import type { EdituberProjectV1, ValidationResult } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile<EdituberProjectV1>(projectSchema);

const formatError = (error: ErrorObject): string =>
  `${error.instancePath || "/"} ${error.message ?? "is invalid"}`;

export const isSingleGrapheme = (value: string): boolean => {
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value.trim());
  return Array.from(segments).length === 1;
};

export const validateProject = (candidate: unknown): ValidationResult => {
  const validBySchema = validateSchema(candidate);
  const errors = validBySchema ? [] : (validateSchema.errors ?? []).map(formatError);

  if (validBySchema) {
    const project = candidate as EdituberProjectV1;
    if (!isSingleGrapheme(project.avatar.defaultExpression)) {
      errors.push("/avatar/defaultExpression must be exactly one Unicode grapheme");
    }

    for (const [index, event] of project.expressionEvents.entries()) {
      if (!isSingleGrapheme(event.emoji)) {
        errors.push(`/expressionEvents/${index}/emoji must be exactly one Unicode grapheme`);
      }
      if (event.frame >= project.durationInFrames) {
        errors.push(`/expressionEvents/${index}/frame must be inside the project duration`);
      }
    }

    const sorted = [...project.expressionEvents].sort((a, b) => a.frame - b.frame);
    if (sorted[0]?.frame !== 0) {
      errors.push("/expressionEvents must contain a default expression at frame 0");
    }
    if (project.durationInFrames > Math.ceil(project.audio.durationSeconds * project.fps) + 1) {
      errors.push("/durationInFrames cannot exceed the declared audio duration");
    }
  }

  return { valid: errors.length === 0, errors };
};
