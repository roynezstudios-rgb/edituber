import type {
  AudioEnvelopeV1,
  AvatarManifestV2,
  EdituberProjectV2,
  PortableEdituberDocumentV1,
} from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import envelopeJson from "../../../fixtures/audio/demo-envelope.json";
import avatarJson from "../../../fixtures/avatars/robot/avatar.json";
import projectJson from "../../../fixtures/projects/demo.edituber.json";
import { parsePortableDocument, serializePortableDocument } from "./portable";

describe("portable Web Lab documents", () => {
  it("round-trips a dynamic state stock and rejects a malformed document", () => {
    const source: PortableEdituberDocumentV1 = {
      format: "edituber-portable" as const,
      version: 1 as const,
      project: projectJson as EdituberProjectV2,
      avatar: avatarJson as AvatarManifestV2,
      envelope: envelopeJson as AudioEnvelopeV1,
      audioSource: "data:audio/wav;base64,AA==",
    };
    const parsed = parsePortableDocument(serializePortableDocument(source));
    expect(parsed).toEqual(source);
    expect(parsed.project.effects).toEqual(source.project.effects);
    expect(parsed.avatar.states.some((state) => !state.images.eyesOpen.mouthOpen)).toBe(true);
    expect(parsed.avatar.states.some((state) => Boolean(state.images.eyesClosed))).toBe(true);
    expect(parsed.avatar.states.find((state) => state.effects)?.effects?.mouthOpen[0]?.preset).toBe(
      "happy",
    );
    expect(() => parsePortableDocument('{"format":"other"}')).toThrow("no compatible");
    expect(() =>
      parsePortableDocument(
        serializePortableDocument({
          ...source,
          envelope: { ...source.envelope, fps: source.project.fps + 1 },
        }),
      ),
    ).toThrow("no coincide");
  });

  it("round-trips exact 1, 2, and 4 image modes without changing effects", () => {
    const fixtureAvatar = avatarJson as AvatarManifestV2;
    const oneImageState = fixtureAvatar.states[0];
    const twoImageState = fixtureAvatar.states[1];
    const fourImageState = fixtureAvatar.states[2];
    if (!oneImageState || !twoImageState || !fourImageState)
      throw new Error("Avatar fixture needs at least three states");
    const source: PortableEdituberDocumentV1 = {
      format: "edituber-portable" as const,
      version: 1 as const,
      project: projectJson as EdituberProjectV2,
      avatar: {
        ...(avatarJson as AvatarManifestV2),
        states: [
          {
            ...oneImageState,
            images: { eyesOpen: { mouthClosed: "data:image/png;base64,AA==" } },
          },
          {
            ...twoImageState,
            effects: {
              mouthClosed: [],
              mouthOpen: [
                {
                  id: "b36692aa-b44d-4140-8438-601af96cfa8e",
                  type: "darken",
                  enabled: true,
                  preset: "custom",
                  amount: 0.2,
                },
              ],
              closedToOpen: [],
              openToClosed: [],
              stateEnter: [],
            },
            images: {
              eyesOpen: {
                mouthClosed: "data:image/png;base64,AA==",
                mouthOpen: "data:image/png;base64,AQ==",
              },
            },
          },
          fourImageState,
        ],
      },
      envelope: envelopeJson as AudioEnvelopeV1,
    };
    const parsed = parsePortableDocument(serializePortableDocument(source));
    expect(
      parsed.avatar.states.map((state) =>
        state.images.eyesClosed ? 4 : state.images.eyesOpen.mouthOpen ? 2 : 1,
      ),
    ).toEqual([1, 2, 4]);
    expect(parsed.avatar.states.map((state) => state.effects)).toEqual(
      source.avatar.states.map((state) => state.effects),
    );
    expect(parsed.avatar.states[1]?.effects?.mouthOpen[0]?.preset).toBe("custom");
  });
});
