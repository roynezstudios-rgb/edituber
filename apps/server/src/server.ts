import { randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import {
  type PortableEdituberDocumentV1,
  validateAvatarManifest,
  validateProject,
} from "@edituber/contracts";
import type { EdituberBundle } from "@edituber/core";
import { RemotionRenderEngine } from "@edituber/renderer-remotion/node";
import { parseScriptDirectives } from "@edituber/timeline-engine";

const DEFAULT_BODY_LIMIT = 180 * 1024 * 1024;
const DEFAULT_MAX_DURATION_SECONDS = 600;
const AUDIO_DATA_URI = /^data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i;
const IMAGE_DATA_URI = /^data:image\/[a-z0-9.+-]+(?:;charset=[^;,]+)?;base64,[a-z0-9+/=\r\n]+$/i;
const RENDER_ROUTE =
  /^\/api\/v1\/renders\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\/file)?$/i;

type JobState = "queued" | "rendering" | "completed" | "failed";

interface RenderJob {
  id: string;
  state: JobState;
  createdAt: string;
  completedAt?: string;
  error?: string;
  outputPath: string;
}

export interface EdituberServerOptions {
  host: string;
  port: number;
  outputRoot: string;
  webRoot: string;
  apiToken?: string;
  allowUnauthenticated?: boolean;
  maxBodyBytes?: number;
  maxDurationSeconds?: number;
  render?: (bundle: EdituberBundle, outputPath: string) => Promise<void>;
}

const isLoopback = (host: string): boolean =>
  host === "127.0.0.1" || host === "::1" || host.toLowerCase() === "localhost";

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
};

const readBody = async (request: IncomingMessage, limit: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error(`El proyecto supera el límite de ${limit} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const parsePortableBundle = (value: unknown, maxDurationSeconds: number): EdituberBundle => {
  if (!value || typeof value !== "object") throw new Error("El cuerpo debe ser un objeto JSON");
  const document = value as Partial<PortableEdituberDocumentV1>;
  if (document.format !== "edituber-portable" || document.version !== 1)
    throw new Error("Formato portable no compatible");
  if (!document.project || !document.avatar || !document.envelope)
    throw new Error("Faltan proyecto, avatar o envolvente de audio");
  const projectValidation = validateProject(document.project);
  const avatarValidation = validateAvatarManifest(document.avatar);
  const errors = [...projectValidation.errors, ...avatarValidation.errors];
  if (errors.length > 0) throw new Error(errors.join("; "));
  if (document.envelope.version !== 1 || document.envelope.fps !== document.project.fps)
    throw new Error("La envolvente de audio no coincide con el proyecto");
  if (document.envelope.frames.length < document.project.durationInFrames)
    throw new Error("La envolvente no cubre toda la duración del proyecto");
  if (document.project.audio.durationSeconds > maxDurationSeconds)
    throw new Error(`El audio supera el máximo de ${maxDurationSeconds} segundos`);
  if (!document.audioSource || !AUDIO_DATA_URI.test(document.audioSource))
    throw new Error("El paquete debe incluir audioSource como audio base64");
  const imageSources = [
    document.avatar.shell,
    document.project.stage.backgroundImage,
    ...document.avatar.states.flatMap((state) => [
      state.images.eyesOpen.mouthClosed,
      state.images.eyesOpen.mouthOpen,
      state.images.eyesClosed?.mouthClosed,
      state.images.eyesClosed?.mouthOpen,
    ]),
  ].filter((source): source is string => Boolean(source));
  if (imageSources.some((source) => !IMAGE_DATA_URI.test(source)))
    throw new Error("El paquete portable debe incorporar todas las imágenes como base64");
  return {
    project: document.project,
    avatar: document.avatar,
    envelope: document.envelope,
    audioSource: document.audioSource,
  };
};

const tokenMatches = (provided: string, expected: string): boolean => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const mimeType = (filePath: string): string => {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
};

const safeStaticPath = (webRoot: string, requestPath: string): string | null => {
  const root = resolve(webRoot);
  const decoded = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const candidate = resolve(root, decoded || "index.html");
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
};

export const createEdituberServer = (options: EdituberServerOptions): Server => {
  if (!isLoopback(options.host) && !options.apiToken && !options.allowUnauthenticated)
    throw new Error(
      "EDITUBER_API_TOKEN es obligatorio fuera de localhost. Para una red privada aislada, usa EDITUBER_ALLOW_UNAUTHENTICATED=1 bajo tu responsabilidad.",
    );

  const jobs = new Map<string, RenderJob>();
  const bodyLimit = options.maxBodyBytes ?? DEFAULT_BODY_LIMIT;
  const maxDuration = options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const engine = new RemotionRenderEngine();
  const render =
    options.render ??
    (async (bundle, outputPath) => void (await engine.render(bundle, outputPath)));
  let queue = Promise.resolve();

  const recoverPersistedJob = async (id: string): Promise<RenderJob | undefined> => {
    const outputPath = resolve(options.outputRoot, `${id}.mp4`);
    try {
      const info = await stat(outputPath);
      if (!info.isFile()) return undefined;
      const createdAt = (info.birthtimeMs > 0 ? info.birthtime : info.mtime).toISOString();
      const job: RenderJob = {
        id,
        state: "completed",
        createdAt,
        completedAt: info.mtime.toISOString(),
        outputPath,
      };
      jobs.set(id, job);
      return job;
    } catch {
      const partialOutputPath = resolve(options.outputRoot, `${id}.part.mp4`);
      try {
        const info = await stat(partialOutputPath);
        if (!info.isFile()) return undefined;
        const createdAt = (info.birthtimeMs > 0 ? info.birthtime : info.mtime).toISOString();
        const job: RenderJob = {
          id,
          state: "failed",
          createdAt,
          completedAt: info.mtime.toISOString(),
          error: "El servidor se reinició antes de completar el render",
          outputPath,
        };
        jobs.set(id, job);
        return job;
      } catch {
        return undefined;
      }
    }
  };

  const authorized = (request: IncomingMessage): boolean => {
    if (!options.apiToken) return true;
    const header = request.headers.authorization ?? "";
    return header.startsWith("Bearer ") && tokenMatches(header.slice(7), options.apiToken);
  };

  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self' data: blob:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:",
    );
    const url = new URL(request.url ?? "/", "http://edituber.local");

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        sendJson(response, 200, { ok: true, version: "0.2.0-rc.1" });
        return;
      }
      if (url.pathname.startsWith("/api/") && !authorized(request)) {
        sendJson(response, 401, { ok: false, error: "Token de API ausente o incorrecto" });
        return;
      }
      if (url.pathname === "/api/v1/validate" && request.method === "POST") {
        const body = await readBody(request, bodyLimit);
        const bundle = parsePortableBundle(JSON.parse(body.toString("utf8")), maxDuration);
        sendJson(response, 200, {
          ok: true,
          durationInFrames: bundle.project.durationInFrames,
          fps: bundle.project.fps,
        });
        return;
      }
      if (url.pathname === "/api/v1/directives/validate" && request.method === "POST") {
        const body = await readBody(request, bodyLimit);
        const value = JSON.parse(body.toString("utf8")) as {
          script?: unknown;
          avatar?: unknown;
          fps?: unknown;
          durationInFrames?: unknown;
        };
        if (typeof value.script !== "string" || !value.avatar || typeof value.avatar !== "object")
          throw new Error("Faltan script o avatar");
        const avatar = value.avatar as PortableEdituberDocumentV1["avatar"];
        const avatarValidation = validateAvatarManifest(avatar);
        if (!avatarValidation.valid) throw new Error(avatarValidation.errors.join("; "));
        if (typeof value.fps !== "number" || typeof value.durationInFrames !== "number")
          throw new Error("fps y durationInFrames deben ser números");
        const result = parseScriptDirectives(
          value.script,
          avatar,
          value.fps,
          value.durationInFrames,
        );
        sendJson(response, result.valid ? 200 : 422, { ok: result.valid, ...result });
        return;
      }
      if (url.pathname === "/api/v1/renders" && request.method === "POST") {
        const body = await readBody(request, bodyLimit);
        const bundle = parsePortableBundle(JSON.parse(body.toString("utf8")), maxDuration);
        await mkdir(options.outputRoot, { recursive: true });
        const id = randomUUID();
        const job: RenderJob = {
          id,
          state: "queued",
          createdAt: new Date().toISOString(),
          outputPath: resolve(options.outputRoot, `${id}.mp4`),
        };
        const partialOutputPath = resolve(options.outputRoot, `${id}.part.mp4`);
        jobs.set(id, job);
        queue = queue
          .catch(() => undefined)
          .then(async () => {
            job.state = "rendering";
            try {
              await render(bundle, partialOutputPath);
              await rename(partialOutputPath, job.outputPath);
              job.state = "completed";
            } catch (error) {
              job.state = "failed";
              job.error = error instanceof Error ? error.message : String(error);
              await rm(partialOutputPath, { force: true }).catch(() => undefined);
            } finally {
              job.completedAt = new Date().toISOString();
            }
          });
        sendJson(response, 202, {
          ok: true,
          id,
          state: job.state,
          status: `/api/v1/renders/${id}`,
        });
        return;
      }
      const jobMatch = RENDER_ROUTE.exec(url.pathname);
      if (jobMatch && request.method === "GET") {
        const id = jobMatch[1] ?? "";
        const job = jobs.get(id) ?? (await recoverPersistedJob(id));
        if (!job) {
          sendJson(response, 404, { ok: false, error: "Render no encontrado" });
          return;
        }
        if (jobMatch[2]) {
          if (job.state !== "completed") {
            sendJson(response, 409, { ok: false, error: `El render está ${job.state}` });
            return;
          }
          const info = await stat(job.outputPath);
          response.writeHead(200, {
            "Content-Type": "video/mp4",
            "Content-Length": info.size,
            "Content-Disposition": `attachment; filename="edituber-${job.id}.mp4"`,
          });
          createReadStream(job.outputPath).pipe(response);
          return;
        }
        sendJson(response, 200, {
          ok: true,
          id: job.id,
          state: job.state,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          error: job.error,
          download: job.state === "completed" ? `/api/v1/renders/${job.id}/file` : undefined,
        });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { ok: false, error: "Ruta de API no encontrada" });
        return;
      }

      let filePath = safeStaticPath(options.webRoot, url.pathname);
      if (!filePath) {
        response.writeHead(400).end("Bad request");
        return;
      }
      try {
        const info = await stat(filePath);
        if (!info.isFile()) throw new Error("not a file");
      } catch {
        filePath = resolve(options.webRoot, "index.html");
        await access(filePath);
      }
      const contents = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": mimeType(filePath),
        "Content-Length": contents.length,
        "Cache-Control": filePath.endsWith("index.html")
          ? "no-cache"
          : "public, max-age=31536000, immutable",
      });
      response.end(contents);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("supera el límite") ? 413 : 400;
      sendJson(response, status, { ok: false, error: message });
    }
  });
};
