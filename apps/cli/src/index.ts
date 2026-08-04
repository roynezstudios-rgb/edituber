#!/usr/bin/env node
import { resolve } from "node:path";
import { RemotionRenderEngine } from "@edituber/renderer-remotion/node";
import { Command } from "commander";
import { loadDirectBundle, loadProjectBundle } from "./load-bundle";

interface RenderOptions {
  project?: string;
  audio?: string;
  avatar?: string;
  background: string;
  output: string;
  assetRoot?: string;
  cacheRoot?: string;
}

const program = new Command()
  .name("edituber")
  .description("Deterministic headless avatar performance renderer")
  .version("0.1.0");

program
  .command("render")
  .description("Render a project JSON, or direct audio plus an avatar manifest")
  .option("--project <path>", "EDITuber project JSON")
  .option("--audio <path>", "audio source for direct mode")
  .option("--avatar <path>", "avatar manifest for direct mode")
  .option("--background <hex>", "solid background", "#00FF00")
  .option("--asset-root <path>", "trusted root for project assets")
  .option("--cache-root <path>", "trusted directory for generated envelopes")
  .requiredOption("--output <path>", "output MP4")
  .action(async (options: RenderOptions) => {
    if (!options.project && !(options.audio && options.avatar)) {
      throw new Error("Use --project, or use --audio and --avatar together");
    }
    if (options.project && (options.audio || options.avatar)) {
      throw new Error("--project cannot be combined with --audio or --avatar");
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(options.background)) {
      throw new Error("--background must be a six-digit hex color such as #00FF00");
    }

    const bundle = options.project
      ? await loadProjectBundle(options.project, {
          assetRoot: options.assetRoot,
          cacheRoot: options.cacheRoot,
        })
      : await loadDirectBundle({
          audioPath: options.audio as string,
          avatarPath: options.avatar as string,
          background: options.background,
          cacheRoot: options.cacheRoot,
        });
    const engine = new RemotionRenderEngine();
    const result = await engine.render(bundle, resolve(options.output));
    process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  });

program
  .command("validate")
  .description("Validate a project and all referenced local assets")
  .requiredOption("--project <path>", "EDITuber project JSON")
  .option("--asset-root <path>", "trusted root for project assets")
  .option("--cache-root <path>", "trusted directory for generated envelopes")
  .action(
    async ({
      project,
      assetRoot,
      cacheRoot,
    }: {
      project: string;
      assetRoot?: string;
      cacheRoot?: string;
    }) => {
      const bundle = await loadProjectBundle(project, { assetRoot, cacheRoot });
      const result = new RemotionRenderEngine().validate(bundle);
      if (!result.valid) throw new Error(result.errors.join("\n"));
      process.stdout.write(`${JSON.stringify({ ok: true, project: resolve(project) }, null, 2)}\n`);
    },
  );

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const detail =
    process.env.EDITUBER_DEBUG === "1" && error instanceof Error && error.stack
      ? error.stack
      : message;
  process.stderr.write(`EDITuber error: ${detail}\n`);
  process.exitCode = 1;
});
