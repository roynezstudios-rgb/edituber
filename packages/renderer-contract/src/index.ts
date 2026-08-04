import type { ValidationResult } from "@edituber/contracts";
import type { EdituberBundle } from "@edituber/core";

export interface PreviewHandle {
  dispose(): void;
}

export interface RenderResult {
  outputPath: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export interface RenderEngine {
  validate(bundle: EdituberBundle): ValidationResult;
  preview(bundle: EdituberBundle): Promise<PreviewHandle>;
  render(bundle: EdituberBundle, outputPath: string): Promise<RenderResult>;
}
