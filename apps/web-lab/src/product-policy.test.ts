import { describe, expect, it } from "vitest";
import { WEB_LAB_AUDIO_POLICY } from "./product-policy";

describe("Web Lab audio policy", () => {
  it("keeps its local guide limits independent from external clients", () => {
    expect(WEB_LAB_AUDIO_POLICY).toEqual({
      profile: "web-lab-guide",
      maxBytes: 100 * 1024 * 1024,
      maxDurationSeconds: 10 * 60,
    });
  });
});
