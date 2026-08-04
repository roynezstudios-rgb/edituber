import {
  type PortableEdituberDocumentV1,
  validateAvatarManifest,
  validateProject,
} from "@edituber/contracts";

export const serializePortableDocument = (document: PortableEdituberDocumentV1): string =>
  `${JSON.stringify(document, null, 2)}\n`;

export const parsePortableDocument = (source: string): PortableEdituberDocumentV1 => {
  const document = JSON.parse(source) as PortableEdituberDocumentV1;
  if (document.format !== "edituber-portable" || document.version !== 1)
    throw new Error("Formato portable no compatible");
  const projectResult = validateProject(document.project);
  const avatarResult = validateAvatarManifest(document.avatar);
  if (!projectResult.valid || !avatarResult.valid)
    throw new Error([...projectResult.errors, ...avatarResult.errors].join("; "));
  return document;
};
