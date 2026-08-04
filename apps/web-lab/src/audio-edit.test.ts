import { describe, expect, it } from "vitest";
import { encodePcm16Wave, remapStateTimelineAfterDelete, removePcmRange } from "./audio-edit";

describe("audio timeline editing", () => {
  it("removes the selected samples and creates a valid wave file", () => {
    const edited = removePcmRange(
      { sampleRate: 2, channels: [Float32Array.from([0, 0.25, 0.5, 0.75, 1, -1])] },
      1,
      2,
    );
    expect([...(edited.channels[0] ?? [])]).toEqual([0, 0.25, 1, -1]);
    const wave = encodePcm16Wave(edited);
    expect(new TextDecoder().decode(wave.slice(0, 4))).toBe("RIFF");
    expect(new DataView(wave).getUint32(40, true)).toBe(8);
  });

  it("joins A with C and shifts later state markers", () => {
    const result = remapStateTimelineAfterDelete(
      [
        { frame: 0, stateId: "A" },
        { frame: 30, stateId: "B" },
        { frame: 60, stateId: "C" },
        { frame: 90, stateId: "D" },
      ],
      "A",
      30,
      60,
    );
    expect(result).toEqual({
      defaultStateId: "A",
      events: [
        { frame: 0, stateId: "A" },
        { frame: 30, stateId: "C" },
        { frame: 60, stateId: "D" },
      ],
    });
  });

  it("updates the default state when the beginning is removed", () => {
    const result = remapStateTimelineAfterDelete(
      [
        { frame: 0, stateId: "A" },
        { frame: 20, stateId: "B" },
      ],
      "A",
      0,
      20,
    );
    expect(result.defaultStateId).toBe("B");
    expect(result.events[0]).toEqual({ frame: 0, stateId: "B" });
  });
});
