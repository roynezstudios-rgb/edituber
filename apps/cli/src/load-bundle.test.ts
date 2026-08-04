import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isUnsafeAssetReference, resolveContainedAsset } from "./load-bundle";

describe("project asset containment", () => {
  it.each([
    "/etc/passwd",
    "C:\\Windows\\system.ini",
    "D:/secret.txt",
    "\\\\server\\share\\file.wav",
    "file:///tmp/audio.wav",
    "https://example.com/audio.wav",
  ])("rejects absolute, drive, UNC, and URI references: %s", (reference) => {
    expect(isUnsafeAssetReference(reference)).toBe(true);
  });

  it("accepts normal POSIX and Windows-style relative references", () => {
    expect(isUnsafeAssetReference("audio/demo.wav")).toBe(false);
    expect(isUnsafeAssetReference("audio\\demo.wav")).toBe(false);
  });

  it("rejects traversal after canonical resolution", async () => {
    const parent = await mkdtemp(join(tmpdir(), "edituber-path-"));
    const root = join(parent, "assets");
    await mkdir(root);
    await writeFile(join(parent, "outside.txt"), "outside");
    await expect(resolveContainedAsset(root, "../outside.txt")).rejects.toThrow("escapes");
  });

  it("keeps legacy ../ references when they remain inside an explicit asset root", async () => {
    const root = await mkdtemp(join(tmpdir(), "edituber-legacy-"));
    const projectDirectory = join(root, "projects");
    const audio = join(root, "audio.wav");
    await mkdir(projectDirectory);
    await writeFile(audio, "audio");
    await expect(resolveContainedAsset(root, "../audio.wav", projectDirectory)).resolves.toBe(
      audio,
    );
  });

  it("rejects a junction or symlink that resolves outside the asset root", async () => {
    const parent = await mkdtemp(join(tmpdir(), "edituber-link-"));
    const root = join(parent, "assets");
    const outside = join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "secret");
    const link = join(root, "linked");
    try {
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch {
      return;
    }
    await expect(resolveContainedAsset(root, "linked/secret.txt")).rejects.toThrow("escapes");
  });
});
