import type { StateEvent } from "@edituber/contracts";

export interface ResolvedStateEvent {
  currentStateId: string;
  previousStateId: string | null;
  transitionProgress: number;
  eventFrame: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const normalizeStateEvents = (
  events: StateEvent[],
  defaultStateId: string,
): StateEvent[] => {
  const byFrame = new Map<number, StateEvent>();
  byFrame.set(0, { frame: 0, stateId: defaultStateId });
  for (const event of events) byFrame.set(Math.max(0, Math.floor(event.frame)), event);
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
};

export const upsertStateEvent = (
  events: StateEvent[],
  event: StateEvent,
  defaultStateId: string,
): StateEvent[] =>
  normalizeStateEvents(
    [...events.filter((candidate) => candidate.frame !== event.frame), event],
    event.frame === 0 ? event.stateId : defaultStateId,
  );

export const removeStateEvent = (
  events: StateEvent[],
  frame: number,
  defaultStateId: string,
): StateEvent[] =>
  normalizeStateEvents(
    events.filter((event) => event.frame !== frame),
    defaultStateId,
  );

export const frameFromTimelinePosition = (
  clientX: number,
  left: number,
  width: number,
  durationInFrames: number,
): number => {
  if (width <= 0 || durationInFrames <= 1) return 0;
  return Math.round(clamp01((clientX - left) / width) * (durationInFrames - 1));
};

export const resolveStateAtFrame = (
  frame: number,
  events: StateEvent[],
  defaultStateId: string,
  transitionFrames: number,
): ResolvedStateEvent => {
  const normalized = normalizeStateEvents(events, defaultStateId);
  let activeIndex = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    if ((normalized[index]?.frame ?? Number.POSITIVE_INFINITY) <= frame) activeIndex = index;
    else break;
  }
  const active = normalized[activeIndex] ?? { frame: 0, stateId: defaultStateId };
  const previous = activeIndex > 0 ? normalized[activeIndex - 1] : undefined;
  const transitionProgress =
    !previous || transitionFrames === 0
      ? 1
      : clamp01((frame - active.frame + 1) / Math.max(1, transitionFrames));
  return {
    currentStateId: active.stateId,
    previousStateId: transitionProgress < 1 ? (previous?.stateId ?? null) : null,
    transitionProgress,
    eventFrame: active.frame,
  };
};
