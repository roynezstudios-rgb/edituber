import { defaultBlinkSettings, defaultMouthLoopSettings } from "./defaults";
import type {
  AvatarManifestV1,
  AvatarManifestV2,
  AvatarState,
  AvatarStateImages,
  EdituberProjectV1,
  EdituberProjectV2,
  MotionPreset,
} from "./types";

const legacyPreset = (emoji: string): MotionPreset => {
  if (emoji === "😮") return "surprise";
  return "idle";
};

export const migrateAvatarManifestV1 = (manifest: AvatarManifestV1): AvatarManifestV2 => {
  const states: AvatarState[] = manifest.expressions.map((expression, index) => {
    const eyesOpen = {
      mouthClosed: expression.states.eyesOpenMouthClosed,
      mouthOpen: expression.states.eyesOpenMouthOpen,
    };
    const images: AvatarStateImages =
      expression.states.eyesClosedMouthClosed && expression.states.eyesClosedMouthOpen
        ? {
            eyesOpen,
            eyesClosed: {
              mouthClosed: expression.states.eyesClosedMouthClosed,
              mouthOpen: expression.states.eyesClosedMouthOpen,
            },
          }
        : { eyesOpen };
    return {
      id: expression.id,
      name: `Estado ${index + 1}`,
      emoji: expression.emoji,
      blinkPolicy: expression.blinkPolicy === "auto" ? "auto" : "disabled",
      blink: defaultBlinkSettings(),
      imageMode: "smooth",
      resetAnimationOnEnter: false,
      motionPreset: legacyPreset(expression.emoji),
      images,
    };
  });
  const defaultStateId =
    states.find((state) => state.emoji === manifest.defaultExpression)?.id ?? states[0]?.id ?? "";
  return {
    schemaVersion: 2,
    avatarId: manifest.avatarId,
    name: manifest.name,
    canvas: manifest.canvas,
    shell: manifest.shell,
    defaultStateId,
    states,
  };
};

export const migrateProjectV1 = (
  project: EdituberProjectV1,
  avatar: AvatarManifestV2,
): EdituberProjectV2 => {
  const stateIdForEmoji = (emoji: string): string =>
    avatar.states.find((state) => state.emoji === emoji)?.id ?? avatar.defaultStateId;
  const defaultStateId = stateIdForEmoji(project.avatar.defaultExpression);
  return {
    schemaVersion: 2,
    projectId: project.projectId,
    title: project.title,
    fps: project.fps,
    width: project.width,
    height: project.height,
    durationInFrames: project.durationInFrames,
    seed: project.seed,
    audio: project.audio,
    stage: project.stage,
    avatar: {
      manifest: project.avatar.manifest,
      defaultStateId,
      positionX: project.avatar.positionX,
      positionY: project.avatar.positionY,
      scale: project.avatar.scale,
    },
    stateEvents: project.expressionEvents.map((event) => ({
      frame: event.frame,
      stateId: stateIdForEmoji(event.emoji),
    })),
    settings: {
      ...project.settings,
      blink: defaultBlinkSettings(),
      mouthLoop: defaultMouthLoopSettings(),
    },
  };
};
