# EDITuber

Motor determinista y servidor local para convertir audio, un avatar 2D y eventos de estado en una actuación lista para chroma key. La CLI, API, Remotion y el Web Lab comparten el mismo contrato y la misma resolución por frame. Este repositorio contiene **EDITuber Core + Studio Local**; las aplicaciones Android/iOS vivirán en un repositorio separado.

> Estado: `0.2.0-rc.1`, candidato para pruebas de instalación limpia. No debe anunciarse como versión estable hasta completar [la lista de aceptación](docs/RELEASE-CHECKLIST.md).

## Qué funciona

- Proyecto y manifiesto de avatar JSON v2, validados con JSON Schema.
- Migración en memoria de proyectos/manifiestos v1.
- Stock ilimitado de estados con UUID estable, nombre, emoji y exactamente 1, 2 o 4 imágenes.
- Efectos globales para toda la grabación, con grupos de silencio, voz, apertura, cierre y entrada desde timeline; composición y parpadeo deterministas.
- Timeline por `stateId` con waveform, corte A–B, eliminación de audio, resincronización automática, deshacer y zoom.
- Web Lab con importación/exportación portable, carga local de audio, grabación directa desde el micrófono, fondo, sensibilidad y ciclo global de boca configurable.
- Guion directivo `TIEMPO | EMOJI | TEXTO`, validado contra las emociones disponibles antes de modificar la timeline.
- CLI por proyecto o en modo directo `audio + avatar`.
- API local con cola de render, autenticación opcional/obligatoria al exponerla y descarga de resultados.
- MP4 H.264/AAC a 1080 × 1080 y 30 FPS mediante Remotion.

## Requisitos

- Node.js 22 o posterior y pnpm 11.
- FFmpeg y FFprobe en `PATH` para CLI/render.

## Inicio local recomendado

```bash
pnpm install --frozen-lockfile
pnpm start
```

Abre `http://127.0.0.1:4317`. En Windows también puedes ejecutar `scripts/start-local.ps1`; en Linux/macOS, `scripts/start-local.sh`. Consulta [instalación local y VPS](docs/DEPLOYMENT.md).

Para trabajar en la interfaz usa `pnpm dev:web` y abre `http://127.0.0.1:4318`; inicia `pnpm start:server` en otra terminal si necesitas render. En GitHub Pages el laboratorio es estático y el botón MP4 permanece desactivado porque allí no existe servidor.

Puedes subir un archivo de audio o pulsar **Grabar voz** para capturar narración desde el micrófono. La grabación permite pausar, continuar, descartar o usar el audio; se analiza en el dispositivo y nunca se envía a un servidor. El navegador solicitará permiso y la página debe abrirse mediante HTTPS o localhost.

### Estados del avatar

El editor crece por bloques y la única imagen obligatoria es la base:

1. **Modo simple:** una imagen durante voz y silencio; los efectos sí cambian con la voz.
2. **Boca sincronizada:** base + imagen al hablar.
3. **Boca y parpadeo:** las dos anteriores + la pareja completa de ojos cerrados.

Tres imágenes, cero imágenes y más de cuatro se rechazan. Los modos de una y dos imágenes no inventan parpadeo. El parpadeo y el ciclo de boca se configuran una sola vez para el proyecto completo; durante voz continua, el ciclo alterna las imágenes de boca abierta/cerrada y se reinicia después de cada pausa. Cada estado solo aporta sus imágenes y su render suave o pixel. Las listas ordenadas de `randomMove`, `waveMove`, `jump`, `waveRotate`, `darken`, `squashStretch` y `emphasis` también pertenecen al proyecto completo, por lo que continúan activas al cambiar de estado. El emoji es solo una etiqueta visual; timeline y motor usan el UUID `stateId`.

GIF, APNG y WebP animado se aceptan como assets portables. La sincronización y reinicio deterministas de sus frames internos todavía no están implementados en Remotion; esas opciones se conservan en el contrato sin bloquear PNG/JPEG/SVG/WebP estático.

### Preparar emociones sueltas con una IA

Si una IA ya tiene las imágenes sueltas de un personaje, debe organizarlas antes de entregarlas a EDITuber. Cada paquete representa **un personaje completo** y cada emoción puede contener 1, 2 o 4 imágenes. Para el modo completo de boca y parpadeo se usan estos nombres, conservando la extensión original:

1. `1-base`: ojos abiertos y boca cerrada.
2. `2-habla`: ojos abiertos y boca abierta.
3. `3-parpadeo`: ojos cerrados y boca cerrada.
4. `4-parpadeo-habla`: ojos cerrados y boca abierta.

Los nombres de carpetas usan identificadores breves sin espacios, como `neutral`, `feliz` o `triste`. El nombre visible y el emoji se guardan en `personaje.json`; el emoji no se usa como nombre de archivo. Una IA nunca debe adivinar una asignación dudosa ni modificar, recortar o comprimir las imágenes para completar el paquete.

En **Mis personajes**, arrastra el ZIP sobre **Aquí va tu personaje ZIP** o toca el recuadro para seleccionarlo. El Web Lab valida `personaje.json`, las carpetas y los modos 1/2/4 antes de guardarlo localmente. Cada ZIP añade un personaje completo a la biblioteca; puedes importar varios y cambiar entre ellos con **Usar** sin perder el audio ni la timeline. El archivo [PROMPT-ORGANIZAR-IMAGENES-AVATAR.txt](docs/PROMPT-ORGANIZAR-IMAGENES-AVATAR.txt) contiene las instrucciones completas y un prompt listo para entregar a una IA.

La escena admite fondo `solid`, `transparent` o `image`. Posición, escala del avatar y
`motionScale` se guardan en el proyecto y se aplican igual en Web Lab y Remotion; `motionScale`
reduce o amplifica todos los efectos sin alterar la posición base.

El JSON portable incluye proyecto, manifiesto, imágenes, envolvente y el audio como `audioSource` base64. Puede trasladarse a otra computadora o enviarse directamente a la API sin depender de rutas locales. Los archivos subidos no salen del navegador salvo cuando el usuario solicita un render al servidor local configurado.

### Guion directivo

Una IA puede preparar cambios de emoción sincronizados mediante un archivo de texto:

```text
# edituber-directives v1
00:00.000 | 🙂 | Introducción.
00:03.250 | 🤔 | Cambio de tono.
```

El importador se encuentra en la timeline. Si falta un emoji, hay tiempos fuera del audio o el formato es incorrecto, no aplica cambios y entrega el reporte completo. Consulta [Guion directivo](docs/SCRIPT-DIRECTIVES.md) y las [reglas obligatorias para agentes](AGENTS.md).

## API y VPS

La API sirve el Web Lab y permite validar, poner en cola y descargar renders del proyecto real. Escucha solo en localhost por defecto. Fuera de localhost exige `EDITUBER_API_TOKEN`, salvo que el operador active explícitamente un modo inseguro para una red aislada.

```bash
export EDITUBER_API_TOKEN="una-clave-larga"
docker compose up --build -d
curl http://127.0.0.1:4317/api/health
```

Consulta el [contrato de la API](docs/API.md). El puerto de Docker se publica únicamente sobre el loopback para colocarlo detrás de HTTPS y un proxy inverso.

## Calidad

```bash
pnpm test
pnpm check
pnpm build
pnpm audit
```

Las pruebas cubren migración v1→v2, modos 1/2/4, rechazo de 0/3/5 assets, blink configurable, efectos/transiciones deterministas, timeline/upsert, guion directivo, documento portable, cola/autenticación de API y contención de rutas POSIX/Windows/symlinks.

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
apps/server                API local, cola de render y servidor del Web Lab
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

Consulta [Arquitectura](docs/ARCHITECTURE.md), [Decisiones](docs/DECISIONS.md),
[PRD](docs/PRD.md), [Roadmap](docs/ROADMAP.md), [API](docs/API.md), [despliegue](docs/DEPLOYMENT.md), [revisión de licencias](docs/LICENSE-REVIEW.md) e
[Inventario](docs/FILES.md).

## Licencia

EDITuber Core + Studio Local se distribuye bajo [GNU Affero General Public License v3.0](LICENSE), identificador SPDX `AGPL-3.0-only`. Si se ofrece una versión modificada a través de una red, sus usuarios deben poder obtener el código fuente correspondiente conforme a la licencia. EDITuber Mobile se desarrollará en otro repositorio y no forma parte de esta concesión.
