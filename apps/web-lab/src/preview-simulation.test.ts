import { describe, expect, it } from "vitest";
import {
  PREVIEW_CYCLE_FRAMES,
  previewPhaseLabel,
  resolvePreviewSimulation,
} from "./preview-simulation";

describe("automatic state preview simulation", () => {
  it("cycles through entry, voice, silence, and blink without user input", () => {
    expect(resolvePreviewSimulation(0).phase).toBe("entry");
    expect(resolvePreviewSimulation(36).phase).toBe("speaking");
    expect(resolvePreviewSimulation(126).phase).toBe("silence");
    expect(resolvePreviewSimulation(150).phase).toBe("blink");
    expect(resolvePreviewSimulation(PREVIEW_CYCLE_FRAMES).phase).toBe("entry");
  });

  it("emits deterministic voice edges and emphasis pulses", () => {
    const speaking = resolvePreviewSimulation(58);
    expect(speaking.speaking).toBe(true);
    expect(speaking.voiceChange).toBe("closedToOpen");
    expect(speaking.voiceChangeFrame).toBe(36);
    expect(speaking.emphasisPulse).toBe(0.9);

    const silent = resolvePreviewSimulation(130);
    expect(silent.voiceChange).toBe("openToClosed");
    expect(silent.voiceChangeFrame).toBe(126);
  });

  it("provides human-readable phase labels", () => {
    expect(previewPhaseLabel("speaking")).toBe("Voz y énfasis");
    expect(previewPhaseLabel("blink")).toBe("Parpadeo");
  });
});
