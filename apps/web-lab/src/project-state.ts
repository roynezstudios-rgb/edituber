import type { AvatarManifestV2, AvatarState, EdituberProjectV2 } from "@edituber/contracts";
import { normalizeStateEvents } from "@edituber/timeline-engine";

export const EMPTY_AVATAR_SHELL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

const LEGACY_DEMO_JUMP_IDS = new Set([
  "02a21d60-704f-411a-93e6-5c86ea9a36e8",
  "5be1f67b-8ae1-47b7-b3ce-c49f297bff8a",
  "7d935dc7-a1ae-4337-92ef-f1c4e90aa6e8",
]);

const stateImages = (state: AvatarState): string[] => [
  state.images.eyesOpen.mouthClosed,
  ...(state.images.eyesOpen.mouthOpen ? [state.images.eyesOpen.mouthOpen] : []),
  ...(state.images.eyesClosed
    ? [state.images.eyesClosed.mouthClosed, state.images.eyesClosed.mouthOpen]
    : []),
];

export const shellAfterStateSave = (shell: string, state: AvatarState): string =>
  stateImages(state).some((image) => image.startsWith("data:image/")) ? EMPTY_AVATAR_SHELL : shell;

export const shellAfterAvatarLoad = (
  shell: string,
  states: AvatarState[],
  bundledShell: string,
): string =>
  shell === bundledShell &&
  states.some((state) => stateImages(state).some((image) => image.startsWith("data:image/")))
    ? EMPTY_AVATAR_SHELL
    : shell;

export const withoutLegacyDemoJumps = (project: EdituberProjectV2): EdituberProjectV2 => {
  if (!project.effects) return project;
  const keep = <T extends { id: string }>(effects: T[]): T[] =>
    effects.filter((effect) => !LEGACY_DEMO_JUMP_IDS.has(effect.id));
  const effects = {
    mouthClosed: keep(project.effects.mouthClosed),
    mouthOpen: keep(project.effects.mouthOpen),
    closedToOpen: keep(project.effects.closedToOpen),
    openToClosed: keep(project.effects.openToClosed),
    stateEnter: keep(project.effects.stateEnter),
  };
  const before = Object.values(project.effects).reduce((total, group) => total + group.length, 0);
  const after = Object.values(effects).reduce((total, group) => total + group.length, 0);
  return before === after ? project : { ...project, effects };
};

export const deleteStateAndReferences = (
  avatar: AvatarManifestV2,
  project: EdituberProjectV2,
  deletedStateId: string,
  replacementStateId: string,
): { avatar: AvatarManifestV2; project: EdituberProjectV2 } => {
  const defaultStateId =
    project.avatar.defaultStateId === deletedStateId
      ? replacementStateId
      : project.avatar.defaultStateId;
  const remainingEvents = project.stateEvents.flatMap((event) => {
    if (event.stateId !== deletedStateId) return [event];
    return event.frame === 0 ? [{ ...event, stateId: replacementStateId }] : [];
  });

  return {
    avatar: {
      ...avatar,
      defaultStateId:
        avatar.defaultStateId === deletedStateId ? replacementStateId : avatar.defaultStateId,
      states: avatar.states.filter((state) => state.id !== deletedStateId),
    },
    project: {
      ...project,
      avatar: { ...project.avatar, defaultStateId, visible: true },
      stateEvents: normalizeStateEvents(remainingEvents, defaultStateId),
    },
  };
};
