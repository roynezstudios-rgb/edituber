# EDITuber

Motor determinista para convertir audio, un avatar 2D y eventos de estado en una actuación lista para chroma key. La CLI, Remotion y el Web Lab comparten el mismo contrato y la misma resolución por frame.

## Qué funciona

- Proyecto y manifiesto de avatar JSON v2, validados con JSON Schema.
- Migración en memoria de proyectos/manifiestos v1.
- Stock ilimitado de estados con UUID estable, nombre, emoji, 2 o 4 imágenes, parpadeo y preset de movimiento.
- Boca sincronizada con RMS/histéresis, parpadeo con semilla, idle sutil, squash/stretch y pulsos de énfasis.
- Timeline por `stateId`: clic para añadir/cambiar, eliminación explícita y selector responsive.
- Web Lab con importación/exportación portable, carga local de audio, fondo y sensibilidad.
- CLI por proyecto o en modo directo `audio + avatar`.
- MP4 H.264/AAC a 1080 × 1080 y 30 FPS mediante Remotion.

## Requisitos

- Node.js 22 o posterior y pnpm 11.
- FFmpeg y FFprobe en `PATH` para CLI/render.

## Web Lab

```bash
pnpm install
pnpm dev:web
```

Abre `http://localhost:4317`. En GitHub Pages el laboratorio es completamente estático: procesa audio e imágenes en el navegador, pero el render MP4 se ejecuta con la CLI local.

### Estados del avatar

Cada estado necesita dos imágenes transparentes sin deformación:

1. ojos abiertos + boca cerrada;
2. ojos abiertos + boca abierta.

Para habilitar parpadeo añade también las dos variantes de ojos cerrados. Una pareja parcial se rechaza. El emoji es solo una etiqueta visual; timeline y motor usan el UUID `stateId`.

El JSON portable incluye proyecto, manifiesto y envolvente. Conserva la referencia al audio, pero no incrusta el archivo: al importarlo se vuelve a seleccionar el audio local. Los archivos subidos no salen del navegador.

## Calidad

```bash
pnpm test
pnpm check
pnpm build
pnpm audit
```

Las pruebas cubren migración v1→v2, combinaciones de 2/4 imágenes, parpadeo, timeline/upsert, movimiento determinista, importación portable y contención de rutas POSIX/Windows/symlinks.

## Render de demostración

```bash
pnpm render:demo
pnpm verify:demo
```

El archivo resultante es `outputs/edituber-demo.mp4`. También puedes ejecutar:

```bash
pnpm edituber render \
  --project ./fixtures/projects/demo.edituber.json \
  --asset-root ./fixtures \
  --output ./outputs/edituber-demo.mp4
```

`--asset-root` define el único árbol desde el que un proyecto puede leer. Las envolventes regeneradas nunca se escriben en la ruta indicada por el JSON: van a `--cache-root` o a `<asset-root>/.edituber-cache` con un nombre derivado del hash. Se rechazan rutas absolutas, escapes `..`, unidades/UNC de Windows y enlaces que resuelvan fuera de la raíz.

Modo directo:

```bash
pnpm edituber render \
  --audio ./fixtures/audio/demo.wav \
  --avatar ./fixtures/avatars/robot/avatar.json \
  --background "#00FF00" \
  --output ./outputs/direct-demo.mp4
```

El límite de audio predeterminado es 10 minutos. Se puede reducir con `EDITUBER_MAX_DURATION_SECONDS`; nunca se recorta silenciosamente.

## Estructura

```text
apps/cli                   entrada headless y límites de archivos
apps/web-lab               laboratorio React responsive
packages/contracts         tipos, migración y JSON Schema v2
packages/audio-engine      análisis puro y adaptador FFmpeg
packages/avatar-engine     imagen, blink y movimiento determinista
packages/timeline-engine   eventos stateId y transición por frame
packages/core              coordinación compartida
packages/renderer-remotion adaptador de video
fixtures                   avatar, audio y proyecto de demostración
```

No se inventaron tiempos a partir de un video de referencia: los marcadores del fixture existente permanecen en los frames 0, 60 y 120. Una calibración visual contra material externo requiere que ese video se adjunte o se enlace explícitamente.

Consulta [Arquitectura](docs/ARCHITECTURE.md), [Decisiones](docs/DECISIONS.md) e [Inventario](docs/FILES.md).
