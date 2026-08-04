# EDITuber

Motor determinista para convertir audio, un avatar 2D y eventos de expresión en una actuación
lista para chroma key. Este primer corte comparte contrato y lógica entre una CLI headless y un
Web Lab responsive. Flutter está reservado hasta estabilizar el formato de proyecto.

## Qué funciona en 0.1

- Proyecto JSON v1 validado con JSON Schema.
- Audio local decodificado por FFmpeg y envolvente cacheada por frame.
- Boca cerrada en pausas, parpadeo con semilla y talkBounce con histéresis/pulsos.
- Carcasa persistente y transiciones cruzadas solo entre capas faciales.
- Tres expresiones fixture: 🙂, 🤔 y 😮, con cuatro estados cada una.
- Web Lab responsive con carga de audio, preview, sensibilidad, fondo y timeline emoji.
- CLI por proyecto o en modo directo `audio + avatar`.
- MP4 H.264/AAC a 1080 × 1080 y 30 FPS mediante Remotion.

## Requisitos

- Node.js 22 o posterior.
- pnpm 11.
- FFmpeg y FFprobe disponibles en `PATH`.
- Linux x64, macOS o Windows para desarrollo. El Chromium empaquetado se usa como respaldo en
  entornos headless; en una instalación normal Remotion puede usar su navegador compatible.

## Arranque

```bash
pnpm install
pnpm dev:web
```

Abre `http://localhost:4317`. El botón **Renderizar demo** funciona mientras el servidor de
desarrollo está activo y llama a la misma CLI; no contiene un segundo motor en el navegador.

## Pruebas y calidad

```bash
pnpm test
pnpm check
pnpm build
```

Las pruebas cubren la envolvente, pausas, determinismo, parpadeo, timeline, transiciones sin capa
vacía y movimiento del contenedor padre.

## Render de demostración

```bash
pnpm render:demo
pnpm verify:demo
```

El archivo resultante es `outputs/edituber-demo.mp4`. La verificación inspecciona las 180 imágenes
del video, metadatos, resolución, FPS, duración, pista de audio y ausencia de frames blancos.

También se puede ejecutar el comando solicitado por la especificación:

```bash
pnpm edituber render \
  --project ./fixtures/projects/demo.edituber.json \
  --output ./outputs/edituber-demo.mp4
```

Modo directo sin proyecto preexistente:

```bash
pnpm edituber render \
  --audio ./fixtures/audio/demo.wav \
  --avatar ./fixtures/avatars/robot/avatar.json \
  --background "#00FF00" \
  --output ./outputs/direct-demo.mp4
```

Para cambiar el máximo de seguridad de 10 minutos:

```bash
EDITUBER_MAX_DURATION_SECONDS=120 pnpm edituber render --project proyecto.json --output salida.mp4
```

El motor rechaza el archivo completo si supera el límite; nunca lo recorta silenciosamente.

## Estructura

```text
apps/cli                 entrada headless
apps/web-lab             laboratorio React responsive
packages/contracts       tipos y JSON Schema v1
packages/audio-engine    análisis puro y adaptador FFmpeg
packages/avatar-engine   boca, parpadeo y talkBounce
packages/timeline-engine resolución de eventos por frame
packages/core            coordinación compartida
packages/renderer-contract interfaz intercambiable
packages/renderer-remotion adaptador de video inicial
fixtures                  avatar, audio, proyectos y casos dorados
flutter-packages          reservas documentadas para una fase posterior
```

## Límites actuales

- El fixture de audio es sintético y corto; no pretende imitar fonemas reales.
- La timeline permite insertar o sustituir eventos, pero aún no arrastrarlos ni borrarlos.
- El Web Lab cachea audios subidos solo en memoria; la persistencia llegará en Fase 2.
- `from-script`, TTS y API HTTP pertenecen a Fase 3.
- Flutter, anuncios, compras, nube y Visual Researcher no están implementados.
- La licencia pública de EDITuber aún debe elegirse. La revisión específica de Remotion está en
  [`docs/LICENSE-REVIEW.md`](docs/LICENSE-REVIEW.md).

Consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DECISIONS.md`](docs/DECISIONS.md) y
[`docs/FILES.md`](docs/FILES.md) para el diseño y el inventario de la entrega.
