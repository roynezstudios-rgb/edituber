import type { AvatarManifestV2, AvatarState, EdituberProjectV2 } from "@edituber/contracts";
import { normalizeStateEvents } from "@edituber/timeline-engine";

export const EMPTY_AVATAR_SHELL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

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
