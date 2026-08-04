import type { AvatarManifestV2, AvatarState, AvatarStateImages } from "@edituber/contracts";
import { strFromU8, unzipSync } from "fflate";
import { EMPTY_AVATAR_SHELL } from "./project-state";

const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 130;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_EXTENSION_PATTERN = /\.(png|apng|jpe?g|webp|gif|svg)$/i;

const mimeByExtension: Record<string, string> = {
  png: "image/png",
  apng: "image/apng",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

interface CharacterEmotionDocument {
  id: string;
  name: string;
  emoji: string;
}

interface CharacterPackageDocument {
  format: "edituber-character";
  version: 1;
  id: string;
  name: string;
  emotions: CharacterEmotionDocument[];
}

export interface ImportedCharacter {
  id: string;
  name: string;
  avatar: AvatarManifestV2;
  importedAt: string;
}

const normalizedPath = (path: string): string => {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length || normalized.startsWith("/") || segments.some((part) => part === ".."))
    throw new Error(`Ruta insegura dentro del ZIP: ${path}`);
  return segments.join("/");
};

const assertText = (value: unknown, label: string, maximum = 80): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum)
    throw new Error(`${label} debe tener entre 1 y ${maximum} caracteres`);
  return value.trim();
};

const assertId = (value: unknown, label: string): string => {
  const id = assertText(value, label, 60);
  if (!ID_PATTERN.test(id)) throw new Error(`${label} solo admite minúsculas, números y guiones`);
  return id;
};

const parseManifest = (bytes: Uint8Array): CharacterPackageDocument => {
  let candidate: unknown;
  try {
    candidate = JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error("personaje.json no contiene JSON válido");
  }
  if (!candidate || typeof candidate !== "object") throw new Error("personaje.json no es válido");
  const source = candidate as Record<string, unknown>;
  if (source.format !== "edituber-character" || source.version !== 1)
    throw new Error("personaje.json debe usar format edituber-character y version 1");
  if (!Array.isArray(source.emotions) || source.emotions.length < 1 || source.emotions.length > 32)
    throw new Error("personaje.json debe contener entre 1 y 32 emociones");
  const emotions = source.emotions.map((candidateEmotion, index) => {
    if (!candidateEmotion || typeof candidateEmotion !== "object")
      throw new Error(`La emoción ${index + 1} no es válida`);
    const emotion = candidateEmotion as Record<string, unknown>;
    return {
      id: assertId(emotion.id, `emotions[${index}].id`),
      name: assertText(emotion.name, `emotions[${index}].name`),
      emoji: assertText(emotion.emoji, `emotions[${index}].emoji`, 16),
    };
  });
  if (new Set(emotions.map((emotion) => emotion.id)).size !== emotions.length)
    throw new Error("Los identificadores de emoción no pueden repetirse");
  return {
    format: "edituber-character",
    version: 1,
    id: assertId(source.id, "id del personaje"),
    name: assertText(source.name, "nombre del personaje"),
    emotions,
  };
};

const bytesAsDataUrl = (bytes: Uint8Array, extension: string): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${mimeByExtension[extension.toLowerCase()]};base64,${btoa(binary)}`;
};

const imageForRole = (
  files: Map<string, Uint8Array>,
  directory: string,
  role: string,
): string | undefined => {
  const matches = [...files.entries()].filter(([path]) => {
    const filename = path.slice(directory.length);
    const extensionIndex = filename.lastIndexOf(".");
    return (
      !filename.includes("/") &&
      extensionIndex > 0 &&
      filename.slice(0, extensionIndex).toLowerCase() === role.toLowerCase()
    );
  });
  if (matches.length > 1) throw new Error(`${directory}${role} aparece más de una vez`);
  const match = matches[0];
  if (!match) return undefined;
  const extension = match[0].split(".").pop() ?? "";
  if (!IMAGE_EXTENSION_PATTERN.test(match[0]) || !mimeByExtension[extension.toLowerCase()])
    throw new Error(`${match[0]} no usa un formato de imagen compatible`);
  if (match[1].byteLength > MAX_IMAGE_BYTES) throw new Error(`${match[0]} supera 5 MB`);
  return bytesAsDataUrl(match[1], extension);
};

const imagesForEmotion = (files: Map<string, Uint8Array>, directory: string): AvatarStateImages => {
  const base = imageForRole(files, directory, "1-base");
  const talk = imageForRole(files, directory, "2-habla");
  const blink = imageForRole(files, directory, "3-parpadeo");
  const blinkTalk = imageForRole(files, directory, "4-parpadeo-habla");
  if (!base) throw new Error(`${directory} necesita 1-base`);
  const count = [base, talk, blink, blinkTalk].filter(Boolean).length;
  if (count === 1) return { eyesOpen: { mouthClosed: base } };
  if (count === 2 && talk) return { eyesOpen: { mouthClosed: base, mouthOpen: talk } };
  if (count === 4 && talk && blink && blinkTalk)
    return {
      eyesOpen: { mouthClosed: base, mouthOpen: talk },
      eyesClosed: { mouthClosed: blink, mouthOpen: blinkTalk },
    };
  throw new Error(`${directory} contiene ${count} imágenes; EDITuber solo admite 1, 2 o 4`);
};

export const parseCharacterPackage = (
  archiveBytes: Uint8Array,
  now = new Date().toISOString(),
): ImportedCharacter => {
  if (!archiveBytes.byteLength || archiveBytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("El ZIP debe pesar entre 1 byte y 60 MB");
  let entryCount = 0;
  let expandedBytes = 0;
  const unzipped = unzipSync(archiveBytes, {
    filter: (entry) => {
      entryCount += 1;
      expandedBytes += entry.originalSize;
      if (entryCount > MAX_ENTRIES) throw new Error(`El ZIP supera ${MAX_ENTRIES} archivos`);
      if (expandedBytes > MAX_EXPANDED_BYTES)
        throw new Error("El ZIP expandido supera el límite de seguridad de 100 MB");
      normalizedPath(entry.name);
      return !entry.name.endsWith("/");
    },
  });
  const files = new Map(
    Object.entries(unzipped).map(([path, bytes]) => [normalizedPath(path), bytes] as const),
  );
  const manifests = [...files.entries()].filter(
    ([path]) => path.split("/").pop()?.toLowerCase() === "personaje.json",
  );
  if (manifests.length !== 1) throw new Error("El ZIP debe contener un solo personaje.json");
  const [manifestPath, manifestBytes] = manifests[0] as [string, Uint8Array];
  const manifest = parseManifest(manifestBytes);
  const slash = manifestPath.lastIndexOf("/");
  const root = slash >= 0 ? manifestPath.slice(0, slash + 1) : "";
  const states: AvatarState[] = manifest.emotions.map((emotion) => ({
    id: crypto.randomUUID(),
    name: emotion.name,
    emoji: emotion.emoji,
    imageMode: "smooth",
    resetAnimationOnEnter: true,
    images: imagesForEmotion(files, `${root}${emotion.id}/`),
  }));
  const defaultState = states[0];
  if (!defaultState) throw new Error("El personaje no contiene emociones");
  return {
    id: manifest.id,
    name: manifest.name,
    importedAt: now,
    avatar: {
      schemaVersion: 2,
      avatarId: manifest.id,
      name: manifest.name,
      canvas: { width: 800, height: 800 },
      shell: EMPTY_AVATAR_SHELL,
      defaultStateId: defaultState.id,
      states,
    },
  };
};

export const parseCharacterPackageFile = async (file: File): Promise<ImportedCharacter> => {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Selecciona un archivo .zip");
  return parseCharacterPackage(new Uint8Array(await file.arrayBuffer()));
};
