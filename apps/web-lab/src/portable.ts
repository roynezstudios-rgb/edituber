import {
  type PortableEdituberDocumentV1,
  validateAvatarManifest,
  validateProject,
} from "@edituber/contracts";

export const serializePortableDocument = (document: PortableEdituberDocumentV1): string =>
  `${JSON.stringify(document, null, 2)}\n`;

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
