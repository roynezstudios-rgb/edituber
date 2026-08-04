import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  AudioEnvelopeV1,
  AvatarManifestV2,
  AvatarStateImages,
  EdituberProjectV2,
  PortableEdituberDocumentV1,
} from "@edituber/contracts";
import { afterEach, describe, expect, it } from "vitest";
import envelopeJson from "../../../fixtures/audio/demo-envelope.json";
import avatarJson from "../../../fixtures/avatars/robot/avatar.json";
import projectJson from "../../../fixtures/projects/demo.edituber.json";
import { createEdituberServer } from "./server";

const temporaryDirectories: string[] = [];
const embeddedImage = "data:image/svg+xml;base64,AA==";

const embedImages = (images: AvatarStateImages): AvatarStateImages => {
  if (!images.eyesOpen.mouthOpen) return { eyesOpen: { mouthClosed: embeddedImage } };
  if (!images.eyesClosed)
    return { eyesOpen: { mouthClosed: embeddedImage, mouthOpen: embeddedImage } };
  return {
    eyesOpen: { mouthClosed: embeddedImage, mouthOpen: embeddedImage },
    eyesClosed: { mouthClosed: embeddedImage, mouthOpen: embeddedImage },
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const portable: PortableEdituberDocumentV1 = {
  format: "edituber-portable",
  version: 1,
  project: projectJson as EdituberProjectV2,
  avatar: {
    ...(avatarJson as AvatarManifestV2),
    shell: embeddedImage,
    states: (avatarJson as AvatarManifestV2).states.map((state) => ({
      ...state,
      images: embedImages(state.images),
    })),
  },
  envelope: envelopeJson as AudioEnvelopeV1,
  audioSource: "data:audio/wav;base64,AA==",
};

const startServer = async (token?: string) => {
  const directory = await mkdtemp(join(tmpdir(), "edituber-server-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "index.html"), "EDITuber test");
  const server = createEdituberServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: resolve(directory, "outputs"),
    webRoot: directory,
    apiToken: token,
    render: async (_bundle, outputPath) => {
      await writeFile(outputPath, "video");
    },
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
};

describe("EDITuber local API", () => {
  it("validates, queues, reports, and downloads a portable render", async () => {
    const app = await startServer();
    try {
      const validation = await fetch(`${app.baseUrl}/api/v1/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portable),
      });
      expect(validation.status).toBe(200);

      const created = await fetch(`${app.baseUrl}/api/v1/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portable),
      });
      expect(created.status).toBe(202);
      const createdBody = (await created.json()) as { id: string };

      let job: { state: string; download?: string } = { state: "queued" };
      for (let attempt = 0; attempt < 20 && job.state !== "completed"; attempt += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
        job = (await fetch(`${app.baseUrl}/api/v1/renders/${createdBody.id}`).then((response) =>
          response.json(),
        )) as typeof job;
      }
      expect(job.state).toBe("completed");
      const download = await fetch(`${app.baseUrl}${job.download}`);
      expect(download.status).toBe(200);
      expect(await download.text()).toBe("video");
    } finally {
      await app.close();
    }
  });

  it("requires a matching bearer token when configured", async () => {
    const app = await startServer("secret-token");
    try {
      expect((await fetch(`${app.baseUrl}/api/v1/validate`, { method: "POST" })).status).toBe(401);
      expect(
        (
          await fetch(`${app.baseUrl}/api/v1/validate`, {
            method: "POST",
            headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
            body: JSON.stringify(portable),
          })
        ).status,
      ).toBe(200);
      expect(await readFile(join(temporaryDirectories.at(-1) ?? "", "index.html"), "utf8")).toBe(
        "EDITuber test",
      );
    } finally {
      await app.close();
    }
  });
});
