import { describe, expect, it } from "vitest";
import {
  frameFromTimelinePosition,
  removeStateEvent,
  resolveStateAtFrame,
  upsertStateEvent,
} from "./index";

const smile = "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0";
const think = "c114b68a-1653-4186-ad11-f380d2ea9379";
const surprise = "041731df-94b8-492b-a8cc-9e4300c4dc2f";

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
});
