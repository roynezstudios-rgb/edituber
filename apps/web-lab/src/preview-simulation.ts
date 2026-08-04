export const PREVIEW_CYCLE_FRAMES = 180;

export type PreviewPhase = "entry" | "speaking" | "silence" | "blink";

export interface PreviewSimulation {
  phase: PreviewPhase;
  phaseFrame: number;
  cycleStartFrame: number;
  speaking: boolean;
  forceBlink: boolean;
  voiceChange: "closedToOpen" | "openToClosed" | null;
  voiceChangeFrame: number;
  emphasisPulse: number;
  emphasisFrames: number[];
}

export const resolvePreviewSimulation = (frame: number): PreviewSimulation => {
  const safeFrame = Math.max(0, Math.floor(frame));
  const phaseFrame = safeFrame % PREVIEW_CYCLE_FRAMES;
  const cycleStartFrame = safeFrame - phaseFrame;
  const speaking = phaseFrame >= 36 && phaseFrame < 126;
  const forceBlink = phaseFrame >= 150 && phaseFrame < 155;
  const voiceChangeFrame = speaking
    ? cycleStartFrame + 36
    : phaseFrame >= 126
      ? cycleStartFrame + 126
      : cycleStartFrame;
  const emphasisFrames = [cycleStartFrame + 58, cycleStartFrame + 92];
  const nearEmphasis = emphasisFrames.some(
    (candidate) => safeFrame - candidate >= 0 && safeFrame - candidate < 5,
  );
  return {
    phase: phaseFrame < 36 ? "entry" : speaking ? "speaking" : forceBlink ? "blink" : "silence",
    phaseFrame,
    cycleStartFrame,
    speaking,
    forceBlink,
    voiceChange: phaseFrame < 36 ? null : speaking ? "closedToOpen" : "openToClosed",
    voiceChangeFrame,
    emphasisPulse: nearEmphasis ? 0.9 : speaking ? 0.42 : 0,
    emphasisFrames,
  };
};

export const previewPhaseLabel = (phase: PreviewPhase): string => {
  if (phase === "entry") return "Entrada";
  if (phase === "speaking") return "Voz y énfasis";
  if (phase === "blink") return "Parpadeo";
  return "Silencio";
};
