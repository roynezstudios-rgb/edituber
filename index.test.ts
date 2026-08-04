import { describe, expect, it } from "vitest";
import { resolveExpressionAtFrame } from "./index";

describe("resolveExpressionAtFrame", () => {
  const events = [
    { frame: 0, emoji: "🙂" },
    { frame: 60, emoji: "🤔" },
    { frame: 120, emoji: "😮" },
  ];

  it("keeps the default expression before the first change", () => {
    expect(resolveExpressionAtFrame(30, events, "🙂", 8)).toMatchObject({
      currentEmoji: "🙂",
      previousEmoji: null,
      transitionProgress: 1,
    });
  });

  it("crossfades without an empty frame", () => {
    const state = resolveExpressionAtFrame(60, events, "🙂", 8);
    expect(state.currentEmoji).toBe("🤔");
    expect(state.previousEmoji).toBe("🙂");
    expect(state.transitionProgress).toBeGreaterThan(0);
  });
});
