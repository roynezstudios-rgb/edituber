import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "outputs/web-lab-demo.mp4");
let currentRender: Promise<void> | null = null;

const runRender = (): Promise<void> =>
  new Promise((resolveRender, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "apps/cli/src/index.ts",
        "render",
        "--project",
        "fixtures/projects/demo.edituber.json",
        "--output",
        "outputs/web-lab-demo.mp4",
      ],
      { cwd: root, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveRender();
      else reject(new Error(`Local render failed with exit code ${code}`));
    });
  });

const localRenderPlugin = (): Plugin => ({
  name: "edituber-local-render",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url === "/api/render-demo" && request.method === "POST") {
        response.setHeader("Content-Type", "application/json");
        try {
          currentRender ??= runRender().finally(() => {
            currentRender = null;
          });
          await currentRender;
          response.end(JSON.stringify({ ok: true, download: "/rendered-demo.mp4" }));
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({ ok: false, error: String(error) }));
        }
        return;
      }
      if (request.url === "/rendered-demo.mp4" && request.method === "GET") {
        try {
          await access(output);
          const info = await stat(output);
          response.setHeader("Content-Type", "video/mp4");
          response.setHeader("Content-Length", String(info.size));
          response.setHeader("Content-Disposition", 'attachment; filename="edituber-demo.mp4"');
          createReadStream(output).pipe(response);
        } catch {
          response.statusCode = 404;
          response.end("Render not found");
        }
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/edituber/" : "/",
  plugins: [react(), localRenderPlugin()],
  server: { port: 4317 },
  preview: { port: 4317 },
});
