import type { AvatarManifestV2, EdituberProjectV2 } from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import avatarJson from "../../../fixtures/avatars/robot/avatar.json";
import projectJson from "../../../fixtures/projects/demo.edituber.json";
import { parsePortableDocument, serializePortableDocument } from "./portable";

describe("portable Web Lab documents", () => {
  it("round-trips a dynamic state stock and rejects a malformed document", () => {
    const source = {
      format: "edituber-portable" as const,
      version: 1 as const,
      project: projectJson as EdituberProjectV2,
      avatar: avatarJson as AvatarManifestV2,
    };
    expect(parsePortableDocument(serializePortableDocument(source))).toEqual(source);
    expect(() => parsePortableDocument('{"format":"other"}')).toThrow("no compatible");
  });
});
