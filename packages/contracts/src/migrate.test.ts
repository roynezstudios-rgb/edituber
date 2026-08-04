import { describe, expect, it } from "vitest";
import { defaultBlinkSettings, defaultMouthLoopSettings } from "./defaults";
import { migrateAvatarManifestV1, migrateProjectV1 } from "./migrate";
import type { AvatarManifestV1, EdituberProjectV1 } from "./types";
import { validateAvatarManifest, validateProject } from "./validate";

const stateId = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const legacyAvatar = {
  schemaVersion: 1,
  avatarId: "robot",
  name: "Robot",
  canvas: { width: 800, height: 800 },
  shell: "shell.svg",
  defaultExpression: "🙂",
  expressions: [
    {
      id: stateId,
      emoji: "🙂",
      blinkPolicy: "expressionControlled",
      states: {
        eyesOpenMouthClosed: "closed.svg",
        eyesOpenMouthOpen: "open.svg",
        eyesClosedMouthClosed: "partial.svg",
      },
    },
  ],
} satisfies AvatarManifestV1;
const legacyProject = {
  schemaVersion: 1,
  projectId: "f86ff1e3-567d-4c44-97a0-71a444c8c51d",
  title: "Legacy",
  fps: 30,
  width: 1080,
  height: 1080,
  durationInFrames: 1,
  seed: 1,
  audio: { source: "audio.wav", durationSeconds: 1 / 30, envelope: "envelope.json" },
  stage: { backgroundType: "solid", backgroundColor: "#00FF00" },
  avatar: {
    manifest: "avatar.json",
    defaultExpression: "🙂",
    positionX: 0.5,
    positionY: 0.5,
    scale: 1,
  },
  expressionEvents: [{ frame: 0, emoji: "🙂" }],
  settings: {
    blinkEnabled: true,
    talkBounceEnabled: true,
    mouthSensitivity: 0.5,
    transitionFrames: 8,
    bouncePreset: "normal",
  },
} satisfies EdituberProjectV1;

describe("v1 migration", () => {
  it("keeps stable IDs, removes expressionControlled, and refuses a partial blink pair", () => {
    const avatar = migrateAvatarManifestV1(legacyAvatar);
    expect(avatar.states[0]?.id).toBe(stateId);
    expect(avatar.states[0]?.blinkPolicy).toBe("disabled");
    expect(avatar.states[0]?.images.eyesClosed).toBeUndefined();
    expect(validateAvatarManifest(avatar).valid).toBe(true);
    const project = migrateProjectV1(legacyProject, avatar);
    expect(project.stateEvents).toEqual([{ frame: 0, stateId }]);
    expect(project.settings.blink).toEqual(defaultBlinkSettings());
    expect(project.settings.mouthLoop).toEqual(defaultMouthLoopSettings());
    expect(validateProject(project).valid).toBe(true);
    expect(
      validateProject({
        ...project,
        settings: {
          ...project.settings,
          blink: { ...defaultBlinkSettings(), intervalMinSeconds: 6, intervalMaxSeconds: 2 },
        },
      }).errors,
    ).toContain("/settings/blink minimum interval must not exceed maximum");
  });

  it("rejects duplicate, unsorted, or mismatched frame-zero events", () => {
    const avatar = migrateAvatarManifestV1(legacyAvatar);
    const project = migrateProjectV1(legacyProject, avatar);
    expect(
      validateProject({
        ...project,
        avatar: { ...project.avatar, defaultStateId: crypto.randomUUID() },
      }).errors,
    ).toContain("/stateEvents/0 must match avatar.defaultStateId");
    expect(
      validateProject({
        ...project,
        stateEvents: [...project.stateEvents, { frame: 0, stateId }],
      }).errors,
    ).toContain("/stateEvents must contain at most one event per frame");
  });
});
