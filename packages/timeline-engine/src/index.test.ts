import { describe, expect, it } from "vitest";
import {
  frameFromTimelinePosition,
  parseScriptDirectives,
  removeStateEvent,
  resolveStateAtFrame,
  upsertStateEvent,
} from "./index";

const smile = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const think = "c114b68a-1653-4186-ad11-f380d2ea9379";
const surprise = "041731df-94b8-492b-a8cc-9e4300c4dc2f";
const avatar = {
  schemaVersion: 2 as const,
  avatarId: "avatar",
  name: "Avatar",
  canvas: { width: 100, height: 100 },
  shell: "data:image/svg+xml;base64,AA==",
  defaultStateId: smile,
  states: [
    { id: smile, name: "Sonrisa", emoji: "🙂", images: { eyesOpen: { mouthClosed: "a" } } },
    { id: think, name: "Pensando", emoji: "🤔", images: { eyesOpen: { mouthClosed: "b" } } },
  ],
};

describe("state timeline", () => {
  const events = [
    { frame: 0, stateId: smile },
    { frame: 60, stateId: think },
  ];

  it("resolves stable state IDs and crossfades without an empty frame", () => {
    expect(resolveStateAtFrame(30, events, smile, 8)).toMatchObject({
      currentStateId: smile,
      previousStateId: null,
      transitionProgress: 1,
    });
    const changed = resolveStateAtFrame(60, events, smile, 8);
    expect(changed.currentStateId).toBe(think);
    expect(changed.previousStateId).toBe(smile);
    expect(changed.transitionProgress).toBeGreaterThan(0);
  });

  it("upserts one sorted marker per frame and protects frame zero", () => {
    const next = upsertStateEvent(events, { frame: 60, stateId: surprise }, smile);
    expect(next).toEqual([
      { frame: 0, stateId: smile },
      { frame: 60, stateId: surprise },
    ]);
    expect(removeStateEvent(next, 0, smile)[0]).toEqual({ frame: 0, stateId: smile });
  });

  it("maps pointer positions to bounded frames", () => {
    expect(frameFromTimelinePosition(150, 100, 200, 101)).toBe(25);
    expect(frameFromTimelinePosition(-20, 100, 200, 101)).toBe(0);
    expect(frameFromTimelinePosition(500, 100, 200, 101)).toBe(100);
  });

  it("turns timestamped emoji directives into state events", () => {
    const result = parseScriptDirectives(
      "# edituber-directives v1\n00:00.000 | 🙂 | Inicio\n00:02.500 | 🤔 | Reflexión",
      avatar,
      30,
      180,
    );
    expect(result.valid).toBe(true);
    expect(result.events).toEqual([
      { frame: 0, stateId: smile },
      { frame: 75, stateId: think },
    ]);
  });

  it("reports missing avatar emotions before production", () => {
    const result = parseScriptDirectives("00:00.000 | 😮 | Falta", avatar, 30, 180);
    expect(result.valid).toBe(false);
    expect(result.missingEmojis).toEqual(["😮"]);
    expect(result.errors.join(" ")).toContain("Faltan emociones");
  });
});
