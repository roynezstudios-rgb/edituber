import type { ExpressionEvent } from "@edituber/contracts";

export interface ResolvedExpression {
  currentEmoji: string;
  previousEmoji: string | null;
  transitionProgress: number;
  eventFrame: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const normalizeExpressionEvents = (
  events: ExpressionEvent[],
  defaultExpression: string,
): ExpressionEvent[] => {
  const byFrame = new Map<number, ExpressionEvent>();
  byFrame.set(0, { frame: 0, emoji: defaultExpression });
  for (const event of events) byFrame.set(event.frame, event);
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
};

export const resolveExpressionAtFrame = (
  frame: number,
  events: ExpressionEvent[],
  defaultExpression: string,
  transitionFrames: number,
): ResolvedExpression => {
  const normalized = normalizeExpressionEvents(events, defaultExpression);
  let activeIndex = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    if ((normalized[index]?.frame ?? Number.POSITIVE_INFINITY) <= frame) activeIndex = index;
    else break;
  }

  const active = normalized[activeIndex] ?? { frame: 0, emoji: defaultExpression };
  const previous = activeIndex > 0 ? normalized[activeIndex - 1] : undefined;
  const progress =
    !previous || transitionFrames === 0
      ? 1
      : clamp01((frame - active.frame + 1) / Math.max(1, transitionFrames));

  return {
    currentEmoji: active.emoji,
    previousEmoji: progress < 1 ? (previous?.emoji ?? null) : null,
    transitionProgress: progress,
    eventFrame: active.frame,
  };
};
