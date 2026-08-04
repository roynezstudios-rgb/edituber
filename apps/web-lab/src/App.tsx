import { analyzeAudioBuffer } from "@edituber/audio-engine";
import type {
  AvatarManifestV2,
  AvatarState,
  EdituberProjectV2,
  MotionPreset,
  PortableEdituberDocumentV1,
} from "@edituber/contracts";
import { type EdituberBundle, resolveFrameState } from "@edituber/core";
import {
  frameFromTimelinePosition,
  removeStateEvent,
  upsertStateEvent,
} from "@edituber/timeline-engine";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { fixtureBundle } from "./fixture";
import { parsePortableDocument, serializePortableDocument } from "./portable";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 600;
const localRenderAvailable = import.meta.env.DEV;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const formatTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;

const fileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

const probeAudioDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = () => URL.revokeObjectURL(url);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      finish();
      resolve(duration);
    };
    audio.onerror = () => {
      finish();
      reject(new Error("El navegador no reconoce este audio"));
    };
    audio.src = url;
  });

type StateDraft = Omit<AvatarState, "id" | "images"> & {
  id?: string;
  openClosed: string;
  openOpen: string;
  closedClosed: string;
  closedOpen: string;
};

const draftFromState = (state?: AvatarState): StateDraft => ({
  id: state?.id,
  name: state?.name ?? "Nuevo estado",
  emoji: state?.emoji ?? "🙂",
  blinkPolicy: state?.blinkPolicy ?? "disabled",
  motionPreset: state?.motionPreset ?? "idle",
  openClosed: state?.images.eyesOpen.mouthClosed ?? "",
  openOpen: state?.images.eyesOpen.mouthOpen ?? "",
  closedClosed: state?.images.eyesClosed?.mouthClosed ?? "",
  closedOpen: state?.images.eyesClosed?.mouthOpen ?? "",
});

const StateEditor = ({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: StateDraft;
  onChange: (draft: StateDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) => {
  const titleId = useId();
  const setImage = async (
    key: "openClosed" | "openOpen" | "closedClosed" | "closedOpen",
    file?: File,
  ) => {
    if (file) onChange({ ...draft, [key]: await fileAsDataUrl(file) });
  };
  const imageInput = (
    key: "openClosed" | "openOpen" | "closedClosed" | "closedOpen",
    label: string,
    required = false,
  ) => (
    <label className="asset-field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => void setImage(key, event.currentTarget.files?.[0])}
      />
      {draft[key] ? (
        <img src={draft[key]} alt={`Vista previa: ${label}`} />
      ) : (
        <i aria-hidden="true">+</i>
      )}
    </label>
  );
  const hasBlinkPair = Boolean(draft.closedClosed && draft.closedOpen);
  const partialBlink = Boolean(draft.closedClosed) !== Boolean(draft.closedOpen);
  const canSave =
    draft.name.trim() && draft.emoji.trim() && draft.openClosed && draft.openOpen && !partialBlink;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="state-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">STOCK DE AVATAR</p>
            <h2 id={titleId}>{draft.id ? "Editar estado" : "Añadir estado"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onCancel}>
            ×
          </button>
        </div>
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
            Parpadeo
            <select
              value={hasBlinkPair ? draft.blinkPolicy : "disabled"}
              disabled={!hasBlinkPair}
              onChange={(event) =>
                onChange({
                  ...draft,
                  blinkPolicy: event.currentTarget.value as "auto" | "disabled",
                })
              }
            >
              <option value="auto">Automático</option>
              <option value="disabled">Desactivado</option>
            </select>
          </label>
          <label>
            Movimiento
            <select
              value={draft.motionPreset}
              onChange={(event) =>
                onChange({ ...draft, motionPreset: event.currentTarget.value as MotionPreset })
              }
            >
              <option value="idle">Idle sutil</option>
              <option value="surprise">Sorpresa</option>
              <option value="emphasis">Énfasis</option>
              <option value="kiss">Beso</option>
            </select>
          </label>
        </div>
        <p className="field-help">
          Dos imágenes son obligatorias. Añade ambas imágenes de ojos cerrados para habilitar
          parpadeo.
        </p>
        <div className="asset-grid">
          {imageInput("openClosed", "Ojos abiertos · boca cerrada", true)}
          {imageInput("openOpen", "Ojos abiertos · boca abierta", true)}
          {imageInput("closedClosed", "Ojos cerrados · boca cerrada")}
          {imageInput("closedOpen", "Ojos cerrados · boca abierta")}
        </div>
        {partialBlink ? (
          <p className="form-error">El parpadeo necesita las dos imágenes de ojos cerrados.</p>
        ) : null}
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

export const App = () => {
  const mouthSensitivityId = useId();
  const stockTitleId = useId();
  const pickerTitleId = useId();
  const deleteTitleId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<EdituberProjectV2>(() => clone(fixtureBundle.project));
  const [avatar, setAvatar] = useState<AvatarManifestV2>(() => clone(fixtureBundle.avatar));
  const [envelope, setEnvelope] = useState(fixtureBundle.envelope);
  const [audioSource, setAudioSource] = useState(fixtureBundle.audioSource);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState(
    localRenderAvailable
      ? "Fixture listo · misma lógica que la CLI"
      : "Web Lab público · el render MP4 se ejecuta mediante la CLI local",
  );
  const [rendering, setRendering] = useState(false);
  const [stateDraft, setStateDraft] = useState<StateDraft | null>(null);
  const [pickerFrame, setPickerFrame] = useState<number | null>(null);
  const [deleteStateId, setDeleteStateId] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const bundle: EdituberBundle = useMemo(
    () => ({ project, avatar, envelope, audioSource }),
    [project, avatar, envelope, audioSource],
  );
  const state = resolveFrameState(bundle, frame);
  const durationSeconds = project.durationInFrames / project.fps;
  const currentSeconds = frame / project.fps;
  const visualSize = Math.min(project.width, project.height) * 0.76;
  const activeState = avatar.states.find((candidate) => candidate.id === state.avatar.stateId);

  const stopDriver = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);
  const drive = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) {
      setPlaying(false);
      stopDriver();
      return;
    }
    setFrame(Math.min(project.durationInFrames - 1, Math.floor(audio.currentTime * project.fps)));
    animationRef.current = requestAnimationFrame(drive);
  }, [project.durationInFrames, project.fps, stopDriver]);
  useEffect(() => () => stopDriver(), [stopDriver]);

  const seekToFrame = (next: number) => {
    const safe = Math.max(0, Math.min(project.durationInFrames - 1, Math.floor(next)));
    setFrame(safe);
    if (audioRef.current) audioRef.current.currentTime = safe / project.fps;
  };
  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.currentTime >= durationSeconds - 0.02) audio.currentTime = 0;
      await audio.play();
      setPlaying(true);
      animationRef.current = requestAnimationFrame(drive);
    } else {
      audio.pause();
      setPlaying(false);
      stopDriver();
    }
  };
  const updateSetting = <K extends keyof EdituberProjectV2["settings"]>(
    key: K,
    value: EdituberProjectV2["settings"][K],
  ) => setProject((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));

  const chooseState = (stateId: string) => {
    const target = pickerFrame ?? frame;
    setProject((current) => ({
      ...current,
      avatar: {
        ...current.avatar,
        defaultStateId: target === 0 ? stateId : current.avatar.defaultStateId,
      },
      stateEvents: upsertStateEvent(
        current.stateEvents,
        { frame: target, stateId },
        target === 0 ? stateId : current.avatar.defaultStateId,
      ),
    }));
    seekToFrame(target);
    setPickerFrame(null);
    setStatus(`Estado colocado en el frame ${target}`);
  };

  const saveState = () => {
    if (!stateDraft) return;
    const id = stateDraft.id ?? crypto.randomUUID();
    const next: AvatarState = {
      id,
      name: stateDraft.name.trim(),
      emoji: stateDraft.emoji.trim(),
      blinkPolicy:
        stateDraft.closedClosed && stateDraft.closedOpen ? stateDraft.blinkPolicy : "disabled",
      motionPreset: stateDraft.motionPreset,
      images: {
        eyesOpen: { mouthClosed: stateDraft.openClosed, mouthOpen: stateDraft.openOpen },
        ...(stateDraft.closedClosed && stateDraft.closedOpen
          ? {
              eyesClosed: {
                mouthClosed: stateDraft.closedClosed,
                mouthOpen: stateDraft.closedOpen,
              },
            }
          : {}),
      },
    };
    setAvatar((current) => ({
      ...current,
      states: stateDraft.id
        ? current.states.map((item) => (item.id === id ? next : item))
        : [...current.states, next],
    }));
    setStateDraft(null);
    setStatus(`${next.name} guardado`);
  };
  const duplicateState = (source: AvatarState) => {
    const duplicate = { ...clone(source), id: crypto.randomUUID(), name: `${source.name} copia` };
    setAvatar((current) => ({ ...current, states: [...current.states, duplicate] }));
    setStatus(`${duplicate.name} añadido`);
  };
  const requestDelete = (stateId: string) => {
    if (avatar.states.length === 1) {
      setStatus("Debe existir al menos un estado");
      return;
    }
    setDeleteStateId(stateId);
    setReplacementId(avatar.states.find((candidate) => candidate.id !== stateId)?.id ?? "");
  };
  const confirmDelete = () => {
    if (!deleteStateId || !replacementId) return;
    setAvatar((current) => ({
      ...current,
      defaultStateId:
        current.defaultStateId === deleteStateId ? replacementId : current.defaultStateId,
      states: current.states.filter((item) => item.id !== deleteStateId),
    }));
    setProject((current) => ({
      ...current,
      avatar: {
        ...current.avatar,
        defaultStateId:
          current.avatar.defaultStateId === deleteStateId
            ? replacementId
            : current.avatar.defaultStateId,
      },
      stateEvents: current.stateEvents.map((event) =>
        event.stateId === deleteStateId ? { ...event, stateId: replacementId } : event,
      ),
    }));
    setDeleteStateId(null);
    setStatus("Estado eliminado y referencias reemplazadas");
  };

  const handleAudio = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setStatus("Selecciona un archivo de audio reconocido");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setStatus("El audio supera el límite de seguridad de 100 MB");
      return;
    }
    setStatus("Comprobando duración…");
    try {
      const metadataDuration = await probeAudioDuration(file);
      if (!Number.isFinite(metadataDuration) || metadataDuration > MAX_DURATION_SECONDS) {
        setStatus("El audio supera 10 minutos y no fue analizado");
        return;
      }
      setStatus("Analizando audio localmente…");
      const [buffer, dataUrl] = await Promise.all([file.arrayBuffer(), fileAsDataUrl(file)]);
      const nextEnvelope = await analyzeAudioBuffer(
        buffer,
        project.fps,
        `upload:${file.name}:${file.size}`,
      );
      const nextDuration = nextEnvelope.frames.length / project.fps;
      setAudioSource(dataUrl);
      setEnvelope(nextEnvelope);
      setProject((current) => ({
        ...current,
        durationInFrames: nextEnvelope.frames.length,
        audio: { ...current.audio, source: file.name, durationSeconds: nextDuration },
        stateEvents: current.stateEvents.filter(
          (event) => event.frame < nextEnvelope.frames.length,
        ),
      }));
      setFrame(0);
      setStatus(`${file.name} · ${nextDuration.toFixed(1)} s · análisis local terminado`);
    } catch (error) {
      setStatus(`No se pudo analizar el audio: ${String(error)}`);
    }
  };

  const exportProject = () => {
    const portable: PortableEdituberDocumentV1 = {
      format: "edituber-portable",
      version: 1,
      project,
      avatar,
      envelope,
      audioSource: audioSource.startsWith("data:") ? audioSource : undefined,
    };
    const url = URL.createObjectURL(
      new Blob([serializePortableDocument(portable)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "proyecto.edituber.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const document = parsePortableDocument(await file.text());
      setProject(document.project);
      setAvatar(document.avatar);
      if (document.envelope) setEnvelope(document.envelope);
      if (document.audioSource) setAudioSource(document.audioSource);
      setFrame(0);
      setStatus(`${file.name} importado`);
    } catch (error) {
      setStatus(`No se pudo importar: ${String(error)}`);
    }
  };

  const renderDemo = async () => {
    setRendering(true);
    setStatus("Render local 1080 × 1080 en proceso…");
    try {
      const response = await fetch("/api/render-demo", { method: "POST" });
      const result = (await response.json()) as { ok: boolean; download?: string; error?: string };
      if (!response.ok || !result.ok || !result.download)
        throw new Error(result.error ?? "Render failed");
      setStatus("MP4 terminado y listo para descargar");
      window.location.href = result.download;
    } catch (error) {
      setStatus(`Render no disponible: ${String(error)}`);
    } finally {
      setRendering(false);
    }
  };
  const bars = useMemo(
    () =>
      Array.from(
        { length: 72 },
        (_, index) =>
          envelope.frames[
            Math.min(envelope.frames.length - 1, Math.floor((index / 72) * envelope.frames.length))
          ]?.amplitudeSmoothed ?? 0,
      ),
    [envelope],
  );
  const rulerSeconds = useMemo(
    () => Array.from({ length: 5 }, (_, index) => (durationSeconds * index) / 4),
    [durationSeconds],
  );
  const timelineKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      seekToFrame(frame + (event.key === "ArrowLeft" ? -1 : 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPickerFrame(frame);
    }
  };

  const motion = reducedMotion
    ? { translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    : state.avatar.transform;
  return (
    <main className="app-shell">
      {/* biome-ignore lint/a11y/useMediaCaption: user-supplied narration is a transport source */}
      <audio
        ref={audioRef}
        src={audioSource}
        preload="metadata"
        onEnded={() => {
          setPlaying(false);
          stopDriver();
        }}
      />
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          E
        </div>
        <div>
          <p className="eyebrow">MOTOR 0.2</p>
          <h1>
            EDITuber <span>Web Lab</span>
          </h1>
        </div>
        <div className="engine-pill">
          <i /> Determinista
        </div>
      </header>
      <div className="workspace-grid">
        <section className="preview-panel panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PREVIEW COMPARTIDO</p>
              <h2>Actuación</h2>
            </div>
            <div className="frame-readout">F{String(frame).padStart(3, "0")}</div>
          </div>
          <div className="stage-wrap">
            <div className="stage" style={{ backgroundColor: state.backgroundColor }}>
              <div className="safe-area" />
              <div
                className="avatar-parent"
                style={{
                  left: `${state.positionX * 100}%`,
                  top: `${state.positionY * 100}%`,
                  width: `${(visualSize / project.width) * 100}%`,
                  transform: `translate(-50%, -50%) translateY(${motion.translateY}px) rotate(${motion.rotation}deg) scale(${state.scale * motion.scaleX}, ${state.scale * motion.scaleY})`,
                }}
              >
                <img src={state.avatar.shell} alt="" />
                {state.avatar.previousFace ? (
                  <img
                    src={state.avatar.previousFace}
                    alt=""
                    style={{ opacity: state.avatar.previousOpacity }}
                  />
                ) : null}
                <img
                  src={state.avatar.currentFace}
                  alt=""
                  style={{ opacity: state.avatar.currentOpacity }}
                />
              </div>
              <div className="stage-badge">
                {activeState?.emoji} {activeState?.name} ·{" "}
                {state.avatar.mouthOpen ? "BOCA ABIERTA" : "BOCA CERRADA"}
              </div>
            </div>
          </div>
          <div className="transport">
            <button
              type="button"
              className="play-button"
              aria-label={playing ? "Pausar" : "Reproducir"}
              onClick={() => void togglePlayback()}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <span className="timecode">{formatTime(currentSeconds)}</span>
            <input
              aria-label="Posición del audio"
              type="range"
              min="0"
              max={Math.max(0, project.durationInFrames - 1)}
              value={frame}
              onChange={(event) => seekToFrame(Number(event.currentTarget.value))}
            />
            <span className="timecode muted">{formatTime(durationSeconds)}</span>
          </div>
          <div className="waveform" aria-hidden="true">
            {bars.map((value, index) => (
              <i
                key={`${index}-${value}`}
                className={index / bars.length <= frame / project.durationInFrames ? "played" : ""}
                style={{ height: `${Math.max(7, value * 45)}px` }}
              />
            ))}
          </div>
        </section>

        <aside className="control-panel panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CONTROLES</p>
              <h2>Laboratorio</h2>
            </div>
          </div>
          <label className="upload-card">
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => void handleAudio(event.currentTarget.files?.[0])}
            />
            <span className="upload-icon" aria-hidden="true">
              ↑
            </span>
            <span>
              <b>Subir audio</b>
              <small>Local · máximo 100 MB / 10 min</small>
            </span>
          </label>
          <div className="control-group">
            <label className="control-label" htmlFor={mouthSensitivityId}>
              <span>Sensibilidad de boca</span>
              <b>{project.settings.mouthSensitivity.toFixed(2)}</b>
            </label>
            <input
              id={mouthSensitivityId}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={project.settings.mouthSensitivity}
              onChange={(event) =>
                updateSetting("mouthSensitivity", Number(event.currentTarget.value))
              }
            />
          </div>
          <div className="control-group row-control">
            <div>
              <span>Fondo sólido</span>
              <small>Chroma personalizable</small>
            </div>
            <label className="color-input">
              <i style={{ backgroundColor: project.stage.backgroundColor }} />
              <input
                aria-label="Color de fondo"
                type="color"
                value={project.stage.backgroundColor}
                onChange={(event) =>
                  setProject((current) => ({
                    ...current,
                    stage: {
                      ...current.stage,
                      backgroundColor: event.currentTarget.value.toUpperCase(),
                    },
                  }))
                }
              />
              <code>{project.stage.backgroundColor}</code>
            </label>
          </div>
          <div className="switch-grid">
            <label>
              <span>
                Parpadeo<small>Semilla {project.seed}</small>
              </span>
              <input
                aria-label="Activar parpadeo"
                type="checkbox"
                checked={project.settings.blinkEnabled}
                onChange={(event) => updateSetting("blinkEnabled", event.currentTarget.checked)}
              />
            </label>
            <label>
              <span>
                TalkBounce<small>Contenedor padre</small>
              </span>
              <input
                aria-label="Activar TalkBounce"
                type="checkbox"
                checked={project.settings.talkBounceEnabled}
                onChange={(event) =>
                  updateSetting("talkBounceEnabled", event.currentTarget.checked)
                }
              />
            </label>
          </div>

          <section className="state-stock" aria-labelledby={stockTitleId}>
            <div className="stock-heading">
              <div>
                <span id={stockTitleId}>Stock de estados</span>
                <small>{avatar.states.length} disponibles · sin límite fijo</small>
              </div>
              <button
                type="button"
                className="add-state"
                onClick={() => setStateDraft(draftFromState())}
              >
                + Añadir
              </button>
            </div>
            <div className="state-list">
              {avatar.states.map((item) => (
                <article
                  className={item.id === state.avatar.stateId ? "state-card active" : "state-card"}
                  key={item.id}
                >
                  <button
                    type="button"
                    className="state-main"
                    aria-label={`Usar ${item.name} en frame ${frame}`}
                    aria-pressed={item.id === state.avatar.stateId}
                    onClick={() => chooseState(item.id)}
                  >
                    <span>{item.emoji}</span>
                    <b>{item.name}</b>
                    <small>{item.images.eyesClosed ? "4 imágenes" : "2 imágenes"}</small>
                  </button>
                  <div className="state-actions">
                    <button
                      type="button"
                      aria-label={`Editar ${item.name}`}
                      onClick={() => setStateDraft(draftFromState(item))}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      aria-label={`Duplicar ${item.name}`}
                      onClick={() => duplicateState(item)}
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${item.name}`}
                      onClick={() => requestDelete(item.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <div className="action-grid">
            <button
              type="button"
              className="secondary-action"
              onClick={() => importRef.current?.click()}
            >
              Importar JSON
            </button>
            <input
              ref={importRef}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                void importProject(event.currentTarget.files?.[0])
              }
            />
            <button type="button" className="secondary-action" onClick={exportProject}>
              Exportar JSON
            </button>
            <button
              type="button"
              className="primary-action wide"
              disabled={rendering || !localRenderAvailable}
              onClick={() => void renderDemo()}
            >
              {localRenderAvailable
                ? rendering
                  ? "Renderizando…"
                  : "Renderizar demo"
                : "MP4 mediante CLI local"}
            </button>
          </div>
          <p className="status-line" aria-live="polite">
            <i /> {status}
          </p>
        </aside>

        <section className="timeline-panel panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">PROYECTO JSON</p>
              <h2>Timeline de estados</h2>
            </div>
            <span className="timeline-help">Toca la pista para elegir un estado</span>
          </div>
          <div className="ruler">
            {rulerSeconds.map((second) => (
              <span
                key={second}
                style={{ left: `${durationSeconds ? (second / durationSeconds) * 100 : 0}%` }}
              >
                {second.toFixed(second < 10 ? 1 : 0)}s
              </span>
            ))}
          </div>
          <div
            className="timeline-track"
            role="slider"
            tabIndex={0}
            aria-label="Timeline de estados"
            aria-valuemin={0}
            aria-valuemax={project.durationInFrames - 1}
            aria-valuenow={frame}
            onKeyDown={timelineKey}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const target = frameFromTimelinePosition(
                event.clientX,
                rect.left,
                rect.width,
                project.durationInFrames,
              );
              seekToFrame(target);
              setPickerFrame(target);
            }}
          >
            <div
              className="timeline-progress"
              style={{ width: `${(frame / Math.max(1, project.durationInFrames - 1)) * 100}%` }}
            />
            <div
              className="playhead"
              style={{ left: `${(frame / Math.max(1, project.durationInFrames - 1)) * 100}%` }}
            />
            {project.stateEvents.map((event) => {
              const markerState = avatar.states.find((item) => item.id === event.stateId);
              return (
                <button
                  type="button"
                  key={`${event.frame}-${event.stateId}`}
                  className="event-marker"
                  style={{
                    left: `${(event.frame / Math.max(1, project.durationInFrames - 1)) * 100}%`,
                  }}
                  aria-label={`${markerState?.name ?? "Estado"} en frame ${event.frame}`}
                  onClick={(click) => {
                    click.stopPropagation();
                    seekToFrame(event.frame);
                    setPickerFrame(event.frame);
                  }}
                >
                  {markerState?.emoji ?? "?"}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {stateDraft ? (
        <StateEditor
          draft={stateDraft}
          onChange={setStateDraft}
          onCancel={() => setStateDraft(null)}
          onSave={saveState}
        />
      ) : null}
      {pickerFrame !== null ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="timeline-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby={pickerTitleId}
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">FRAME {pickerFrame}</p>
                <h2 id={pickerTitleId}>Elegir estado</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                onClick={() => setPickerFrame(null)}
              >
                ×
              </button>
            </div>
            <div className="picker-list">
              {avatar.states.map((item) => (
                <button type="button" key={item.id} onClick={() => chooseState(item.id)}>
                  <span>{item.emoji}</span>
                  <b>{item.name}</b>
                </button>
              ))}
            </div>
            {pickerFrame > 0 && project.stateEvents.some((event) => event.frame === pickerFrame) ? (
              <button
                type="button"
                className="delete-marker"
                onClick={() => {
                  setProject((current) => ({
                    ...current,
                    stateEvents: removeStateEvent(
                      current.stateEvents,
                      pickerFrame,
                      current.avatar.defaultStateId,
                    ),
                  }));
                  setPickerFrame(null);
                  setStatus(`Marcador del frame ${pickerFrame} eliminado`);
                }}
              >
                Eliminar marcador
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
      {deleteStateId ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={deleteTitleId}
          >
            <div className="dialog-heading">
              <h2 id={deleteTitleId}>Eliminar estado</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                onClick={() => setDeleteStateId(null)}
              >
                ×
              </button>
            </div>
            <p>Las apariciones existentes deben cambiarse por otro estado.</p>
            <label>
              Reemplazar por
              <select
                value={replacementId}
                onChange={(event) => setReplacementId(event.currentTarget.value)}
              >
                {avatar.states
                  .filter((item) => item.id !== deleteStateId)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.emoji} {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setDeleteStateId(null)}
              >
                Cancelar
              </button>
              <button type="button" className="danger-action" onClick={confirmDelete}>
                Eliminar y reemplazar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};
