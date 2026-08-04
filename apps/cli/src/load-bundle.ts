import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path, { dirname, extname, resolve } from "node:path";
import { analyzeAudioFile, hashFile, probeAudioDuration } from "@edituber/audio-engine/node";
import {
  type AudioEnvelopeV1,
  type AvatarManifestDocument,
  type AvatarManifestV1,
  type AvatarManifestV2,
  type AvatarStateImages,
  type EdituberProjectDocument,
  type EdituberProjectV1,
  type EdituberProjectV2,
  migrateAvatarManifestV1,
  migrateProjectV1,
  validateAvatarManifest,
  validateProject,
} from "@edituber/contracts";
import type { EdituberBundle } from "@edituber/core";

const MAX_JSON_BYTES = 1_000_000;
const MAX_ASSET_BYTES = 20_000_000;
const DEFAULT_MAX_DURATION_SECONDS = 600;
const DATA_URI = /^data:[^;,]+(?:;base64)?,/i;

const readLimited = async (filePath: string, maxBytes: number): Promise<Buffer> => {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`Expected a file: ${filePath}`);
  if (info.size > maxBytes) throw new Error(`File exceeds ${maxBytes} bytes: ${filePath}`);
  return readFile(filePath);
};

const readJson = async <T>(filePath: string): Promise<T> => {
  const contents = await readLimited(filePath, MAX_JSON_BYTES);
  try {
    return JSON.parse(contents.toString("utf8")) as T;
  } catch {
    throw new Error(`Invalid JSON: ${filePath}`);
  }
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const isUnsafeAssetReference = (reference: string): boolean => {
  const value = reference.trim();
  return (
    value.length === 0 ||
    value.includes("\0") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
  );
};

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
};

export const resolveContainedAsset = async (
  assetRoot: string,
  reference: string,
  baseDirectory = assetRoot,
): Promise<string> => {
  if (isUnsafeAssetReference(reference)) throw new Error(`Unsafe asset reference: ${reference}`);
  const [canonicalRoot, canonicalBase] = await Promise.all([
    realpath(assetRoot),
    realpath(baseDirectory),
  ]);
  if (!isInside(canonicalRoot, canonicalBase)) throw new Error("Asset base escapes the asset root");
  const candidate = await realpath(resolve(canonicalBase, reference));
  if (!isInside(canonicalRoot, candidate))
    throw new Error(`Asset escapes the asset root: ${reference}`);
  return candidate;
};

const resolveOptionalContainedAsset = async (
  assetRoot: string,
  reference: string,
  baseDirectory = assetRoot,
): Promise<string | null> => {
  try {
    return await resolveContainedAsset(assetRoot, reference, baseDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const mimeFor = (filePath: string): string => {
  switch (extname(filePath).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".apng":
      return "image/apng";
    case ".gif":
      return "image/gif";
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

const toDataUri = async (filePathOrDataUri: string): Promise<string> => {
  if (DATA_URI.test(filePathOrDataUri)) return filePathOrDataUri;
  const content = await readLimited(filePathOrDataUri, MAX_ASSET_BYTES);
  return `data:${mimeFor(filePathOrDataUri)};base64,${content.toString("base64")}`;
};

const embedImages = async (
  images: AvatarStateImages,
  assetRoot: string,
  manifestDirectory: string,
): Promise<AvatarStateImages> => {
  const embed = async (reference: string) =>
    DATA_URI.test(reference)
      ? reference
      : toDataUri(await resolveContainedAsset(assetRoot, reference, manifestDirectory));
  const mouthClosed = await embed(images.eyesOpen.mouthClosed);
  const mouthOpen = images.eyesOpen.mouthOpen ? await embed(images.eyesOpen.mouthOpen) : undefined;
  if (!mouthOpen) return { eyesOpen: { mouthClosed } };
  const eyesOpen = { mouthClosed, mouthOpen };
  if (!images.eyesClosed) return { eyesOpen };
  return {
    eyesOpen,
    eyesClosed: {
      mouthClosed: await embed(images.eyesClosed.mouthClosed),
      mouthOpen: await embed(images.eyesClosed.mouthOpen),
    },
  };
};

const loadAvatar = async (manifestPath: string, assetRoot: string): Promise<AvatarManifestV2> => {
  const document = await readJson<AvatarManifestDocument>(manifestPath);
  const manifest =
    document.schemaVersion === 1
      ? migrateAvatarManifestV1(document as AvatarManifestV1)
      : (document as AvatarManifestV2);
  const validation = validateAvatarManifest(manifest);
  if (!validation.valid) throw new Error(`Invalid avatar:\n${validation.errors.join("\n")}`);
  const base = dirname(manifestPath);
  const shell = DATA_URI.test(manifest.shell)
    ? manifest.shell
    : await toDataUri(await resolveContainedAsset(assetRoot, manifest.shell, base));
  return {
    ...manifest,
    shell,
    states: await Promise.all(
      manifest.states.map(async (state) => ({
        ...state,
        images: await embedImages(state.images, assetRoot, base),
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
  declaredEnvelopePath: string | null,
  cacheRoot: string,
  fps: number,
): Promise<AudioEnvelopeV1> => {
  const currentHash = await hashFile(audioPath);
  if (declaredEnvelopePath && (await exists(declaredEnvelopePath))) {
    const declared = await readJson<AudioEnvelopeV1>(declaredEnvelopePath);
    if (declared.version === 1 && declared.fps === fps && declared.sourceHash === currentHash)
      return declared;
  }
  await mkdir(cacheRoot, { recursive: true });
  const canonicalCache = await realpath(cacheRoot);
  const cachePath = resolve(canonicalCache, `${currentHash}-${fps}.envelope.json`);
  if (!isInside(canonicalCache, cachePath)) throw new Error("Invalid cache path");
  if (await exists(cachePath)) {
    const cached = await readJson<AudioEnvelopeV1>(cachePath);
    if (cached.version === 1 && cached.fps === fps && cached.sourceHash === currentHash)
      return cached;
  }
  const envelope = await analyzeAudioFile(audioPath, fps);
  await writeFile(cachePath, `${JSON.stringify(envelope, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return envelope;
};

export interface ProjectBundleOptions {
  assetRoot?: string;
  cacheRoot?: string;
}

export interface DirectBundleOptions {
  audioPath: string;
  avatarPath: string;
  background: string;
  cacheRoot?: string;
}

export const loadProjectBundle = async (
  projectPath: string,
  options: ProjectBundleOptions = {},
): Promise<EdituberBundle> => {
  const absoluteProject = await realpath(resolve(projectPath));
  const assetRoot = await realpath(resolve(options.assetRoot ?? dirname(absoluteProject)));
  const projectDocument = await readJson<EdituberProjectDocument>(absoluteProject);
  const referenceBase = projectDocument.schemaVersion === 1 ? dirname(absoluteProject) : assetRoot;
  const manifestReference = projectDocument.avatar.manifest;
  const avatarPath = await resolveContainedAsset(assetRoot, manifestReference, referenceBase);
  const avatar = await loadAvatar(avatarPath, assetRoot);
  let project: EdituberProjectV2 =
    projectDocument.schemaVersion === 1
      ? migrateProjectV1(projectDocument as EdituberProjectV1, avatar)
      : (projectDocument as EdituberProjectV2);
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Invalid project:\n${validation.errors.join("\n")}`);
  if (project.stage.backgroundType === "image" && project.stage.backgroundImage) {
    const backgroundImage = DATA_URI.test(project.stage.backgroundImage)
      ? project.stage.backgroundImage
      : await toDataUri(
          await resolveContainedAsset(assetRoot, project.stage.backgroundImage, referenceBase),
        );
    project = { ...project, stage: { ...project.stage, backgroundImage } };
  }
  const audioPath = await resolveContainedAsset(assetRoot, project.audio.source, referenceBase);
  const envelopePath = await resolveOptionalContainedAsset(
    assetRoot,
    project.audio.envelope,
    referenceBase,
  );
  const actualDuration = await probeAudioDuration(audioPath);
  if (actualDuration > maxDuration())
    throw new Error(
      `Audio is ${actualDuration.toFixed(2)}s; limit is ${maxDuration()}s. It was not cut.`,
    );
  if (Math.abs(actualDuration - project.audio.durationSeconds) > 0.08)
    throw new Error("Declared audio duration does not match the source file");
  const cacheRoot = resolve(
    options.cacheRoot ?? assetRoot,
    options.cacheRoot ? "" : ".edituber-cache",
  );
  const [envelope, audioSource] = await Promise.all([
    analyzeOrLoadEnvelope(audioPath, envelopePath, cacheRoot, project.fps),
    toDataUri(audioPath),
  ]);
  return { project, avatar, envelope, audioSource };
};

export const loadDirectBundle = async (options: DirectBundleOptions): Promise<EdituberBundle> => {
  const audioPath = await realpath(resolve(options.audioPath));
  const avatarPath = await realpath(resolve(options.avatarPath));
  const duration = await probeAudioDuration(audioPath);
  if (duration > maxDuration())
    throw new Error(
      `Audio is ${duration.toFixed(2)}s; limit is ${maxDuration()}s. It was not cut.`,
    );
  const fps = 30;
  const avatar = await loadAvatar(avatarPath, dirname(avatarPath));
  const sourceHash = await hashFile(audioPath);
  const seed = Number.parseInt(sourceHash.slice(0, 8), 16) >>> 0;
  const durationInFrames = Math.max(1, Math.floor(duration * fps));
  const project: EdituberProjectV2 = {
    schemaVersion: 2,
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
      defaultStateId: avatar.defaultStateId,
      visible: true,
      positionX: 0.5,
      positionY: 0.52,
      scale: 1,
    },
    stateEvents: [{ frame: 0, stateId: avatar.defaultStateId }],
    settings: {
      blinkEnabled: true,
      blink: {
        intervalMinSeconds: 2.3,
        intervalMaxSeconds: 5,
        durationMilliseconds: 130,
        syncAnimatedImages: true,
        playAnimationToEnd: false,
      },
      talkBounceEnabled: true,
      mouthSensitivity: 0.55,
      transitionFrames: 8,
      bouncePreset: "normal",
    },
  };
  const cacheRoot = resolve(
    options.cacheRoot ?? dirname(audioPath),
    options.cacheRoot ? "" : ".edituber-cache",
  );
  const [envelope, audioSource] = await Promise.all([
    analyzeOrLoadEnvelope(audioPath, null, cacheRoot, fps),
    toDataUri(audioPath),
  ]);
  return { project, avatar, envelope, audioSource };
};
