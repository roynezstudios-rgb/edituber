import {
  deriveStateSeed,
  isBlinkClosedAtFrame,
  resolveAvatarEffects,
  resolveStateImage,
} from "@edituber/avatar-engine";
import {
  type AvatarEffects,
  type AvatarState,
  defaultBlinkSettings,
  defaultEffect,
  emptyAvatarEffects,
} from "@edituber/contracts";
import { useEffect, useId, useRef, useState } from "react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/apng",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const fileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

type ImageSlot = "openClosed" | "openOpen" | "closedClosed" | "closedOpen";

const slotGuide: Record<
  ImageSlot,
  {
    step: number;
    label: string;
    description: string;
    eyes: "open" | "closed";
    mouth: "open" | "closed";
  }
> = {
  openClosed: {
    step: 1,
    label: "Ojos abiertos · silencio",
    description: "Imagen normal cuando no estás hablando",
    eyes: "open",
    mouth: "closed",
  },
  openOpen: {
    step: 2,
    label: "Ojos abiertos · hablando",
    description: "Se muestra mientras detecta tu voz",
    eyes: "open",
    mouth: "open",
  },
  closedClosed: {
    step: 3,
    label: "Parpadeo · silencio",
    description: "Ojos cerrados cuando no estás hablando",
    eyes: "closed",
    mouth: "closed",
  },
  closedOpen: {
    step: 4,
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
  blinkPolicy: "auto" | "disabled";
  blink: ReturnType<typeof defaultBlinkSettings>;
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
  blinkPolicy: state?.blinkPolicy ?? "disabled",
  blink: structuredClone(state?.blink ?? defaultBlinkSettings()),
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
  if (
    !Number.isFinite(draft.blink.intervalMinSeconds) ||
    draft.blink.intervalMinSeconds < 0.8 ||
    draft.blink.intervalMinSeconds > 30 ||
    !Number.isFinite(draft.blink.intervalMaxSeconds) ||
    draft.blink.intervalMaxSeconds < 0.8 ||
    draft.blink.intervalMaxSeconds > 60 ||
    draft.blink.intervalMinSeconds > draft.blink.intervalMaxSeconds ||
    !Number.isFinite(draft.blink.durationMilliseconds) ||
    draft.blink.durationMilliseconds < 60 ||
    draft.blink.durationMilliseconds > 1000
  )
    throw new Error("La configuración de parpadeo está fuera de rango");
  const shared = {
    id,
    name: draft.name.trim(),
    emoji: draft.emoji.trim(),
    blinkPolicy: draft.blinkEnabled ? draft.blinkPolicy : ("disabled" as const),
    blink: structuredClone(draft.blink),
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
    blinkPolicy: "disabled",
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
    blinkPolicy: "disabled",
  };
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
}: {
  draft: StateDraft;
  onChange: (draft: StateDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  seed: number;
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [assetError, setAssetError] = useState("");
  const [previewFrame, setPreviewFrame] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewSpeaking, setPreviewSpeaking] = useState(false);
  const [voiceChangeFrame, setVoiceChangeFrame] = useState(0);
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
    onChange({ ...draft, [key]: await fileAsDataUrl(file) });
    setAssetError("");
  };
  const imageInput = (key: ImageSlot) => {
    const guide = slotGuide[key];
    return (
      <label className="asset-field">
        <span className="asset-role">
          <b className="asset-step">{guide.step}</b>
          <span>
            <b>{guide.label}</b>
            <small>{guide.description}</small>
          </span>
          <FaceGuide eyes={guide.eyes} mouth={guide.mouth} />
        </span>
        <input
          type="file"
          accept="image/png,image/apng,image/jpeg,image/webp,image/gif,image/svg+xml"
          onChange={(event) => void setImage(key, event.currentTarget.files?.[0])}
        />
        {draft[key] ? (
          <img src={draft[key]} alt={`Vista previa: ${guide.label}`} />
        ) : (
          <span className="empty-asset">
            <i aria-hidden="true">+</i>
            <small>Seleccionar imagen</small>
          </span>
        )}
      </label>
    );
  };

  const blinkComplete = Boolean(draft.closedClosed && draft.closedOpen);
  const blinkValuesValid =
    Number.isFinite(draft.blink.intervalMinSeconds) &&
    draft.blink.intervalMinSeconds >= 0.8 &&
    draft.blink.intervalMinSeconds <= 30 &&
    Number.isFinite(draft.blink.intervalMaxSeconds) &&
    draft.blink.intervalMaxSeconds >= 0.8 &&
    draft.blink.intervalMaxSeconds <= 60 &&
    draft.blink.intervalMinSeconds <= draft.blink.intervalMaxSeconds &&
    Number.isFinite(draft.blink.durationMilliseconds) &&
    draft.blink.durationMilliseconds >= 60 &&
    draft.blink.durationMilliseconds <= 1000;
  const canSave = Boolean(
    draft.name.trim() &&
      draft.emoji.trim() &&
      draft.openClosed &&
      (!draft.mouthEnabled || draft.openOpen) &&
      (!draft.blinkEnabled || blinkComplete) &&
      blinkValuesValid,
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
  const previewSeed = deriveStateSeed(seed, previewState.id);
  const blinking =
    draft.blinkEnabled &&
    draft.blinkPolicy === "auto" &&
    isBlinkClosedAtFrame(previewFrame, 30, previewSeed, draft.blink);
  const transform = resolveAvatarEffects({
    state: previewState,
    frame: previewFrame,
    fps: 30,
    isSpeaking: previewSpeaking,
    voiceChange: previewSpeaking ? "closedToOpen" : "openToClosed",
    voiceChangeFrame,
    stateEnterFrame: 0,
    emphasisPulse: previewSpeaking ? 0.75 : 0,
    emphasisFrames: [voiceChangeFrame],
    seed: previewSeed,
    motionScale: 1,
  });
  const previewImage = resolveStateImage(previewState, previewSpeaking, blinking);

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
                Reiniciar animación al entrar
              </label>
            </div>

            <div className="mode-banner">
              <b>{modeLabel(draft)}</b>
              <span>La imagen base es la única obligatoria.</span>
            </div>
            <div className="image-role-guide">
              <div className="guide-title">
                <b>Guía visual</b>
                <span>Combina ojos y boca según lo que esté ocurriendo.</span>
              </div>
              <div className="guide-matrix">
                <span />
                <b>Sin hablar</b>
                <b>Hablando</b>
                <b>Ojos abiertos</b>
                <span className="guide-cell active">
                  <FaceGuide eyes="open" mouth="closed" />
                  <small>1 · Base</small>
                </span>
                <span className={draft.mouthEnabled ? "guide-cell active" : "guide-cell optional"}>
                  <FaceGuide eyes="open" mouth="open" />
                  <small>2 · Boca</small>
                </span>
                <b>Ojos cerrados</b>
                <span className={draft.blinkEnabled ? "guide-cell active" : "guide-cell optional"}>
                  <FaceGuide eyes="closed" mouth="closed" />
                  <small>3 · Parpadeo</small>
                </span>
                <span className={draft.blinkEnabled ? "guide-cell active" : "guide-cell optional"}>
                  <FaceGuide eyes="closed" mouth="open" />
                  <small>4 · Parpadeo + voz</small>
                </span>
              </div>
              <small className="guide-legend">En color: activo · Atenuado: opcional</small>
            </div>
            <div className="asset-grid progressive">{imageInput("openClosed")}</div>
            <label className="progressive-toggle">
              <input
                type="checkbox"
                checked={draft.mouthEnabled}
                onChange={(event) => {
                  if (event.currentTarget.checked) {
                    onChange({ ...draft, mouthEnabled: true });
                    return;
                  }
                  const next = draftWithoutMouthImages(draft, () =>
                    window.confirm(
                      "Esto retirará las imágenes opcionales de boca y parpadeo. ¿Continuar?",
                    ),
                  );
                  if (next) onChange(next);
                }}
              />
              <span>
                <b>Agregar imagen al hablar</b>
                <small>Activa boca sincronizada.</small>
              </span>
            </label>
            {draft.mouthEnabled ? (
              <div className="asset-grid progressive">{imageInput("openOpen")}</div>
            ) : null}
            {draft.mouthEnabled && draft.openOpen ? (
              <label className="progressive-toggle">
                <input
                  type="checkbox"
                  checked={draft.blinkEnabled}
                  onChange={(event) => {
                    if (event.currentTarget.checked) {
                      onChange({ ...draft, blinkEnabled: true });
                      return;
                    }
                    const next = draftWithoutBlinkImages(draft, () =>
                      window.confirm("Se retirarán las dos imágenes de parpadeo. ¿Continuar?"),
                    );
                    if (next) onChange(next);
                  }}
                />
                <span>
                  <b>Agregar parpadeo</b>
                  <small>Los dos slots se agregan o retiran juntos.</small>
                </span>
              </label>
            ) : null}
            {draft.blinkEnabled ? (
              <>
                <div className="asset-grid progressive blink-pair">
                  {imageInput("closedClosed")}
                  {imageInput("closedOpen")}
                </div>
                <fieldset className="blink-settings">
                  <legend>Parpadeo por estado</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.blinkPolicy === "auto"}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blinkPolicy: event.currentTarget.checked ? "auto" : "disabled",
                        })
                      }
                    />
                    Automático
                  </label>
                  <label>
                    Intervalo mínimo (s)
                    <input
                      type="number"
                      min="0.8"
                      max="30"
                      step="0.1"
                      value={draft.blink.intervalMinSeconds}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blink: {
                            ...draft.blink,
                            intervalMinSeconds: Number(event.currentTarget.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Intervalo máximo (s)
                    <input
                      type="number"
                      min="0.8"
                      max="60"
                      step="0.1"
                      value={draft.blink.intervalMaxSeconds}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blink: {
                            ...draft.blink,
                            intervalMaxSeconds: Number(event.currentTarget.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Duración (ms)
                    <input
                      type="number"
                      min="60"
                      max="1000"
                      step="10"
                      value={draft.blink.durationMilliseconds}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blink: {
                            ...draft.blink,
                            durationMilliseconds: Number(event.currentTarget.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.blink.syncAnimatedImages}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blink: {
                            ...draft.blink,
                            syncAnimatedImages: event.currentTarget.checked,
                          },
                        })
                      }
                    />
                    Sincronizar imágenes animadas
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.blink.playAnimationToEnd}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          blink: {
                            ...draft.blink,
                            playAnimationToEnd: event.currentTarget.checked,
                          },
                        })
                      }
                    />
                    Reproducir animación hasta el final
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      let target = previewFrame + 1;
                      while (
                        target < previewFrame + 180 &&
                        !isBlinkClosedAtFrame(target, 30, previewSeed, draft.blink)
                      )
                        target += 1;
                      setPreviewFrame(target);
                    }}
                  >
                    Probar parpadeo
                  </button>
                </fieldset>
              </>
            ) : (
              <p className="field-help">
                El parpadeo por intercambio de imágenes está deshabilitado en modos de 1 y 2
                imágenes.
              </p>
            )}
            {draft.blinkEnabled && !blinkComplete ? (
              <p className="form-error">Completa juntas las dos imágenes de ojos cerrados.</p>
            ) : null}
            {draft.blink.intervalMinSeconds > draft.blink.intervalMaxSeconds ? (
              <p className="form-error">El intervalo mínimo no puede superar al máximo.</p>
            ) : null}
            {!blinkValuesValid &&
            draft.blink.intervalMinSeconds <= draft.blink.intervalMaxSeconds ? (
              <p className="form-error">Revisa los límites de intervalo y duración.</p>
            ) : null}
            {assetError ? <p className="form-error">{assetError}</p> : null}
          </div>

          <aside className="effect-preview" aria-label="Vista previa de efectos">
            <div className="effect-preview-stage">
              {previewImage ? (
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
                <span>Sube la imagen base</span>
              )}
            </div>
            <div className="preview-controls">
              <button type="button" onClick={() => setPreviewPlaying((value) => !value)}>
                {previewPlaying ? "Pausar" : "Reproducir"}
              </button>
              <button
                type="button"
                aria-pressed={previewSpeaking}
                onClick={() => {
                  setPreviewSpeaking((value) => !value);
                  setVoiceChangeFrame(previewFrame);
                }}
              >
                {previewSpeaking ? "Simular silencio" : "Simular voz"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewFrame(0);
                  setVoiceChangeFrame(0);
                  setPreviewPlaying(true);
                }}
              >
                Probar entrada
              </button>
            </div>
            <small>
              Frame {previewFrame} · {previewSpeaking ? "voz" : "silencio"}
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
