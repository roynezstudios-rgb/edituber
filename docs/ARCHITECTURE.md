# Arquitectura

EDITuber es un monorepo con un contrato v2 compartido y adaptadores de entrada/salida.

```mermaid
flowchart TD
  J[Proyecto v1 o v2] --> V[Validar y migrar a v2]
  M[Manifiesto v1 o v2] --> V
  A[Audio] --> E[Audio engine]
  V --> C[Core por frame]
  E --> C
  C --> W[Web Lab]
  C --> R[Remotion / CLI]
```

## Flujo por frame

```text
stateEvents + frame
        │
        ▼
resolveStateAtFrame ──► currentStateId + crossfade
        │
        ▼
resolveStateImage(state, speaking, blinking)
        │
        ├─ 1 imagen: mismo asset, grupos de efectos distintos
        ├─ 2 imágenes: boca cerrada/abierta, sin blink falso
        └─ 4 imágenes: boca y parpadeo completos
        │
        ▼
resolveAvatarEffects(state, frame, seed, voz, bordes, énfasis)
        │
        └─ translateX/Y + scaleX/Y + rotation + brightness sobre un único padre
```

El reloj del navegador solo selecciona un frame. Las decisiones visuales dependen de frame, FPS, semilla, datos y envolvente; Web y render producen el mismo resultado. `prefers-reduced-motion` neutraliza el movimiento adicional solo en la previsualización web.

## Límites de archivos de la CLI

```text
argumento --asset-root (confianza del usuario)
        │
        ├─ realpath de proyecto, audio, manifiesto e imágenes
        ├─ comprobación canónica de contención
        └─ solo lectura

argumento --cache-root o <asset-root>/.edituber-cache
        │
        └─ escritura exclusiva <audioHash>-<fps>.envelope.json
```

El proyecto no controla una ruta de escritura. `audio.envelope` es una referencia opcional de lectura; si falta o está obsoleta, la salida va a la caché confiable.

## Límites de módulos

- `contracts`: datos, esquemas, validación y migración; no conoce UI ni render.
- `audio-engine`, `timeline-engine` y `avatar-engine`: funciones deterministas sin Remotion. El motor de avatar compone listas en orden estable y reconstruye ruido, blink y transiciones desde frame + semilla, sin estado mutable.
- `core`: valida el bundle y resuelve el estado del frame.
- `renderer-remotion`: adapta el estado compartido a video.
- `web-lab`: administra estados y usa las mismas funciones puras.
