import type { AvatarManifestV2, StateEvent } from "@edituber/contracts";

export interface ScriptDirectiveCue {
  line: number;
  atSeconds: number;
  emoji: string;
  text: string;
}

export interface ScriptDirectiveResult {
  valid: boolean;
  cues: ScriptDirectiveCue[];
  events: StateEvent[];
  missingEmojis: string[];
  errors: string[];
}

const parseTimestamp = (source: string): number | null => {
  const parts = source.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const seconds = values.at(-1) ?? 0;
  const minutes = values.at(-2) ?? 0;
  const hours = values.at(-3) ?? 0;
  if (seconds >= 60 || minutes >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
};

export const parseScriptDirectives = (
  source: string,
  avatar: AvatarManifestV2,
  fps: number,
  durationInFrames: number,
): ScriptDirectiveResult => {
  const cues: ScriptDirectiveCue[] = [];
  const errors: string[] = [];
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("|").map((field) => field.trim());
    if (fields.length !== 3) {
      errors.push(`Línea ${index + 1}: usa TIEMPO | EMOJI | TEXTO`);
      continue;
    }
    const atSeconds = parseTimestamp(fields[0] ?? "");
    const emoji = fields[1] ?? "";
    const text = fields[2] ?? "";
    if (atSeconds === null) errors.push(`Línea ${index + 1}: tiempo no válido`);
    if (!emoji) errors.push(`Línea ${index + 1}: falta el emoji`);
    if (!text) errors.push(`Línea ${index + 1}: falta el texto`);
    if (atSeconds !== null && emoji && text) cues.push({ line: index + 1, atSeconds, emoji, text });
  }
  if (cues.length === 0) errors.push("El guion no contiene directivas");
  if (cues[0] && cues[0].atSeconds !== 0)
    errors.push("La primera directiva debe comenzar en 00:00.000");
  for (let index = 1; index < cues.length; index += 1) {
    if ((cues[index]?.atSeconds ?? 0) <= (cues[index - 1]?.atSeconds ?? 0))
      errors.push(
        `Línea ${cues[index]?.line}: el tiempo debe ser posterior a la directiva anterior`,
      );
  }
  const stateByEmoji = new Map(avatar.states.map((state) => [state.emoji, state.id]));
  const missingEmojis = [
    ...new Set(cues.map((cue) => cue.emoji).filter((emoji) => !stateByEmoji.has(emoji))),
  ];
  if (missingEmojis.length > 0)
    errors.push(`Faltan emociones en el personaje: ${missingEmojis.join(" ")}`);
  const events = cues.flatMap((cue) => {
    const stateId = stateByEmoji.get(cue.emoji);
    const frame = Math.round(cue.atSeconds * fps);
    if (!stateId || frame >= durationInFrames) {
      if (frame >= durationInFrames)
        errors.push(`Línea ${cue.line}: la directiva queda fuera de la duración del audio`);
      return [];
    }
    return [{ frame, stateId }];
  });
  return { valid: errors.length === 0, cues, events, missingEmojis, errors };
};

export interface ResolvedStateEvent {
  currentStateId: string;
  previousStateId: string | null;
  transitionProgress: number;
  eventFrame: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const normalizeStateEvents = (
  events: StateEvent[],
  defaultStateId: string,
): StateEvent[] => {
  const byFrame = new Map<number, StateEvent>();
  byFrame.set(0, { frame: 0, stateId: defaultStateId });
  for (const event of events) {
    const frame = Math.max(0, Math.floor(event.frame));
    byFrame.set(frame, { ...event, frame });
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
};

export const upsertStateEvent = (
  events: StateEvent[],
  event: StateEvent,
  defaultStateId: string,
): StateEvent[] =>
  normalizeStateEvents(
    [...events.filter((candidate) => candidate.frame !== event.frame), event],
    event.frame === 0 ? event.stateId : defaultStateId,
  );

export const removeStateEvent = (
  events: StateEvent[],
  frame: number,
  defaultStateId: string,
): StateEvent[] =>
  normalizeStateEvents(
    events.filter((event) => event.frame !== frame),
    defaultStateId,
  );

export const frameFromTimelinePosition = (
  clientX: number,
  left: number,
  width: number,
  durationInFrames: number,
): number => {
  if (width <= 0 || durationInFrames <= 1) return 0;
  return Math.round(clamp01((clientX - left) / width) * (durationInFrames - 1));
};

export const resolveStateAtFrame = (
  frame: number,
  events: StateEvent[],
  defaultStateId: string,
  transitionFrames: number,
): ResolvedStateEvent => {
  const normalized = normalizeStateEvents(events, defaultStateId);
  let activeIndex = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    if ((normalized[index]?.frame ?? Number.POSITIVE_INFINITY) <= frame) activeIndex = index;
    else break;
  }
  const active = normalized[activeIndex] ?? { frame: 0, stateId: defaultStateId };
  const previous = activeIndex > 0 ? normalized[activeIndex - 1] : undefined;
  const transitionProgress =
    !previous || transitionFrames === 0
      ? 1
      : clamp01((frame - active.frame + 1) / Math.max(1, transitionFrames));
  return {
    currentStateId: active.stateId,
    previousStateId: transitionProgress < 1 ? (previous?.stateId ?? null) : null,
    transitionProgress,
    eventFrame: active.frame,
  };
};
