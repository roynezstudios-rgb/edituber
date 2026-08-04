import { analyzeAudioBuffer } from "@edituber/audio-engine";
import type { EdituberProjectV1, ExpressionEvent } from "@edituber/contracts";
import { type EdituberBundle, resolveFrameState } from "@edituber/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fixtureBundle } from "./fixture";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 600;
const localRenderAvailable = import.meta.env.DEV;

const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
};

const cloneProject = (project: EdituberProjectV1): EdituberProjectV1 =>
  JSON.parse(JSON.stringify(project)) as EdituberProjectV1;

export const App = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);
  const uploadedUrl = useRef<string | null>(null);
  const [project, setProject] = useState(() => cloneProject(fixtureBundle.project));
  const [envelope, setEnvelope] = useState(fixtureBundle.envelope);
  const [audioSource, setAudioSource] = useState(fixtureBundle.audioSource);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState(() =>
    localRenderAvailable
      ? "Fixture listo · misma lógica que la CLI"
      : "Web Lab público · el render MP4 se ejecuta mediante la CLI local",
  );
  const [rendering, setRendering] = useState(false);

  const bundle: EdituberBundle = useMemo(
    () => ({ project, avatar: fixtureBundle.avatar, envelope, audioSource }),
    [project, envelope, audioSource],
  );
  const state = resolveFrameState(bundle, frame);
  const durationSeconds = project.durationInFrames / project.fps;
  const currentSeconds = frame / project.fps;
  const visualSize = Math.min(project.width, project.height) * 0.76;

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
  useEffect(
    () => () => {
      if (uploadedUrl.current) URL.revokeObjectURL(uploadedUrl.current);
    },
    [],
  );

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

  const seekToFrame = (nextFrame: number) => {
    const safe = Math.max(0, Math.min(project.durationInFrames - 1, Math.floor(nextFrame)));
    setFrame(safe);
    if (audioRef.current) audioRef.current.currentTime = safe / project.fps;
  };

  const updateSetting = <Key extends keyof EdituberProjectV1["settings"]>(
    key: Key,
    value: EdituberProjectV1["settings"][Key],
  ) => setProject((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));

  const setExpression = (emoji: string) => {
    setProject((current) => {
      let events: ExpressionEvent[];
      if (frame === 0) {
        events = current.expressionEvents.map((event) =>
          event.frame === 0 ? { frame: 0, emoji } : event,
        );
      } else {
        events = [
          ...current.expressionEvents.filter((event) => event.frame !== frame),
          { frame, emoji },
        ].sort((a, b) => a.frame - b.frame);
      }
      return {
        ...current,
        avatar: {
          ...current.avatar,
          defaultExpression: frame === 0 ? emoji : current.avatar.defaultExpression,
        },
        expressionEvents: events,
      };
    });
    setStatus(`${emoji} colocado en el frame ${frame}`);
  };

  const handleAudio = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) {
      setStatus("El audio supera el límite de seguridad de 100 MB");
      return;
    }
    setStatus("Analizando audio localmente…");
    try {
      const buffer = await file.arrayBuffer();
      const nextEnvelope = await analyzeAudioBuffer(
        buffer,
        project.fps,
        `upload:${file.name}:${file.size}`,
      );
      const nextDuration = nextEnvelope.frames.length / project.fps;
      if (nextDuration > MAX_DURATION_SECONDS) {
        setStatus("El audio supera 10 minutos y no fue recortado");
        return;
      }
      if (uploadedUrl.current) URL.revokeObjectURL(uploadedUrl.current);
      const url = URL.createObjectURL(file);
      uploadedUrl.current = url;
      setAudioSource(url);
      setEnvelope(nextEnvelope);
      setProject((current) => ({
        ...current,
        durationInFrames: nextEnvelope.frames.length,
        audio: { ...current.audio, source: file.name, durationSeconds: nextDuration },
        expressionEvents: current.expressionEvents.filter(
          (event) => event.frame < nextEnvelope.frames.length,
        ),
      }));
      setFrame(0);
      setStatus(`${file.name} · ${nextDuration.toFixed(1)} s · envolvente cacheada en memoria`);
    } catch (error) {
      setStatus(`No se pudo analizar el audio: ${String(error)}`);
    }
  };

  const downloadProject = () => {
    const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "proyecto.edituber.json";
    link.click();
    URL.revokeObjectURL(url);
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

  const bars = useMemo(() => {
    const count = 72;
    return Array.from({ length: count }, (_, index) => {
      const envelopeIndex = Math.min(
        envelope.frames.length - 1,
        Math.floor((index / count) * envelope.frames.length),
      );
      return envelope.frames[envelopeIndex]?.amplitudeSmoothed ?? 0;
    });
  }, [envelope]);

  return (
    <main className="app-shell">
      {/* biome-ignore lint/a11y/useMediaCaption: narration is user-supplied and this hidden element is a transport source */}
      <audio
        ref={audioRef}
        src={audioSource}
        preload="auto"
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
          <p className="eyebrow">MOTOR 0.1</p>
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
                  transform: `translate(-50%, -50%) translateY(${state.avatar.bouncePixels}px) scale(${state.scale})`,
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
                  alt={`Expresión ${state.avatar.emoji}`}
                  style={{ opacity: state.avatar.currentOpacity }}
                />
              </div>
              <div className="stage-badge">1080 × 1080 · 30 FPS</div>
            </div>
          </div>

          <div className="transport">
            <button className="play-button" type="button" onClick={togglePlayback}>
              {playing ? "❚❚" : "▶"}
              <span className="sr-only">{playing ? "Pausar" : "Reproducir"}</span>
            </button>
            <span className="timecode">{formatTime(currentSeconds)}</span>
            <input
              aria-label="Posición del audio"
              type="range"
              min="0"
              max={project.durationInFrames - 1}
              value={frame}
              onChange={(event) => seekToFrame(Number(event.currentTarget.value))}
            />
            <span className="timecode muted">{formatTime(durationSeconds)}</span>
          </div>

          <div className="waveform" role="img" aria-label="Envolvente de audio">
            {bars.map((value, index) => (
              <i
                key={`${index}-${value}`}
                className={index / bars.length <= frame / project.durationInFrames ? "played" : ""}
                style={{ height: `${Math.max(8, value * 100)}%` }}
              />
            ))}
          </div>
        </section>

        <aside className="control-panel panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">ENTRADA</p>
              <h2>Controles</h2>
            </div>
          </div>

          <label className="upload-card">
            <span className="upload-icon">↑</span>
            <span>
              <b>Cargar narración</b>
              <small>WAV, MP3, M4A · máx. 10 min</small>
            </span>
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => void handleAudio(event.currentTarget.files?.[0])}
            />
          </label>

          <div className="control-group">
            <div className="control-label">
              <span>Sensibilidad de boca</span>
              <b>{project.settings.mouthSensitivity.toFixed(2)}</b>
            </div>
            <input
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
                type="checkbox"
                checked={project.settings.blinkEnabled}
                onChange={(e) => updateSetting("blinkEnabled", e.currentTarget.checked)}
              />
            </label>
            <label>
              <span>
                TalkBounce<small>Contenedor padre</small>
              </span>
              <input
                type="checkbox"
                checked={project.settings.talkBounceEnabled}
                onChange={(e) => updateSetting("talkBounceEnabled", e.currentTarget.checked)}
              />
            </label>
          </div>

          <div className="expression-picker">
            <div className="control-label">
              <span>Expresión en el playhead</span>
              <b>{state.avatar.emoji}</b>
            </div>
            <div className="emoji-row">
              {fixtureBundle.avatar.expressions.map((expression) => (
                <button
                  type="button"
                  key={expression.id}
                  className={state.avatar.emoji === expression.emoji ? "active" : ""}
                  onClick={() => setExpression(expression.emoji)}
                >
                  {expression.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="action-grid">
            <button type="button" className="secondary-action" onClick={downloadProject}>
              Descargar JSON
            </button>
            <button
              type="button"
              className="primary-action"
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
          <p className="status-line">
            <i /> {status}
          </p>
        </aside>

        <section className="timeline-panel panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">PROYECTO JSON</p>
              <h2>Timeline de expresiones</h2>
            </div>
            <span className="timeline-help">Toca un emoji para mover el playhead</span>
          </div>
          <div className="ruler">
            {[0, 1, 2, 3, 4, 5, 6].map((second) => (
              <span key={second} style={{ left: `${(second / 6) * 100}%` }}>
                {second}s
              </span>
            ))}
          </div>
          <div className="timeline-track">
            <div
              className="timeline-progress"
              style={{ width: `${(frame / Math.max(1, project.durationInFrames - 1)) * 100}%` }}
            />
            <div
              className="playhead"
              style={{ left: `${(frame / Math.max(1, project.durationInFrames - 1)) * 100}%` }}
            />
            {project.expressionEvents.map((event) => (
              <button
                type="button"
                key={`${event.frame}-${event.emoji}`}
                className="event-marker"
                style={{
                  left: `${(event.frame / Math.max(1, project.durationInFrames - 1)) * 100}%`,
                }}
                onClick={() => seekToFrame(event.frame)}
                title={`Frame ${event.frame}`}
              >
                {event.emoji}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};
