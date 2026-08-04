const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg;codecs=opus",
  "audio/webm",
] as const;

export const chooseRecordingMimeType = (isTypeSupported: (mimeType: string) => boolean): string =>
  RECORDING_MIME_TYPES.find(isTypeSupported) ?? "";

export const recordingExtension = (mimeType: string): string => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
};

export const recordingFileName = (mimeType: string, date = new Date()): string => {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `grabacion-${stamp}.${recordingExtension(mimeType)}`;
};

export const recordingErrorMessage = (error: unknown): string => {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") return "Permiso de micrófono denegado";
  if (name === "NotFoundError") return "No se encontró un micrófono";
  if (name === "NotReadableError") return "El micrófono está ocupado por otra aplicación";
  if (name === "SecurityError") return "El micrófono requiere una conexión HTTPS segura";
  return `No se pudo iniciar el micrófono: ${String(error)}`;
};
