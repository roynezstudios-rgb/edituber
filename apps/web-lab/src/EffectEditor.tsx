import {
  type AvatarEffect,
  type AvatarEffects,
  type AvatarTransition,
  defaultEffect,
  defaultTransition,
} from "@edituber/contracts";
import { useId, useState } from "react";

export type EffectGroup = keyof AvatarEffects;
type ClipboardValue = AvatarEffect | AvatarTransition;
let effectClipboard: ClipboardValue | null = null;

const groups: Array<{ id: EffectGroup; label: string; description: string }> = [
  { id: "mouthClosed", label: "En silencio", description: "Continuos sin voz" },
  { id: "mouthOpen", label: "Al hablar", description: "Continuos con voz" },
  { id: "closedToOpen", label: "Al abrir", description: "Una vez al comenzar la voz" },
  { id: "openToClosed", label: "Al cerrar", description: "Una vez al terminar la voz" },
  { id: "stateEnter", label: "Al entrar", description: "Una vez desde la timeline" },
];

const effectNames: Record<AvatarEffect["type"], string> = {
  randomMove: "Movimiento orgánico",
  waveMove: "Movimiento de onda",
  jump: "Salto",
  waveRotate: "Rotación de onda",
  darken: "Oscurecer",
  squashStretch: "Squash y stretch",
  emphasis: "Énfasis de audio",
};

const descriptions: Record<AvatarEffect["type"], string> = {
  randomMove: "Ruido continuo determinista.",
  waveMove: "Recorrido suave con seno y coseno.",
  jump: "Rebote parabólico repetido.",
  waveRotate: "Balanceo sinusoidal.",
  darken: "Reduce el brillo del avatar.",
  squashStretch: "Deforma ambos ejes sin separar capas.",
  emphasis: "Reacciona a emphasisPulse.",
};

type NumericKey =
  | "amount"
  | "velocity"
  | "amountX"
  | "amountY"
  | "periodSeconds"
  | "phaseOffset"
  | "frequencyHz"
  | "amountDegrees"
  | "axisBalance"
  | "durationMilliseconds"
  | "cooldownMilliseconds";

interface Parameter {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const parameters = (item: ClipboardValue): Parameter[] => {
  if (item.type === "stateEnter")
    return [
      { key: "amount", label: "Intensidad", min: 0, max: 150, step: 1 },
      { key: "durationMilliseconds", label: "Duración (ms)", min: 50, max: 2000, step: 10 },
    ];
  switch (item.type) {
    case "randomMove":
      return [
        { key: "amount", label: "Intensidad", min: 0, max: 80, step: 1 },
        { key: "velocity", label: "Velocidad", min: 0.05, max: 8, step: 0.05 },
      ];
    case "waveMove":
      return [
        { key: "amountX", label: "Movimiento X", min: -80, max: 80, step: 1 },
        { key: "amountY", label: "Movimiento Y", min: -80, max: 80, step: 1 },
        { key: "periodSeconds", label: "Período (s)", min: 0.25, max: 30, step: 0.05 },
        { key: "phaseOffset", label: "Fase", min: -6.2832, max: 6.2832, step: 0.05 },
      ];
    case "jump":
      if (!("frequencyHz" in item))
        return [
          { key: "amount", label: "Intensidad", min: 0, max: 150, step: 1 },
          { key: "durationMilliseconds", label: "Duración (ms)", min: 50, max: 2000, step: 10 },
        ];
      return [
        { key: "amountX", label: "Movimiento X", min: -60, max: 60, step: 1 },
        { key: "amountY", label: "Altura", min: 0, max: 120, step: 1 },
        { key: "frequencyHz", label: "Frecuencia (Hz)", min: 0.1, max: 8, step: 0.1 },
      ];
    case "waveRotate":
      return [
        { key: "amountDegrees", label: "Grados", min: -25, max: 25, step: 0.5 },
        { key: "periodSeconds", label: "Período (s)", min: 0.25, max: 30, step: 0.05 },
        { key: "phaseOffset", label: "Fase", min: -6.2832, max: 6.2832, step: 0.05 },
      ];
    case "darken":
      return [{ key: "amount", label: "Oscurecimiento", min: 0, max: 0.85, step: 0.01 }];
    case "squashStretch":
      return [
        { key: "amount", label: "Intensidad", min: 0, max: 0.25, step: 0.01 },
        { key: "frequencyHz", label: "Frecuencia (Hz)", min: 0.1, max: 8, step: 0.1 },
        { key: "axisBalance", label: "Balance de ejes", min: 0, max: 1, step: 0.05 },
      ];
    case "emphasis":
      return [
        { key: "amount", label: "Intensidad", min: 0, max: 2, step: 0.05 },
        { key: "durationMilliseconds", label: "Duración (ms)", min: 50, max: 2000, step: 10 },
        { key: "cooldownMilliseconds", label: "Cooldown (ms)", min: 0, max: 10000, step: 50 },
      ];
  }
};

const applyPreset = (effect: AvatarEffect, preset: AvatarEffect["preset"]): AvatarEffect => {
  const merge = (parameters: Record<string, number> = {}): AvatarEffect =>
    ({ ...effect, preset, ...parameters }) as AvatarEffect;
  switch (preset) {
    case "relaxed":
      return effect.type === "randomMove" ? merge({ amount: 4, velocity: 0.7 }) : merge();
    case "shaking":
      return effect.type === "randomMove" ? merge({ amount: 10, velocity: 3 }) : merge();
    case "shakingHard":
      return effect.type === "randomMove" ? merge({ amount: 22, velocity: 6 }) : merge();
    case "breathing":
      return effect.type === "waveMove"
        ? merge({ amountX: 0, amountY: 4, periodSeconds: 2.4, phaseOffset: 0 })
        : merge();
    case "circling":
      return effect.type === "waveMove"
        ? merge({ amountX: 8, amountY: 8, periodSeconds: 3, phaseOffset: 0 })
        : merge();
    case "bouncy":
      return effect.type === "jump"
        ? merge({ amountX: 0, amountY: 14, frequencyHz: 1.8 })
        : merge();
    case "happy":
      return effect.type === "jump"
        ? merge({ amountX: 2, amountY: 24, frequencyHz: 2.4 })
        : merge();
    case "agitated":
      return effect.type === "jump" ? merge({ amountX: 7, amountY: 18, frequencyHz: 4 }) : merge();
    case "swaying":
      return effect.type === "waveRotate"
        ? merge({ amountDegrees: 2, periodSeconds: 2.8, phaseOffset: 0 })
        : merge();
    case "swayingHard":
      return effect.type === "waveRotate"
        ? merge({ amountDegrees: 8, periodSeconds: 1.6, phaseOffset: 0 })
        : merge();
    default:
      return merge();
  }
};

const presetsFor = (effect: AvatarEffect): AvatarEffect["preset"][] => {
  if (effect.type === "randomMove") return ["relaxed", "shaking", "shakingHard", "custom"];
  if (effect.type === "waveMove") return ["breathing", "circling", "custom"];
  if (effect.type === "jump") return ["bouncy", "happy", "agitated", "custom"];
  if (effect.type === "waveRotate") return ["swaying", "swayingHard", "custom"];
  return ["custom"];
};

export const EffectEditor = ({
  value,
  onChange,
}: {
  value: AvatarEffects;
  onChange: (effects: AvatarEffects) => void;
}) => {
  const titleId = useId();
  const [group, setGroup] = useState<EffectGroup>("mouthClosed");
  const [newType, setNewType] = useState<AvatarEffect["type"]>("waveMove");
  const continuous = group === "mouthClosed" || group === "mouthOpen";
  const items = value[group] as ClipboardValue[];
  const setItems = (next: ClipboardValue[]) => onChange({ ...value, [group]: next });
  const activeCount = items.filter((item) => item.enabled).length;
  const update = (index: number, item: ClipboardValue) =>
    setItems(items.map((candidate, itemIndex) => (itemIndex === index ? item : candidate)));
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target] as ClipboardValue, next[index] as ClipboardValue];
    setItems(next);
  };
  return (
    <section className="effects-editor" aria-labelledby={titleId}>
      <div className="effects-heading">
        <div>
          <p className="eyebrow">TODA LA GRABACIÓN</p>
          <h3 id={titleId}>Efectos globales</h3>
        </div>
        <span>{activeCount} activos</span>
      </div>
      <p className="global-effects-help">
        Esta configuración continúa activa aunque cambies de estado o emoji en la timeline.
      </p>
      <div className="effect-tabs" role="tablist" aria-label="Grupos de efectos">
        {groups.map((candidate) => (
          <button
            type="button"
            role="tab"
            aria-selected={candidate.id === group}
            className={candidate.id === group ? "active" : ""}
            key={candidate.id}
            onClick={() => setGroup(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <p className="field-help">
        {groups.find((candidate) => candidate.id === group)?.description}
      </p>
      <div className="effect-toolbar">
        {continuous ? (
          <select
            aria-label="Tipo de efecto"
            value={newType}
            onChange={(event) => setNewType(event.currentTarget.value as AvatarEffect["type"])}
          >
            {Object.entries(effectNames).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={() =>
            setItems([
              ...items,
              continuous
                ? defaultEffect(newType, crypto.randomUUID())
                : defaultTransition(
                    group === "stateEnter" ? "stateEnter" : "jump",
                    crypto.randomUUID(),
                  ),
            ])
          }
        >
          Agregar efecto
        </button>
        <button
          type="button"
          disabled={!effectClipboard}
          onClick={() => {
            if (!effectClipboard) return;
            const compatible = continuous
              ? "preset" in effectClipboard
              : !("preset" in effectClipboard);
            if (compatible) setItems([...items, { ...effectClipboard, id: crypto.randomUUID() }]);
          }}
        >
          Pegar
        </button>
      </div>
      <div className="effect-list">
        {items.length === 0 ? <p className="empty-effects">Sin efectos en este grupo.</p> : null}
        {items.map((item, index) => {
          const isContinuous = "preset" in item;
          return (
            <article className="effect-card" key={item.id}>
              <div className="effect-card-heading">
                <label>
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) =>
                      update(index, { ...item, enabled: event.currentTarget.checked })
                    }
                  />
                  <b>
                    {isContinuous
                      ? effectNames[item.type]
                      : item.type === "stateEnter"
                        ? "Entrada"
                        : "Impulso"}
                  </b>
                </label>
                <div>
                  <button type="button" aria-label="Subir efecto" onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button type="button" aria-label="Bajar efecto" onClick={() => move(index, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      effectClipboard = structuredClone(item);
                    }}
                  >
                    Copiar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setItems([
                        ...items.slice(0, index + 1),
                        { ...structuredClone(item), id: crypto.randomUUID() },
                        ...items.slice(index + 1),
                      ])
                    }
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              {isContinuous ? (
                <>
                  <p>{descriptions[item.type]}</p>
                  <label className="preset-field">
                    Preset
                    <select
                      value={item.preset}
                      onChange={(event) =>
                        update(
                          index,
                          applyPreset(item, event.currentTarget.value as AvatarEffect["preset"]),
                        )
                      }
                    >
                      {presetsFor(item).map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              <div className="parameter-grid">
                {parameters(item).map((parameter) => {
                  const numericItem = item as unknown as Record<NumericKey, number>;
                  const setValue = (next: number) => {
                    if (!Number.isFinite(next)) return;
                    const safe = Math.min(parameter.max, Math.max(parameter.min, next));
                    update(index, {
                      ...item,
                      [parameter.key]: safe,
                      ...(isContinuous ? { preset: "custom" } : {}),
                    } as ClipboardValue);
                  };
                  return (
                    <label key={parameter.key}>
                      <span>{parameter.label}</span>
                      <input
                        type="range"
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step}
                        value={numericItem[parameter.key]}
                        onChange={(event) => setValue(Number(event.currentTarget.value))}
                      />
                      <input
                        type="number"
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step}
                        value={numericItem[parameter.key]}
                        onChange={(event) => setValue(Number(event.currentTarget.value))}
                      />
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="reset-effect"
                onClick={() =>
                  update(
                    index,
                    isContinuous
                      ? defaultEffect(item.type, item.id)
                      : defaultTransition(item.type, item.id),
                  )
                }
              >
                Restablecer parámetros
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
};
