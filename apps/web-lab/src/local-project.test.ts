import type { PortableEdituberDocumentV1 } from "@edituber/contracts";
import { describe, expect, it } from "vitest";
import { commitLocalProjectUpdate } from "./local-project";

describe("local project durability", () => {
  it("does not expose an audio edit as complete before IndexedDB confirms it", async () => {
    const order: string[] = [];
    const document = {} as PortableEdituberDocumentV1;

    await commitLocalProjectUpdate(
      document,
      () => {
        order.push("apply");
      },
      async () => {
        order.push("save:start");
        await Promise.resolve();
        order.push("save:done");
      },
    );

    expect(order).toEqual(["save:start", "save:done", "apply"]);
  });

  it("keeps the current UI state when IndexedDB rejects the update", async () => {
    let applied = false;

    await expect(
      commitLocalProjectUpdate(
        {} as PortableEdituberDocumentV1,
        () => {
          applied = true;
        },
        async () => {
          throw new Error("storage unavailable");
        },
      ),
    ).rejects.toThrow("storage unavailable");

    expect(applied).toBe(false);
  });
});
