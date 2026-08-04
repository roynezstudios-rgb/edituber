import { analyzeAudioBuffer } from "@edituber/audio-engine";
import {
  type AudioEnvelopeV1,
  type AvatarEffects,
  type AvatarManifestV2,
  type AvatarState,
  type BlinkSettings,
  defaultBlinkSettings,
  defaultMouthLoopSettings,
  type EdituberProjectV2,
  emptyAvatarEffects,
  type MouthLoopSettings,
  type PortableEdituberDocumentV1,
} from "@edituber/contracts";
import { type EdituberBundle, resolveFrameState } from "@edituber/core";
import {
  frameFromTimelinePosition,
  removeStateEvent,
  upsertStateEvent,
} from "@edituber/timeline-engine";
import { type ChangeEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { decodeAndRemoveAudioRange, remapStateTimelineAfterDelete } from "./audio-edit";
import { EffectEditor } from "./EffectEditor";
import { fixtureBundle } from "./fixture";
import { parsePortableDocument, serializePortableDocument } from "./portable";
import { WEB_LAB_AUDIO_POLICY } from "./product-policy";
import { chooseRecordingMimeType, recordingErrorMessage, recordingFileName } from "./recording";
import { draftFromState, type StateDraft, StateEditor, stateFromDraft } from "./StateEditor";

const MAX_AUDIO_BYTES = WEB_LAB_AUDIO_POLICY.maxBytes;
const MAX_DURATION_SECONDS = WEB_LAB_AUDIO_POLICY.maxDurationSeconds;
const MAX_PROJECT_BYTES = 160 * 1024 * 1024;
const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;
const BACKGROUND_IMAGE_TYPES = new Set([
  "image/png",
  "image/apng",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const localRenderAvailable = import.meta.env.DEV;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const effectsForRecording = (project: EdituberProjectV2, avatar: AvatarManifestV2): AvatarEffects =>
  clone(
    project.effects ??
      avatar.states.find((state) => state.effects)?.effects ??
      emptyAvatarEffects(),
  );
const withoutPerStateBlinkSettings = (avatar: AvatarManifestV2): AvatarManifestV2 => ({
  ...clone(avatar),
  states: avatar.states.map((state) => {
    const next = clone(state);
    delete next.blink;
    delete next.blinkPolicy;
    return next;
  }),
});
const withRecordingEffects = (
  project: EdituberProjectV2,
  avatar: AvatarManifestV2,
): EdituberProjectV2 => ({
  ...project,
  effects: effectsForRecording(project, avatar),
  settings: {
    ...project.settings,
    blink: clone(
      project.settings.blink ??
        avatar.states.find((state) => state.blink)?.blink ??
        defaultBlinkSettings(),
    ),
    mouthLoop: clone(project.settings.mouthLoop ?? defaultMouthLoopSettings()),
  },
});
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

type RecordingState = "idle" | "requesting" | "recording" | "paused" | "processing";

interface AudioEditSnapshot {
  project: EdituberProjectV2;
  envelope: AudioEnvelopeV1;
  audioSource: string;
}

const MouthLoopPreview = ({ settings }: { settings: MouthLoopSettings }) => {
  const [mouthOpen, setMouthOpen] = useState(false);

  useEffect(() => {
    if (!settings.enabled) {
      setMouthOpen(false);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMouthOpen(true);
      return;
    }

    let timeout = 0;
    let cancelled = false;
    const show = (open: boolean) => {
      if (cancelled) return;
      setMouthOpen(open);
      const duration = open ? settings.openMilliseconds : settings.closedMilliseconds;
      timeout = window.setTimeout(() => show(!open), Math.max(40, duration));
    };
    show(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [settings.enabled, settings.openMilliseconds, settings.closedMilliseconds]);

  return (
    <div
      className={`mouth-loop-preview${settings.enabled ? " is-active" : ""}`}
      role="img"
      aria-label={
        settings.enabled
          ? "Vista previa: la boca se abre y se cierra mientras hay voz"
          : "Vista previa del ciclo de boca desactivado"
      }
    >
      <span className={`face-guide eyes-open ${mouthOpen ? "mouth-open" : ""}`} aria-hidden="true">
        <span className="guide-eyes">
          <i />
          <i />
        </span>
        <i className="guide-mouth" />
      </span>
      <span>
        <b>{settings.enabled ? (mouthOpen ? "Hablando" : "Pausa breve") : "Desactivado"}</b>
        <small>Vista del ciclo</small>
      </span>
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
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef("");
  const recordingSecondsRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const [project, setProject] = useState<EdituberProjectV2>(() =>
    withRecordingEffects(clone(fixtureBundle.project), fixtureBundle.avatar),
  );
  const [avatar, setAvatar] = useState<AvatarManifestV2>(() =>
    withoutPerStateBlinkSettings(fixtureBundle.avatar),
  );
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
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [selectionStartFrame, setSelectionStartFrame] = useState<number | null>(null);
  const [selectionEndFrame, setSelectionEndFrame] = useState<number | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [editingAudio, setEditingAudio] = useState(false);
  const [audioEditUndo, setAudioEditUndo] = useState<AudioEditSnapshot | null>(null);

  const canRecord =
    typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

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
  const selectionBounds = useMemo(() => {
    if (selectionStartFrame === null || selectionEndFrame === null) return null;
    return {
      start: Math.min(selectionStartFrame, selectionEndFrame),
      end: Math.max(selectionStartFrame, selectionEndFrame),
    };
  }, [selectionEndFrame, selectionStartFrame]);
  const visualSize = Math.min(project.width, project.height) * 0.76;
  const activeState = avatar.states.find((candidate) => candidate.id === state.avatar.stateId);
  const recordingEffects = project.effects ?? emptyAvatarEffects();

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

  const releaseMicrophone = useCallback(() => {
    for (const track of recordingStreamRef.current?.getTracks() ?? []) track.stop();
    recordingStreamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      discardRecordingRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = window.setInterval(
      () =>
        setRecordingSeconds((current) => {
          const next = current + 1;
          recordingSecondsRef.current = next;
          return next;
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    if (recordingState !== "recording" || recordingSeconds < MAX_DURATION_SECONDS) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setRecordingState("processing");
      setStatus("Límite de 10 minutos alcanzado · procesando grabación…");
      recorder.stop();
    }
  }, [recordingSeconds, recordingState]);

  const seekToFrame = (next: number) => {
    const safe = Math.max(0, Math.min(project.durationInFrames - 1, Math.floor(next)));
    setFrame(safe);
    if (audioRef.current) audioRef.current.currentTime = safe / project.fps;
  };
  const changeTimelineZoom = (next: number) => {
    const safe = Math.max(1, Math.min(8, next));
    setTimelineZoom(safe);
    requestAnimationFrame(() => {
      const viewport = timelineViewportRef.current;
      if (!viewport) return;
      const progress = frame / Math.max(1, project.durationInFrames - 1);
      viewport.scrollLeft = Math.max(0, progress * viewport.scrollWidth - viewport.clientWidth / 2);
    });
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
  const updateAvatar = <K extends keyof EdituberProjectV2["avatar"]>(
    key: K,
    value: EdituberProjectV2["avatar"][K],
  ) => setProject((current) => ({ ...current, avatar: { ...current.avatar, [key]: value } }));
  const updateStage = <K extends keyof EdituberProjectV2["stage"]>(
    key: K,
    value: EdituberProjectV2["stage"][K],
  ) => setProject((current) => ({ ...current, stage: { ...current.stage, [key]: value } }));
  const updateBlinkSetting = <K extends keyof BlinkSettings>(key: K, value: BlinkSettings[K]) =>
    setProject((current) => ({
      ...current,
      settings: {
        ...current.settings,
        blink: { ...(current.settings.blink ?? defaultBlinkSettings()), [key]: value },
      },
    }));
  const updateMouthLoopSetting = <K extends keyof MouthLoopSettings>(
    key: K,
    value: MouthLoopSettings[K],
  ) =>
    setProject((current) => ({
      ...current,
      settings: {
        ...current.settings,
        mouthLoop: {
          ...(current.settings.mouthLoop ?? defaultMouthLoopSettings()),
          [key]: value,
        },
      },
    }));

  const chooseState = (stateId: string) => {
    const target = pickerFrame ?? frame;
    setProject((current) => ({
      ...current,
      avatar: {
        ...current.avatar,
        defaultStateId: target === 0 ? stateId : current.avatar.defaultStateId,
        visible: true,
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
    const next = stateFromDraft(stateDraft, id);
    delete next.effects;
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
    delete duplicate.effects;
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

  const handleAudio = async (file?: File, knownDurationSeconds?: number) => {
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
      const metadataDuration = knownDurationSeconds ?? (await probeAudioDuration(file));
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
      setSelectionStartFrame(null);
      setSelectionEndFrame(null);
      setAudioEditUndo(null);
      setStatus(`${file.name} · ${nextDuration.toFixed(1)} s · análisis local terminado`);
    } catch (error) {
      setStatus(`No se pudo analizar el audio: ${String(error)}`);
    }
  };

  const deleteSelectedAudio = async () => {
    if (
      !selectionBounds ||
      selectionBounds.end <= selectionBounds.start ||
      !audioSource ||
      editingAudio
    )
      return;
    if (selectionBounds.end - selectionBounds.start >= project.durationInFrames - 1) {
      setStatus("Deja al menos un fragmento de audio en la timeline");
      return;
    }
    audioRef.current?.pause();
    setPlaying(false);
    stopDriver();
    setEditingAudio(true);
    setStatus("Eliminando selección y recalculando sincronización…");
    try {
      const source = await fetch(audioSource).then((response) => {
        if (!response.ok) throw new Error("No se pudo leer el audio actual");
        return response.arrayBuffer();
      });
      const startSeconds = selectionBounds.start / project.fps;
      const endSeconds = selectionBounds.end / project.fps;
      const editedWave = await decodeAndRemoveAudioRange(source, startSeconds, endSeconds);
      const nextEnvelope = await analyzeAudioBuffer(
        editedWave,
        project.fps,
        `edit:${project.audio.source}:${selectionBounds.start}-${selectionBounds.end}`,
      );
      const nextAudioSource = await fileAsDataUrl(
        new File([editedWave], "audio-editado.wav", { type: "audio/wav" }),
      );
      const timeline = remapStateTimelineAfterDelete(
        project.stateEvents,
        project.avatar.defaultStateId,
        selectionBounds.start,
        selectionBounds.end,
      );
      setAudioEditUndo({ project: clone(project), envelope: clone(envelope), audioSource });
      setAudioSource(nextAudioSource);
      setEnvelope(nextEnvelope);
      setProject((current) => ({
        ...current,
        durationInFrames: nextEnvelope.frames.length,
        audio: {
          ...current.audio,
          source: "audio-editado.wav",
          durationSeconds: nextEnvelope.frames.length / current.fps,
        },
        avatar: { ...current.avatar, defaultStateId: timeline.defaultStateId },
        stateEvents: timeline.events.filter((event) => event.frame < nextEnvelope.frames.length),
      }));
      setFrame(Math.min(selectionBounds.start, nextEnvelope.frames.length - 1));
      setSelectionStartFrame(null);
      setSelectionEndFrame(null);
      setStatus(`${formatTime(endSeconds - startSeconds)} eliminados · A y C quedaron unidos`);
    } catch (error) {
      setStatus(`No se pudo editar el audio: ${String(error)}`);
    } finally {
      setEditingAudio(false);
    }
  };

  const undoAudioEdit = () => {
    if (!audioEditUndo || editingAudio) return;
    audioRef.current?.pause();
    setPlaying(false);
    stopDriver();
    setProject(audioEditUndo.project);
    setEnvelope(audioEditUndo.envelope);
    setAudioSource(audioEditUndo.audioSource);
    setFrame(0);
    setSelectionStartFrame(null);
    setSelectionEndFrame(null);
    setAudioEditUndo(null);
    setStatus("Último corte deshecho");
  };

  const startRecording = async () => {
    if (!canRecord || recordingState !== "idle") {
      if (!canRecord) setStatus("Este navegador no permite grabar audio directamente");
      return;
    }
    setRecordingState("requesting");
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    setStatus("Solicitando acceso al micrófono…");
    try {
      audioRef.current?.pause();
      setPlaying(false);
      stopDriver();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      const mimeType = chooseRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        discardRecordingRef.current = true;
        setStatus("La grabación se interrumpió por un error del micrófono");
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = () => {
        releaseMicrophone();
        mediaRecorderRef.current = null;
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (discardRecordingRef.current || chunks.length === 0) {
          discardRecordingRef.current = false;
          setRecordingState("idle");
          return;
        }
        const recordedType = recordingMimeTypeRef.current;
        const file = new File(
          [new Blob(chunks, { type: recordedType })],
          recordingFileName(recordedType),
          {
            type: recordedType,
          },
        );
        setStatus("Analizando la voz grabada localmente…");
        void handleAudio(file, Math.max(0.1, recordingSecondsRef.current)).finally(() =>
          setRecordingState("idle"),
        );
      };
      recorder.start(250);
      setRecordingState("recording");
      setStatus("Grabando voz · habla con naturalidad");
    } catch (error) {
      releaseMicrophone();
      setRecordingState("idle");
      setStatus(recordingErrorMessage(error));
    }
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    setRecordingState("paused");
    setStatus("Grabación en pausa");
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    setRecordingState("recording");
    setStatus("Grabando voz · habla con naturalidad");
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setRecordingState("processing");
    setStatus("Procesando grabación…");
    recorder.stop();
  };

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    discardRecordingRef.current = true;
    setStatus("Grabación descartada");
    if (recorder && recorder.state !== "inactive") {
      setRecordingState("processing");
      recorder.stop();
    } else {
      releaseMicrophone();
      setRecordingState("idle");
    }
  };

  const exportProject = () => {
    const portable: PortableEdituberDocumentV1 = {
      format: "edituber-portable",
      version: 1,
      project,
      avatar,
      envelope,
      audioSource: audioSource || undefined,
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
    if (file.size > MAX_PROJECT_BYTES) {
      setStatus("El proyecto supera el límite de seguridad de 160 MB");
      return;
    }
    try {
      const document = parsePortableDocument(await file.text());
      setProject(withRecordingEffects(document.project, document.avatar));
      setAvatar(withoutPerStateBlinkSettings(document.avatar));
      setEnvelope(document.envelope);
      setAudioSource(document.audioSource ?? "");
      setFrame(0);
      setSelectionStartFrame(null);
      setSelectionEndFrame(null);
      setAudioEditUndo(null);
      setStatus(
        document.audioSource
          ? `${file.name} importado`
          : `${file.name} importado · vuelve a seleccionar el archivo de audio`,
      );
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
  const timelineBars = useMemo(
    () =>
      Array.from(
        { length: 180 },
        (_, index) =>
          envelope.frames[
            Math.min(envelope.frames.length - 1, Math.floor((index / 180) * envelope.frames.length))
          ]?.amplitudeSmoothed ?? 0,
      ),
    [envelope],
  );
  const rulerSeconds = useMemo(() => {
    const divisions = Math.min(32, Math.max(4, Math.round(timelineZoom * 4)));
    return Array.from(
      { length: divisions + 1 },
      (_, index) => (durationSeconds * index) / divisions,
    );
  }, [durationSeconds, timelineZoom]);
  const motion = reducedMotion
    ? { translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1, brightness: 1 }
    : state.avatar.transform;
  return (
    <main className="app-shell">
      {/* biome-ignore lint/a11y/useMediaCaption: user-supplied narration is a transport source */}
      <audio
        ref={audioRef}
        src={audioSource || undefined}
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
            <div
              className={`stage ${state.backgroundType === "transparent" ? "transparent" : ""}`}
              style={{
                backgroundColor:
                  state.backgroundType === "transparent" ? "transparent" : state.backgroundColor,
                backgroundImage:
                  state.backgroundType === "image" && state.backgroundImage
                    ? `url(${state.backgroundImage})`
                    : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="safe-area" />
              {state.avatarVisible ? (
                <div
                  className="avatar-parent"
                  style={{
                    left: `${state.positionX * 100}%`,
                    top: `${state.positionY * 100}%`,
                    width: `${(visualSize / project.width) * 100}%`,
                    transform: `translate(-50%, -50%) translate(${motion.translateX}px, ${motion.translateY}px) rotate(${motion.rotation}deg) scale(${state.scale * motion.scaleX}, ${state.scale * motion.scaleY})`,
                    filter: `brightness(${motion.brightness})`,
                    imageRendering: state.avatar.imageMode === "pixel" ? "pixelated" : "auto",
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
              ) : null}
              <div className="stage-badge">
                {state.avatarVisible ? (
                  <>
                    {activeState?.emoji} {activeState?.name} ·{" "}
                    {state.avatar.mouthOpen ? "BOCA ABIERTA" : "BOCA CERRADA"}
                  </>
                ) : (
                  "PERSONAJE OCULTO"
                )}
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
          {recordingState === "idle" ? (
            <div className="audio-source-actions">
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
                  <small>Web Lab / guía · máximo 100 MB / 10 min</small>
                </span>
              </label>
              <button
                type="button"
                className="record-card"
                disabled={!canRecord}
                title={canRecord ? "Grabar voz con el micrófono" : "Grabación no disponible"}
                onClick={() => void startRecording()}
              >
                <span className="record-icon" aria-hidden="true" />
                <span>
                  <b>Grabar voz</b>
                  <small>Micrófono · el audio no sale de tu navegador</small>
                </span>
              </button>
            </div>
          ) : (
            <div className={`recorder-card ${recordingState}`} aria-live="polite">
              <div className="recorder-status">
                <span className="record-dot" aria-hidden="true" />
                <span>
                  <b>
                    {recordingState === "requesting"
                      ? "Esperando permiso"
                      : recordingState === "processing"
                        ? "Procesando"
                        : recordingState === "paused"
                          ? "Grabación en pausa"
                          : "Grabando voz"}
                  </b>
                  <small>{formatTime(recordingSeconds)} / 10:00</small>
                </span>
              </div>
              <div className="recorder-actions">
                {recordingState === "recording" ? (
                  <button type="button" onClick={pauseRecording}>
                    Pausar
                  </button>
                ) : recordingState === "paused" ? (
                  <button type="button" onClick={resumeRecording}>
                    Continuar
                  </button>
                ) : null}
                {(recordingState === "recording" || recordingState === "paused") && (
                  <button type="button" className="primary" onClick={stopRecording}>
                    Usar audio
                  </button>
                )}
                <button
                  type="button"
                  disabled={recordingState === "processing" || recordingState === "requesting"}
                  onClick={cancelRecording}
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
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
          <fieldset className="blink-settings mouth-loop-settings">
            <legend>Ciclo de boca</legend>
            <div className="mouth-loop-intro">
              <p>Alterna abierta y cerrada mientras detecta voz continua.</p>
              <MouthLoopPreview
                settings={project.settings.mouthLoop ?? defaultMouthLoopSettings()}
              />
            </div>
            <label className="mouth-loop-toggle">
              <input
                type="checkbox"
                checked={(project.settings.mouthLoop ?? defaultMouthLoopSettings()).enabled}
                onChange={(event) => updateMouthLoopSetting("enabled", event.currentTarget.checked)}
              />
              Activar ciclo durante la voz
            </label>
            <label>
              Boca abierta (ms)
              <input
                type="number"
                min="50"
                max="1000"
                step="10"
                disabled={!(project.settings.mouthLoop ?? defaultMouthLoopSettings()).enabled}
                value={(project.settings.mouthLoop ?? defaultMouthLoopSettings()).openMilliseconds}
                onChange={(event) =>
                  updateMouthLoopSetting("openMilliseconds", Number(event.currentTarget.value))
                }
              />
            </label>
            <label>
              Boca cerrada (ms)
              <input
                type="number"
                min="40"
                max="1000"
                step="10"
                disabled={!(project.settings.mouthLoop ?? defaultMouthLoopSettings()).enabled}
                value={
                  (project.settings.mouthLoop ?? defaultMouthLoopSettings()).closedMilliseconds
                }
                onChange={(event) =>
                  updateMouthLoopSetting("closedMilliseconds", Number(event.currentTarget.value))
                }
              />
            </label>
          </fieldset>
          <div className="compact-controls">
            <label>
              Movimiento <b>{(project.settings.motionScale ?? 1).toFixed(2)}</b>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={project.settings.motionScale ?? 1}
                onChange={(event) =>
                  updateSetting("motionScale", Number(event.currentTarget.value))
                }
              />
            </label>
            <label>
              Escala <b>{project.avatar.scale.toFixed(2)}</b>
              <input
                type="range"
                min="0.1"
                max="4"
                step="0.05"
                value={project.avatar.scale}
                onChange={(event) => updateAvatar("scale", Number(event.currentTarget.value))}
              />
            </label>
            <label>
              Posición X <b>{project.avatar.positionX.toFixed(2)}</b>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={project.avatar.positionX}
                onChange={(event) => updateAvatar("positionX", Number(event.currentTarget.value))}
              />
            </label>
            <label>
              Posición Y <b>{project.avatar.positionY.toFixed(2)}</b>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={project.avatar.positionY}
                onChange={(event) => updateAvatar("positionY", Number(event.currentTarget.value))}
              />
            </label>
          </div>
          <div className="control-group row-control">
            <div>
              <span>Fondo</span>
              <small>Sólido, transparente o imagen</small>
            </div>
            <select
              aria-label="Tipo de fondo"
              value={project.stage.backgroundType}
              onChange={(event) =>
                updateStage(
                  "backgroundType",
                  event.currentTarget.value as EdituberProjectV2["stage"]["backgroundType"],
                )
              }
            >
              <option value="solid">Sólido</option>
              <option value="transparent">Transparente</option>
              <option value="image">Imagen</option>
            </select>
          </div>
          {project.stage.backgroundType === "solid" ? (
            <label className="color-input background-control">
              <i style={{ backgroundColor: project.stage.backgroundColor }} />
              <input
                aria-label="Color de fondo"
                type="color"
                value={project.stage.backgroundColor}
                onChange={(event) =>
                  updateStage("backgroundColor", event.currentTarget.value.toUpperCase())
                }
              />
              <code>{project.stage.backgroundColor}</code>
            </label>
          ) : null}
          {project.stage.backgroundType === "image" ? (
            <label className="background-upload">
              Imagen de fondo
              <input
                type="file"
                accept="image/png,image/apng,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  if (!BACKGROUND_IMAGE_TYPES.has(file.type)) {
                    setStatus("Fondo rechazado: usa PNG, APNG, JPEG, WebP o GIF");
                    return;
                  }
                  if (file.size > MAX_BACKGROUND_BYTES) {
                    setStatus("Fondo rechazado: la imagen debe pesar 5 MB o menos");
                    return;
                  }
                  void fileAsDataUrl(file)
                    .then((backgroundImage) => {
                      setProject((current) => ({
                        ...current,
                        stage: { ...current.stage, backgroundImage },
                      }));
                      setStatus("Imagen de fondo lista");
                    })
                    .catch(() => setStatus("No se pudo leer la imagen de fondo"));
                }}
              />
            </label>
          ) : null}
          <div className="switch-grid">
            <label className="scene-visibility-toggle">
              <span>
                Personaje<small>Mostrar en toda la grabación</small>
              </span>
              <input
                aria-label="Mostrar personaje"
                type="checkbox"
                checked={project.avatar.visible !== false}
                onChange={(event) => updateAvatar("visible", event.currentTarget.checked)}
              />
            </label>
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
          <fieldset className="blink-settings global-blink-settings">
            <legend>Parpadeo general</legend>
            <p>Una sola configuración para todos los estados durante toda la grabación.</p>
            <label>
              Intervalo mínimo (s)
              <input
                type="number"
                min="0.8"
                max="30"
                step="0.1"
                disabled={!project.settings.blinkEnabled}
                value={(project.settings.blink ?? defaultBlinkSettings()).intervalMinSeconds}
                onChange={(event) =>
                  updateBlinkSetting("intervalMinSeconds", Number(event.currentTarget.value))
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
                disabled={!project.settings.blinkEnabled}
                value={(project.settings.blink ?? defaultBlinkSettings()).intervalMaxSeconds}
                onChange={(event) =>
                  updateBlinkSetting("intervalMaxSeconds", Number(event.currentTarget.value))
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
                disabled={!project.settings.blinkEnabled}
                value={(project.settings.blink ?? defaultBlinkSettings()).durationMilliseconds}
                onChange={(event) =>
                  updateBlinkSetting("durationMilliseconds", Number(event.currentTarget.value))
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!project.settings.blinkEnabled}
                checked={(project.settings.blink ?? defaultBlinkSettings()).syncAnimatedImages}
                onChange={(event) =>
                  updateBlinkSetting("syncAnimatedImages", event.currentTarget.checked)
                }
              />
              Sincronizar imágenes animadas
            </label>
            <label>
              <input
                type="checkbox"
                disabled={!project.settings.blinkEnabled}
                checked={(project.settings.blink ?? defaultBlinkSettings()).playAnimationToEnd}
                onChange={(event) =>
                  updateBlinkSetting("playAnimationToEnd", event.currentTarget.checked)
                }
              />
              Reproducir animación hasta el final
            </label>
          </fieldset>

          <section className="state-stock" aria-labelledby={stockTitleId}>
            <div className="stock-heading">
              <div>
                <span id={stockTitleId}>Stock de estados</span>
                <small>{avatar.states.length} guardados · biblioteca de imágenes</small>
              </div>
              <button
                type="button"
                className="add-state"
                onClick={() =>
                  setStateDraft({ ...draftFromState(), effects: clone(recordingEffects) })
                }
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
                  <div className="state-main">
                    <span>{item.emoji}</span>
                    <b>{item.name}</b>
                    <small>
                      {item.images.eyesClosed
                        ? "Boca y parpadeo · 4"
                        : item.images.eyesOpen.mouthOpen
                          ? "Boca sincronizada · 2"
                          : "Modo simple · 1"}
                    </small>
                  </div>
                  <div className="state-actions">
                    <button
                      type="button"
                      aria-label={`Editar ${item.name}`}
                      onClick={() =>
                        setStateDraft({ ...draftFromState(item), effects: clone(recordingEffects) })
                      }
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
              <h2>Timeline de audio y estados</h2>
              <small>
                Marca A y B para recortar; los estados posteriores se sincronizan solos.
              </small>
            </div>
            <div className="timeline-heading-actions">
              <button type="button" className="timeline-help" onClick={() => setPickerFrame(frame)}>
                Estado en F{frame}
              </button>
              <fieldset className="zoom-control" aria-label="Zoom de la timeline">
                <button
                  type="button"
                  aria-label="Alejar timeline"
                  disabled={timelineZoom <= 1}
                  onClick={() => changeTimelineZoom(timelineZoom - 0.5)}
                >
                  −
                </button>
                <output>{Math.round(timelineZoom * 100)}%</output>
                <button
                  type="button"
                  aria-label="Acercar timeline"
                  disabled={timelineZoom >= 8}
                  onClick={() => changeTimelineZoom(timelineZoom + 0.5)}
                >
                  +
                </button>
              </fieldset>
            </div>
          </div>
          <fieldset className="audio-edit-toolbar" aria-label="Herramientas de edición de audio">
            <span>
              Selección:{" "}
              {selectionBounds
                ? `${formatTime(selectionBounds.start / project.fps)} – ${formatTime(selectionBounds.end / project.fps)}`
                : "sin marcar"}
            </span>
            <button type="button" onClick={() => setSelectionStartFrame(frame)}>
              Marcar inicio A
            </button>
            <button type="button" onClick={() => setSelectionEndFrame(frame)}>
              Marcar fin B
            </button>
            <button
              type="button"
              className="delete-audio-selection"
              disabled={
                !selectionBounds || selectionBounds.end <= selectionBounds.start || editingAudio
              }
              onClick={() => void deleteSelectedAudio()}
            >
              {editingAudio ? "Procesando…" : "Eliminar A–B"}
            </button>
            <button type="button" disabled={!audioEditUndo || editingAudio} onClick={undoAudioEdit}>
              Deshacer
            </button>
          </fieldset>
          <div className="timeline-viewport" ref={timelineViewportRef}>
            <div className="timeline-canvas" style={{ width: `${timelineZoom * 100}%` }}>
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
              <div className="timeline-track">
                <button
                  type="button"
                  className="timeline-hit-area"
                  aria-label={`Mover cursor de audio desde el frame ${frame}`}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const target =
                      event.detail === 0
                        ? frame
                        : frameFromTimelinePosition(
                            event.clientX,
                            rect.left,
                            rect.width,
                            project.durationInFrames,
                          );
                    seekToFrame(target);
                  }}
                />
                <div className="timeline-waveform" aria-hidden="true">
                  {timelineBars.map((value, index) => (
                    <i
                      key={`${index}-${value}`}
                      style={{ height: `${Math.max(4, value * 38)}px` }}
                    />
                  ))}
                </div>
                {selectionBounds ? (
                  <div
                    className="audio-selection"
                    style={{
                      left: `${(selectionBounds.start / Math.max(1, project.durationInFrames - 1)) * 100}%`,
                      width: `${((selectionBounds.end - selectionBounds.start) / Math.max(1, project.durationInFrames - 1)) * 100}%`,
                    }}
                  >
                    <b>A</b>
                    <b>B</b>
                  </div>
                ) : null}
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
            </div>
          </div>
        </section>

        <section className="global-effects-panel panel">
          <EffectEditor
            value={recordingEffects}
            onChange={(effects) => {
              setProject((current) => ({ ...current, effects: clone(effects) }));
              setStatus("Efectos actualizados para toda la grabación");
            }}
          />
        </section>
      </div>

      {stateDraft ? (
        <StateEditor
          draft={stateDraft}
          seed={project.seed}
          blinkSettings={project.settings.blink ?? defaultBlinkSettings()}
          mouthLoopSettings={project.settings.mouthLoop ?? defaultMouthLoopSettings()}
          globalBlinkEnabled={project.settings.blinkEnabled}
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
