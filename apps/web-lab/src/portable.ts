import {
  type AvatarStateImages,
  type PortableEdituberDocumentV1,
  validateAvatarManifest,
  validateProject,
} from "@edituber/contracts";

export const serializePortableDocument = (document: PortableEdituberDocumentV1): string =>
  `${JSON.stringify(document, null, 2)}\n`;

const toDataUri = async (source: string): Promise<string> => {
  if (/^data:[^;,]+(?:;charset=[^;,]+)?;base64,/i.test(source)) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`No se pudo incorporar el recurso ${source}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer un recurso"));
    reader.readAsDataURL(blob);
  });
};

const embedStateImages = async (images: AvatarStateImages): Promise<AvatarStateImages> => {
  const mouthClosed = await toDataUri(images.eyesOpen.mouthClosed);
  if (!images.eyesOpen.mouthOpen) return { eyesOpen: { mouthClosed } };
  const mouthOpen = await toDataUri(images.eyesOpen.mouthOpen);
  if (!images.eyesClosed) return { eyesOpen: { mouthClosed, mouthOpen } };
  return {
    eyesOpen: { mouthClosed, mouthOpen },
    eyesClosed: {
      mouthClosed: await toDataUri(images.eyesClosed.mouthClosed),
      mouthOpen: await toDataUri(images.eyesClosed.mouthOpen),
    },
  };
};

export const embedPortableAssets = async (
  document: PortableEdituberDocumentV1,
): Promise<PortableEdituberDocumentV1> => ({
  ...document,
  project: {
    ...document.project,
    stage: {
      ...document.project.stage,
      backgroundImage: document.project.stage.backgroundImage
        ? await toDataUri(document.project.stage.backgroundImage)
        : undefined,
    },
  },
  avatar: {
    ...document.avatar,
    shell: await toDataUri(document.avatar.shell),
    states: await Promise.all(
      document.avatar.states.map(async (state) => ({
        ...state,
        images: await embedStateImages(state.images),
      })),
    ),
  },
  audioSource: document.audioSource ? await toDataUri(document.audioSource) : undefined,
});

export const validatePortableDocument = (
  document: PortableEdituberDocumentV1,
): PortableEdituberDocumentV1 => {
  if (document.format !== "edituber-portable" || document.version !== 1)
    throw new Error("Formato portable no compatible");
  const projectResult = validateProject(document.project);
  const avatarResult = validateAvatarManifest(document.avatar);
  if (!projectResult.valid || !avatarResult.valid)
    throw new Error([...projectResult.errors, ...avatarResult.errors].join("; "));
  if (!document.envelope || document.envelope.version !== 1)
    throw new Error("Envelope de audio ausente o no compatible");
  if (document.envelope.fps !== document.project.fps)
    throw new Error("El FPS del envelope no coincide con el proyecto");
  if (document.envelope.frames.length < document.project.durationInFrames)
    throw new Error("El envelope no cubre la duración del proyecto");
  return document;
};

export const parsePortableDocument = (source: string): PortableEdituberDocumentV1 =>
  validatePortableDocument(JSON.parse(source) as PortableEdituberDocumentV1);
