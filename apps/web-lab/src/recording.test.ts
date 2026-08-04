import { describe, expect, it } from "vitest";
import {
  chooseRecordingMimeType,
  recordingErrorMessage,
  recordingExtension,
  recordingFileName,
} from "./recording";

describe("browser audio recording", () => {
  it("chooses the first supported voice format", () => {
    expect(chooseRecordingMimeType((type) => type === "audio/ogg;codecs=opus")).toBe(
      "audio/ogg;codecs=opus",
    );
    expect(chooseRecordingMimeType(() => false)).toBe("");
  });

  it("creates portable recording file names", () => {
    const date = new Date("2026-08-04T12:34:56.789Z");
    expect(recordingFileName("audio/webm;codecs=opus", date)).toBe(
      "grabacion-2026-08-04T12-34-56-789Z.webm",
    );
    expect(recordingExtension("audio/mp4")).toBe("m4a");
    expect(recordingExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("explains common microphone failures", () => {
    const denied = new Error("denied");
    denied.name = "NotAllowedError";
    expect(recordingErrorMessage(denied)).toBe("Permiso de micrófono denegado");

    const missing = new Error("missing");
    missing.name = "NotFoundError";
    expect(recordingErrorMessage(missing)).toBe("No se encontró un micrófono");
  });
});
