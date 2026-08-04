import { describe, expect, it } from "vitest";
import { resolveTimelineClick } from "./timeline-interaction";

describe("resolveTimelineClick", () => {
  it("abre el selector de emociones cuando esa herramienta está activa", () => {
    expect(resolveTimelineClick("emotions", 120)).toEqual({
      frame: 120,
      pickerFrame: 120,
    });
  });

  it("solo mueve el cursor cuando la herramienta de corte está activa", () => {
    expect(resolveTimelineClick("cut", 120)).toEqual({
      frame: 120,
      pickerFrame: null,
    });
  });
});
