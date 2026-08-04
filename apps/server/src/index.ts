#!/usr/bin/env node
import { resolve } from "node:path";
import { createEdituberServer } from "./server";

const host = process.env.EDITUBER_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.EDITUBER_PORT ?? "4317", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("EDITUBER_PORT no es válido");

const server = createEdituberServer({
  host,
  port,
  apiToken: process.env.EDITUBER_API_TOKEN,
  allowUnauthenticated: process.env.EDITUBER_ALLOW_UNAUTHENTICATED === "1",
  outputRoot: resolve(process.env.EDITUBER_OUTPUT_ROOT ?? "outputs/server"),
  webRoot: resolve(process.env.EDITUBER_WEB_ROOT ?? "apps/web-lab/dist"),
  maxDurationSeconds: Number.parseFloat(process.env.EDITUBER_MAX_DURATION_SECONDS ?? "600"),
});

server.listen(port, host, () => {
  process.stdout.write(`EDITuber disponible en http://${host}:${port}\n`);
});

const close = (signal: string) => {
  process.stdout.write(`Cerrando EDITuber (${signal})\n`);
  server.close((error) => {
    if (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  });
};
process.on("SIGINT", () => close("SIGINT"));
process.on("SIGTERM", () => close("SIGTERM"));
