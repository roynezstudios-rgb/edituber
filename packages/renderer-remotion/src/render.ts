import { access, mkdir } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type EdituberBundle, validateBundle } from "@edituber/core";
import type { PreviewHandle, RenderEngine, RenderResult } from "@edituber/renderer-contract";
import { bundle as bundleRemotion } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import chromium from "@sparticuz/chromium";

const ensureLoopbackIsDiscoverable = (): void => {
  try {
    os.networkInterfaces();
  } catch {
    Object.defineProperty(os, "networkInterfaces", {
      configurable: true,
      value: () => ({
        lo: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
      }),
    });
  }
};

export const resolveBrowserExecutable = async (): Promise<string> => {
  if (process.env.EDITUBER_BROWSER_EXECUTABLE) {
    await access(process.env.EDITUBER_BROWSER_EXECUTABLE);
    return process.env.EDITUBER_BROWSER_EXECUTABLE;
  }
  if (process.platform !== "win32") return chromium.executablePath();
  const candidates = [
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the known Chrome and Edge locations.
    }
  }
  throw new Error(
    "No se encontró Chrome o Edge. Define EDITUBER_BROWSER_EXECUTABLE con la ruta del navegador.",
  );
};

export class RemotionRenderEngine implements RenderEngine {
  validate(bundle: EdituberBundle) {
    return validateBundle(bundle);
  }

  async preview(_bundle: EdituberBundle): Promise<PreviewHandle> {
    throw new Error("The Remotion preview is provided by Web Lab in Phase 1");
  }

  async render(bundle: EdituberBundle, outputPath: string): Promise<RenderResult> {
    const validation = this.validate(bundle);
    if (!validation.valid)
      throw new Error(`Invalid render bundle:\n${validation.errors.join("\n")}`);

    ensureLoopbackIsDiscoverable();
    await mkdir(dirname(outputPath), { recursive: true });
    const entryPoint = fileURLToPath(new URL("./entry.tsx", import.meta.url));
    const serveUrl = await bundleRemotion({ entryPoint, webpackOverride: (config) => config });
    const inputProps = { bundle };
    const browserExecutable = await resolveBrowserExecutable();
    const composition = await selectComposition({
      serveUrl,
      id: "EdituberPerformance",
      inputProps,
      browserExecutable,
    });

    await renderMedia({
      composition,
      serveUrl,
      browserExecutable,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: outputPath,
      inputProps,
      imageFormat: "jpeg",
      jpegQuality: 92,
      pixelFormat: "yuv420p",
      concurrency: 2,
    });

    return {
      outputPath,
      durationInFrames: bundle.project.durationInFrames,
      fps: bundle.project.fps,
      width: bundle.project.width,
      height: bundle.project.height,
    };
  }
}
