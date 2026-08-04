import { randomUUID } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { analyzeAudioFile, hashFile, probeAudioDuration } from "@edituber/audio-engine/node";
import type {
  AudioEnvelopeV1,
  AvatarFaceStates,
  AvatarManifestV1,
  EdituberProjectV1,
} from "@edituber/contracts";
import { validateProject } from "@edituber/contracts";
import type { EdituberBundle } from "@edituber/core";

const MAX_JSON_BYTES = 1_000_000;
const MAX_ASSET_BYTES = 20_000_000;
const DEFAULT_MAX_DURATION_SECONDS = 600;

const readLimited = async (path: string, maxBytes: number): Promise<Buffer> => {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Expected a file: ${path}`);
  if (info.size > maxBytes) throw new Error(`File exceeds ${maxBytes} bytes: ${path}`);
  return readFile(path);
};

const readJson = async <T>(path: string): Promise<T> => {
  const contents = await readLimited(path, MAX_JSON_BYTES);
  try {
    return JSON.parse(contents.toString("utf8")) as T;
  } catch {
    throw new Error(`Invalid JSON: ${path}`);
  }
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const mimeFor = (path: string): string => {
  switch (extname(path).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    default:
      return "audio/wav";
  }
};

const toDataUri = async (path: string): Promise<string> => {
  const content = await readLimited(path, MAX_ASSET_BYTES);
  return `data:${mimeFor(path)};base64,${content.toString("base64")}`;
};

const embedStates = async (states: AvatarFaceStates, base: string): Promise<AvatarFaceStates> => ({
  eyesOpenMouthClosed: await toDataUri(resolve(base, states.eyesOpenMouthClosed)),
  eyesOpenMouthOpen: await toDataUri(resolve(base, states.eyesOpenMouthOpen)),
  ...(states.eyesClosedMouthClosed
    ? { eyesClosedMouthClosed: await toDataUri(resolve(base, states.eyesClosedMouthClosed)) }
    : {}),
  ...(states.eyesClosedMouthOpen
    ? { eyesClosedMouthOpen: await toDataUri(resolve(base, states.eyesClosedMouthOpen)) }
    : {}),
});

const loadAvatar = async (manifestPath: string): Promise<AvatarManifestV1> => {
  const manifest = await readJson<AvatarManifestV1>(manifestPath);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.expressions)) {
    throw new Error("Unsupported or invalid avatar manifest");
  }
  const base = resolve(manifestPath, "..");
  return {
    ...manifest,
    shell: await toDataUri(resolve(base, manifest.shell)),
    expressions: await Promise.all(
      manifest.expressions.map(async (expression) => ({
        ...expression,
        states: await embedStates(expression.states, base),
      })),
    ),
  };
};

const maxDuration = (): number => {
  const configured = Number.parseFloat(process.env.EDITUBER_MAX_DURATION_SECONDS ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_DURATION_SECONDS;
};

const analyzeOrLoadEnvelope = async (
  audioPath: string,
  envelopePath: string | null,
  fps: number,
): Promise<AudioEnvelopeV1> => {
  const currentHash = await hashFile(audioPath);
  if (envelopePath && (await exists(envelopePath))) {
    const cached = await readJson<AudioEnvelopeV1>(envelopePath);
    if (cached.version === 1 && cached.fps === fps && cached.sourceHash === currentHash)
      return cached;
  }
  const envelope = await analyzeAudioFile(audioPath, fps);
  if (envelopePath) await writeFile(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  return envelope;
};

export interface DirectBundleOptions {
  audioPath: string;
  avatarPath: string;
  background: string;
}

export const loadProjectBundle = async (projectPath: string): Promise<EdituberBundle> => {
  const absoluteProject = resolve(projectPath);
  const project = await readJson<EdituberProjectV1>(absoluteProject);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Invalid project:\n${validation.errors.join("\n")}`);
  const base = resolve(absoluteProject, "..");
  const audioPath = resolve(base, project.audio.source);
  const avatarPath = resolve(base, project.avatar.manifest);
  const envelopePath = resolve(base, project.audio.envelope);
  const actualDuration = await probeAudioDuration(audioPath);
  if (actualDuration > maxDuration()) {
    throw new Error(
      `Audio is ${actualDuration.toFixed(2)}s; limit is ${maxDuration()}s. It was not cut.`,
    );
  }
  if (Math.abs(actualDuration - project.audio.durationSeconds) > 0.08) {
    throw new Error("Declared audio duration does not match the source file");
  }
  const [avatar, envelope, audioSource] = await Promise.all([
    loadAvatar(avatarPath),
    analyzeOrLoadEnvelope(audioPath, envelopePath, project.fps),
    toDataUri(audioPath),
  ]);
  return { project, avatar, envelope, audioSource };
};

export const loadDirectBundle = async (options: DirectBundleOptions): Promise<EdituberBundle> => {
  const audioPath = resolve(options.audioPath);
  const avatarPath = resolve(options.avatarPath);
  const duration = await probeAudioDuration(audioPath);
  if (duration > maxDuration()) {
    throw new Error(
      `Audio is ${duration.toFixed(2)}s; limit is ${maxDuration()}s. It was not cut.`,
    );
  }
  const fps = 30;
  const avatar = await loadAvatar(avatarPath);
  const sourceHash = await hashFile(audioPath);
  const seed = Number.parseInt(sourceHash.slice(0, 8), 16) >>> 0;
  const durationInFrames = Math.max(1, Math.floor(duration * fps));
  const project: EdituberProjectV1 = {
    schemaVersion: 1,
    projectId: randomUUID(),
    title: "Direct audio render",
    fps,
    width: 1080,
    height: 1080,
    durationInFrames,
    seed,
    audio: { source: audioPath, durationSeconds: durationInFrames / fps, envelope: "memory" },
    stage: { backgroundType: "solid", backgroundColor: options.background },
    avatar: {
      manifest: avatarPath,
      defaultExpression: avatar.defaultExpression,
      positionX: 0.5,
      positionY: 0.52,
      scale: 1,
    },
    expressionEvents: [{ frame: 0, emoji: avatar.defaultExpression }],
    settings: {
      blinkEnabled: true,
      talkBounceEnabled: true,
      mouthSensitivity: 0.55,
      transitionFrames: 8,
      bouncePreset: "normal",
    },
  };
  const [envelope, audioSource] = await Promise.all([
    analyzeOrLoadEnvelope(audioPath, null, fps),
    toDataUri(audioPath),
  ]);
  return { project, avatar, envelope, audioSource };
};
