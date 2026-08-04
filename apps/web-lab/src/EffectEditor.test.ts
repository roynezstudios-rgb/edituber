import { describe, expect, it } from "vitest";
import { roundEffectValue } from "./EffectEditor";

describe("effect editor values", () => {
  it("rounds imported technical values to the visible control step", () => {
    expect(roundEffectValue(5.2168, 0.05)).toBe(5.2);
    expect(roundEffectValue(25.749, 0.1)).toBe(25.7);
    expect(roundEffectValue(-54.6, 1)).toBe(-55);
  });
});
