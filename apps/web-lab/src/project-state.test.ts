import type { AvatarManifestV2, AvatarState, EdituberProjectV2 } from "@edituber/contracts";
import { resolveStateAtFrame } from "@edituber/timeline-engine";
import { describe, expect, it } from "vitest";
import {
  deleteStateAndReferences,
  EMPTY_AVATAR_SHELL,
  shellAfterAvatarLoad,
  shellAfterStateSave,
} from "./project-state";

const state = (id: string): AvatarState => ({
  id,
  name: id,
  emoji: "🙂",
  images: { eyesOpen: { mouthClosed: `${id}.png` } },
});

const avatar = {
  schemaVersion: 2,
  avatarId: "avatar",
  name: "Avatar",
  canvas: { width: 800, height: 800 },
  shell: "factory-shell.svg",
  defaultStateId: "happy",
  states: [state("happy"), state("sad"), state("factory")],
} satisfies AvatarManifestV2;

const project = {
  schemaVersion: 2,
  projectId: "project",
  title: "Project",
  fps: 30,
  width: 800,
  height: 800,
  durationInFrames: 180,
  seed: 1,
  audio: { source: "audio.wav", durationSeconds: 6, envelope: "audio.json" },
  stage: { backgroundType: "solid", backgroundColor: "#000000" },
  avatar: {
    manifest: "avatar.json",
    defaultStateId: "happy",
    visible: false,
    positionX: 0.5,
    positionY: 0.5,
    scale: 1,
  },
  stateEvents: [
    { frame: 0, stateId: "happy" },
    { frame: 60, stateId: "sad" },
    { frame: 120, stateId: "factory" },
  ],
  settings: {
    blinkEnabled: true,
    talkBounceEnabled: true,
    mouthSensitivity: 0.5,
    transitionFrames: 0,
    bouncePreset: "normal",
  },
} satisfies EdituberProjectV2;

describe("Web Lab project state", () => {
  it("removes future markers for a deleted state so the last chosen emotion persists", () => {
    const result = deleteStateAndReferences(avatar, project, "factory", "happy");

    expect(result.project.stateEvents).toEqual([
      { frame: 0, stateId: "happy" },
      { frame: 60, stateId: "sad" },
    ]);
    expect(resolveStateAtFrame(179, result.project.stateEvents, "happy", 0).currentStateId).toBe(
      "sad",
    );
    expect(result.project.avatar.visible).toBe(true);
  });

  it("removes the bundled shell after a user uploads a full sprite", () => {
    const uploaded = {
      ...state("custom"),
      images: { eyesOpen: { mouthClosed: "data:image/png;base64,custom" } },
    } satisfies AvatarState;

    expect(shellAfterStateSave("factory-shell.svg", uploaded)).toBe(EMPTY_AVATAR_SHELL);
    expect(shellAfterStateSave("factory-shell.svg", state("factory"))).toBe("factory-shell.svg");
    expect(shellAfterAvatarLoad("factory-shell.svg", [uploaded], "factory-shell.svg")).toBe(
      EMPTY_AVATAR_SHELL,
    );
    expect(shellAfterAvatarLoad("custom-shell.svg", [uploaded], "factory-shell.svg")).toBe(
      "custom-shell.svg",
    );
  });
});
