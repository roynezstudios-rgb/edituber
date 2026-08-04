# Decisiones de arquitectura

## ADR-001 — Un monorepo, tres puntos de entrada

El motor headless y el Web Lab se construyen juntos. Flutter llegará después y compartirá el
contrato y los casos dorados, no el runtime TypeScript.

## ADR-002 — Determinismo por frame

Las decisiones visuales reciben frame, FPS, envolvente y semilla persistida. No se usan timers,
`Date.now()` ni aleatoriedad sin semilla en el dominio.

## ADR-003 — Carcasa persistente

El fixture separa la carcasa de las capas faciales. Las expresiones se cruzan dentro del visor;
el contenedor padre mueve el personaje completo para evitar piezas separadas.

## ADR-004 — FFmpeg para decodificación, Remotion para composición

FFmpeg normaliza entradas de audio a PCM mono de 48 kHz. Remotion es el primer adaptador de
composición y exportación. Ninguno se filtra al contrato del proyecto.

## ADR-005 — Flutter aplazado

No se añade un cascarón móvil vacío. La prueba Flutter comenzará cuando el contrato v1 y los casos
dorados del motor estén estables.

## ADR-006 — Estado estable por UUID

El emoji y el nombre son presentación editable. Proyecto y timeline referencian `stateId`, por lo que renombrar, duplicar o reutilizar un emoji no cambia la semántica. El cambio incompatible se expresa como schema v2 y los documentos v1 se migran en memoria.

## ADR-007 — Dos o cuatro imágenes, nunca tres

Ojos abiertos requieren boca cerrada y abierta. Los ojos cerrados son una pareja opcional completa; si falta una variante se desactiva el parpadeo. Esto evita combinaciones visuales parciales y elimina `expressionControlled`.

## ADR-008 — Presets por datos, no por emoji

`motionPreset` selecciona idle, sorpresa, énfasis o beso. El motor nunca infiere comportamiento del glyph visible. Todos los transforms se aplican al contenedor padre y permanecen deterministas.

## ADR-009 — Proyecto sin autoridad de escritura

La CLI separa `assetRoot` de `cacheRoot`. Las referencias del JSON solo pueden leerse después de comprobar contención canónica; la caché recibe nombres derivados del hash. Esta frontera incluye rutas POSIX, Windows, UNC y enlaces simbólicos/junctions.
