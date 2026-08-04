import {
  isBlinkClosedAtFrame,
  resolveAvatarEffects,
  resolveStateImage,
} from "@edituber/avatar-engine";
import {
  type AvatarEffects,
  type AvatarState,
  type BlinkSettings,
  defaultEffect,
  emptyAvatarEffects,
} from "@edituber/contracts";
import { useEffect, useId, useRef, useState } from "react";
import {
  PREVIEW_CYCLE_FRAMES,
  previewPhaseLabel,
  resolvePreviewSimulation,
} from "./preview-simulation";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/apng",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const PREVIEW_WAVE_HEIGHTS = Array.from({ length: 18 }, (_, index) => 8 + ((index * 7) % 19));

const fileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

export type ImageSlot = "openClosed" | "openOpen" | "closedClosed" | "closedOpen";

const slotGuide: Record<
  ImageSlot,
  {
    step: number;
    shortLabel: string;
    label: string;
    description: string;
    eyes: "open" | "closed";
    mouth: "open" | "closed";
  }
> = {
  openClosed: {
    step: 1,
    shortLabel: "Base",
    label: "Ojos abiertos · silencio",
    description: "Imagen normal cuando no estás hablando",
    eyes: "open",
    mouth: "closed",
  },
  openOpen: {
    step: 2,
    shortLabel: "Boca",
    label: "Ojos abiertos · hablando",
    description: "Se muestra mientras detecta tu voz",
    eyes: "open",
    mouth: "open",
  },
  closedClosed: {
    step: 3,
    shortLabel: "Parpadeo",
    label: "Parpadeo · silencio",
    description: "Ojos cerrados cuando no estás hablando",
    eyes: "closed",
    mouth: "closed",
  },
  closedOpen: {
    step: 4,
    shortLabel: "Parpadeo + voz",
    label: "Parpadeo · hablando",
    description: "Ojos cerrados mientras detecta tu voz",
    eyes: "closed",
    mouth: "open",
  },
};

const FaceGuide = ({ eyes, mouth }: { eyes: "open" | "closed"; mouth: "open" | "closed" }) => (
  <span className={`face-guide eyes-${eyes} mouth-${mouth}`} aria-hidden="true">
    <span className="guide-eyes">
      <i />
      <i />
    </span>
    <i className="guide-mouth" />
  </span>
);

const legacyEffects = (state?: AvatarState): AvatarEffects => {
  if (state?.effects) return structuredClone(state.effects);
  const effects = emptyAvatarEffects();
  effects.mouthClosed.push(defaultEffect("waveMove", crypto.randomUUID()));
  if (state?.motionPreset === "surprise" || state?.motionPreset === "emphasis")
    effects.mouthOpen.push(defaultEffect("emphasis", crypto.randomUUID()));
  return effects;
};

export interface StateDraft {
  id?: string;
  name: string;
  emoji: string;
  imageMode: "smooth" | "pixel";
  resetAnimationOnEnter: boolean;
  effects: AvatarEffects;
  mouthEnabled: boolean;
  blinkEnabled: boolean;
  openClosed: string;
  openOpen: string;
  closedClosed: string;
  closedOpen: string;
}

export const draftFromState = (state?: AvatarState): StateDraft => ({
  id: state?.id,
  name: state?.name ?? "Nuevo estado",
  emoji: state?.emoji ?? "🙂",
  imageMode: state?.imageMode ?? "smooth",
  resetAnimationOnEnter: state?.resetAnimationOnEnter ?? false,
  effects: legacyEffects(state),
  mouthEnabled: Boolean(state?.images.eyesOpen.mouthOpen),
  blinkEnabled: Boolean(state?.images.eyesClosed),
  openClosed: state?.images.eyesOpen.mouthClosed ?? "",
  openOpen: state?.images.eyesOpen.mouthOpen ?? "",
  closedClosed: state?.images.eyesClosed?.mouthClosed ?? "",
  closedOpen: state?.images.eyesClosed?.mouthOpen ?? "",
});

export const stateFromDraft = (
  draft: StateDraft,
  id = draft.id ?? crypto.randomUUID(),
): AvatarState => {
  if (!draft.openClosed) throw new Error("La imagen base es obligatoria");
  if (draft.mouthEnabled && !draft.openOpen)
    throw new Error("El modo de boca necesita la imagen al hablar");
  if (draft.blinkEnabled && (!draft.mouthEnabled || !draft.closedClosed || !draft.closedOpen))
    throw new Error("El modo de parpadeo necesita exactamente cuatro imágenes");
  const shared = {
    id,
    name: draft.name.trim(),
    emoji: draft.emoji.trim(),
    imageMode: draft.imageMode,
    resetAnimationOnEnter: draft.resetAnimationOnEnter,
    effects: structuredClone(draft.effects),
  };
  if (!draft.mouthEnabled)
    return { ...shared, images: { eyesOpen: { mouthClosed: draft.openClosed } } };
  const eyesOpen = { mouthClosed: draft.openClosed, mouthOpen: draft.openOpen };
  if (!draft.blinkEnabled) return { ...shared, images: { eyesOpen } };
  return {
    ...shared,
    images: {
      eyesOpen,
      eyesClosed: { mouthClosed: draft.closedClosed, mouthOpen: draft.closedOpen },
    },
  };
};

export const draftWithoutMouthImages = (
  draft: StateDraft,
  confirmLoss: () => boolean,
): StateDraft | null => {
  if ((draft.openOpen || draft.closedClosed || draft.closedOpen) && !confirmLoss()) return null;
  return {
    ...draft,
    mouthEnabled: false,
    blinkEnabled: false,
    openOpen: "",
    closedClosed: "",
    closedOpen: "",
  };
};

export const draftWithoutBlinkImages = (
  draft: StateDraft,
  confirmLoss: () => boolean,
): StateDraft | null => {
  if ((draft.closedClosed || draft.closedOpen) && !confirmLoss()) return null;
  return {
    ...draft,
    blinkEnabled: false,
    closedClosed: "",
    closedOpen: "",
  };
};

export const draftWithImage = (draft: StateDraft, key: ImageSlot, image: string): StateDraft => {
  const next = { ...draft, [key]: image };
  if (key === "openOpen") next.mouthEnabled = true;
  if (key === "closedClosed" || key === "closedOpen") {
    next.mouthEnabled = true;
    next.blinkEnabled = true;
  }
  return next;
};

const modeLabel = (draft: StateDraft): string => {
  if (draft.blinkEnabled) return "Boca y parpadeo · 4 imágenes";
  if (draft.mouthEnabled) return "Boca sincronizada · 2 imágenes";
  return "Modo simple · 1 imagen";
};

export const StateEditor = ({
  draft,
  onChange,
  onCancel,
  onSave,
  seed,
  blinkSettings,
  globalBlinkEnabled,
}: {
  draft: StateDraft;
  onChange: (draft: StateDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  seed: number;
  blinkSettings: BlinkSettings;
  globalBlinkEnabled: boolean;
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [assetError, setAssetError] = useState("");
  const [previewFrame, setPreviewFrame] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  useEffect(() => {
    if (!previewPlaying) return;
    const timer = window.setInterval(() => setPreviewFrame((frame) => frame + 1), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [previewPlaying]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("input, button, select")?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      previousFocus?.focus();
    };
  }, []);

  const setImage = async (key: ImageSlot, file?: File) => {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setAssetError("Usa PNG, APNG, JPEG, WebP, GIF o SVG.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAssetError("Cada imagen debe pesar 5 MB o menos.");
      return;
    }
    onChange(draftWithImage(draft, key, await fileAsDataUrl(file)));
    setAssetError("");
  };
  const removeImageBlock = (key: ImageSlot) => {
    if (key === "openClosed") return;
    if (key === "openOpen") {
      const next = draftWithoutMouthImages(draft, () =>
        window.confirm("Esto retirará las imágenes de boca y parpadeo. ¿Continuar?"),
      );
      if (next) onChange(next);
      return;
    }
    const next = draftWithoutBlinkImages(draft, () =>
      window.confirm("Se retirarán las dos imágenes de parpadeo. ¿Continuar?"),
    );
    if (next) onChange(next);
  };
  const imageGuideCell = (key: ImageSlot) => {
    const guide = slotGuide[key];
    const enabled =
      key === "openClosed" || (key === "openOpen" ? draft.mouthEnabled : draft.blinkEnabled);
    return (
      <div
        className={`guide-cell ${enabled ? "active" : "optional"} ${draft[key] ? "filled" : "empty"}`}
      >
        <label>
          <input
            type="file"
            aria-label={`Seleccionar ${guide.label}`}
            accept="image/png,image/apng,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={(event) => void setImage(key, event.currentTarget.files?.[0])}
          />
          {draft[key] ? (
            <img src={draft[key]} alt={`Vista previa: ${guide.label}`} />
          ) : (
            <FaceGuide eyes={guide.eyes} mouth={guide.mouth} />
          )}
          <small>
            {guide.step} · {guide.shortLabel}
          </small>
          <em>{draft[key] ? "Clic para reemplazar" : "+ Agregar imagen"}</em>
        </label>
        {draft[key] && key !== "openClosed" ? (
          <button
            type="button"
            className="remove-guide-image"
            aria-label={`Quitar ${guide.label}`}
            onClick={() => removeImageBlock(key)}
          >
            ×
          </button>
        ) : null}
      </div>
    );
  };

  const blinkComplete = Boolean(draft.closedClosed && draft.closedOpen);
  const canSave = Boolean(
    draft.name.trim() &&
      draft.emoji.trim() &&
      draft.openClosed &&
      (!draft.mouthEnabled || draft.openOpen) &&
      (!draft.blinkEnabled || blinkComplete),
  );
  const previewState = stateFromDraft(
    {
      ...draft,
      openClosed:
        draft.openClosed ||
        draft.openOpen ||
        draft.closedClosed ||
        draft.closedOpen ||
        "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      openOpen: draft.openOpen || draft.openClosed,
      closedClosed: draft.closedClosed || draft.openClosed,
      closedOpen: draft.closedOpen || draft.openOpen || draft.openClosed,
    },
    draft.id ?? "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0",
  );
  const simulation = resolvePreviewSimulation(previewFrame);
  const blinking =
    globalBlinkEnabled &&
    draft.blinkEnabled &&
    (simulation.forceBlink || isBlinkClosedAtFrame(previewFrame, 30, seed, blinkSettings));
  const transform = resolveAvatarEffects({
    state: previewState,
    frame: previewFrame,
    fps: 30,
    isSpeaking: simulation.speaking,
    voiceChange: simulation.voiceChange,
    voiceChangeFrame: simulation.voiceChangeFrame,
    stateEnterFrame: simulation.cycleStartFrame,
    emphasisPulse: simulation.emphasisPulse,
    emphasisFrames: simulation.emphasisFrames,
    seed,
    motionScale: 1,
  });
  const previewImage = resolveStateImage(previewState, simulation.speaking, blinking);
  const hasPreviewImage = Boolean(
    draft.openClosed || draft.openOpen || draft.closedClosed || draft.closedOpen,
  );

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="state-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">STOCK DE AVATAR · {modeLabel(draft)}</p>
            <h2 id={titleId}>{draft.id ? "Editar estado" : "Añadir estado"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="state-editor-layout">
          <div>
            <div className="state-form-grid">
              <label>
                Nombre
                <input
                  value={draft.name}
                  maxLength={80}
                  onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })}
                />
              </label>
              <label>
                Emoji o icono
                <input
                  value={draft.emoji}
                  onChange={(event) => onChange({ ...draft, emoji: event.currentTarget.value })}
                />
              </label>
              <label>
                Render de imagen
                <select
                  value={draft.imageMode}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      imageMode: event.currentTarget.value as "smooth" | "pixel",
                    })
                  }
                >
                  <option value="smooth">Suave</option>
                  <option value="pixel">Pixel art</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={draft.resetAnimationOnEnter}
                  onChange={(event) =>
                    onChange({ ...draft, resetAnimationOnEnter: event.currentTarget.checked })
                  }
                />
                Reiniciar al entrar
              </label>
            </div>

            <div className="mode-banner">
              <b>{modeLabel(draft)}</b>
              <span>La imagen base es la única obligatoria.</span>
            </div>
            <div className="image-role-guide">
              <div className="guide-title">
                <b>Imágenes del estado</b>
                <span>Haz clic en un cuadro para agregar o reemplazar su imagen.</span>
              </div>
              <div className="guide-matrix">
                <span />
                <b>Sin hablar</b>
                <b>Hablando</b>
                <b>Ojos abiertos</b>
                {imageGuideCell("openClosed")}
                {imageGuideCell("openOpen")}
                <b>Ojos cerrados</b>
                {imageGuideCell("closedClosed")}
                {imageGuideCell("closedOpen")}
              </div>
              <small className="guide-legend">
                La imagen 1 es obligatoria · las imágenes 3 y 4 forman una pareja
              </small>
            </div>
            {draft.blinkEnabled && !blinkComplete ? (
              <p className="form-error">Completa juntas las dos imágenes de ojos cerrados.</p>
            ) : null}
            {assetError ? <p className="form-error">{assetError}</p> : null}
          </div>

          <aside className="effect-preview" aria-label="Vista previa de efectos">
            <div className="effect-preview-stage">
              {hasPreviewImage && previewImage ? (
                <img
                  src={previewImage}
                  alt="Vista previa del estado"
                  style={{
                    imageRendering: draft.imageMode === "pixel" ? "pixelated" : "auto",
                    filter: `brightness(${transform.brightness})`,
                    transform: `translate(${transform.translateX}px, ${transform.translateY}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
                  }}
                />
              ) : (
                <span
                  className="preview-guide-avatar"
                  role="img"
                  aria-label="Ejemplo visual del estado"
                  style={{
                    filter: `brightness(${transform.brightness})`,
                    transform: `translate(${transform.translateX}px, ${transform.translateY}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
                  }}
                >
                  <FaceGuide
                    eyes={blinking ? "closed" : "open"}
                    mouth={simulation.speaking ? "open" : "closed"}
                  />
                </span>
              )}
            </div>
            <div className="automatic-preview" aria-live="polite">
              <div className="preview-cycle-heading">
                <span>
                  <i className={previewPlaying ? "live" : ""} />
                  <b>Demo automática</b>
                </span>
                <button type="button" onClick={() => setPreviewPlaying((value) => !value)}>
                  {previewPlaying ? "Pausar" : "Continuar"}
                </button>
              </div>
              <div className="preview-phases">
                {(["entry", "speaking", "silence", "blink"] as const).map((phase) => (
                  <span className={simulation.phase === phase ? "active" : ""} key={phase}>
                    {previewPhaseLabel(phase)}
                  </span>
                ))}
              </div>
              <div
                className={simulation.speaking ? "simulated-wave speaking" : "simulated-wave"}
                aria-hidden="true"
              >
                {PREVIEW_WAVE_HEIGHTS.map((height) => (
                  <i key={height} style={{ height: `${height}px` }} />
                ))}
              </div>
              <div className="preview-cycle-progress">
                <i style={{ width: `${(simulation.phaseFrame / PREVIEW_CYCLE_FRAMES) * 100}%` }} />
              </div>
            </div>
            <small>
              Frame {previewFrame} · {previewPhaseLabel(simulation.phase)}
            </small>
          </aside>
        </div>

        <p className="state-effects-scope">
          Los efectos pertenecen a toda la grabación y se configuran desde el panel principal.
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary-action" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary-action" disabled={!canSave} onClick={onSave}>
            Guardar estado
          </button>
        </div>
      </section>
    </div>
  );
};
