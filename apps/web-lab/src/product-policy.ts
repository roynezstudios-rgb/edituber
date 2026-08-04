export const WEB_LAB_AUDIO_POLICY = {
  profile: "web-lab-guide",
  maxBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 10 * 60,
} as const;

export const FREE_DESKTOP_AUDIO_POLICY = {
  profile: "desktop-free",
  rewardRequiredForEveryInsertion: true,
  maxSecondsPerInsertion: 60,
  carryUnusedSeconds: false,
  consumePermitOn: "successful-insertion",
} as const;

export const FREE_DESKTOP_SHORT_CLIP_WARNING =
  "Puedes insertar este audio, pero tu ventana permite hasta 60 segundos. Si continúas, el próximo fragmento requerirá otro anuncio.";

export type AudioInsertionDecision =
  | { allowed: false; reason: "reward-required" | "invalid-duration" | "clip-too-long" }
  | { allowed: true; consumePermit: true; warnAboutUnusedWindow: boolean };

export const evaluateFreeDesktopAudioInsertion = (
  durationSeconds: number,
  hasRewardPermit: boolean,
): AudioInsertionDecision => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    return { allowed: false, reason: "invalid-duration" };
  if (durationSeconds > FREE_DESKTOP_AUDIO_POLICY.maxSecondsPerInsertion)
    return { allowed: false, reason: "clip-too-long" };
  if (!hasRewardPermit) return { allowed: false, reason: "reward-required" };
  return {
    allowed: true,
    consumePermit: true,
    warnAboutUnusedWindow: durationSeconds < FREE_DESKTOP_AUDIO_POLICY.maxSecondsPerInsertion,
  };
};
