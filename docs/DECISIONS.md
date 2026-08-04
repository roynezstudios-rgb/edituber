# Decisiones de arquitectura

## ADR-001 — Un monorepo para Core + Studio Local

El motor headless, la CLI, el servidor y el Web Lab se construyen juntos. Los clientes externos
interoperan mediante el contrato JSON y la API versionada, no mediante el runtime TypeScript.

## ADR-002 — Determinismo por frame

Las decisiones visuales reciben frame, FPS, envolvente y semilla persistida. No se usan timers,
`Date.now()` ni aleatoriedad sin semilla en el dominio.

## ADR-003 — Carcasa persistente

El fixture separa la carcasa de las capas faciales. Las expresiones se cruzan dentro del visor;
el contenedor padre mueve el personaje completo para evitar piezas separadas.

## ADR-004 — FFmpeg para decodificación, Remotion para composición

FFmpeg normaliza entradas de audio a PCM mono de 48 kHz. Remotion es el primer adaptador de
composición y exportación. Ninguno se filtra al contrato del proyecto.

## ADR-005 — Frontera para clientes externos

Este repositorio no contiene cascarones de otros clientes. Una implementación externa consume el
contrato JSON o la API versionada y mantiene su runtime, persistencia y distribución separados.

## ADR-006 — Estado estable por UUID

El emoji y el nombre son presentación editable. Proyecto y timeline referencian `stateId`, por lo que renombrar, duplicar o reutilizar un emoji no cambia la semántica. El cambio incompatible se expresa como schema v2 y los documentos v1 se migran en memoria.

## ADR-007 — Una, dos o cuatro imágenes, nunca tres

La imagen base es la única obligatoria. `mouthOpen` habilita boca sincronizada; `eyesClosed` solo puede existir como pareja completa cuando `mouthOpen` existe. Un estado simple conserva el asset visible pero cambia sus efectos con la voz. Esto evita combinaciones parciales y elimina `expressionControlled`.

## ADR-008 — Listas de efectos globales por datos, no por emoji

Cinco listas pertenecen al proyecto completo: silencio, voz, abrir, cerrar y entrar. Cambiar el estado o emoji de la timeline no sustituye los efectos. Los presets solo rellenan parámetros editables; el motor compone matemáticamente todos los efectos sobre el contenedor padre. Las listas antiguas dentro de `AvatarState` y `motionPreset` quedan como ruta de compatibilidad para JSON v2 previos y nunca se infiere comportamiento del glyph visible.

## ADR-009 — Proyecto sin autoridad de escritura

La CLI separa `assetRoot` de `cacheRoot`. Las referencias del JSON solo pueden leerse después de comprobar contención canónica; la caché recibe nombres derivados del hash. Esta frontera incluye rutas POSIX, Windows, UNC y enlaces simbólicos/junctions.

## ADR-010 — Animación raster portable, sincronización aplazada

GIF, APNG y WebP animado son referencias válidas y pueden viajar como data URI. El contrato conserva `syncAnimatedImages`, `playAnimationToEnd` y `resetAnimationOnEnter`, pero la reproducción frame-exacta de esas animaciones dentro de Remotion se documenta como pendiente. Los modos estáticos 1/2/4 no dependen de ella.

## ADR-011 — Un solo parpadeo para toda la grabación

El interruptor, intervalo y duración viven en `project.settings.blink`. El motor usa la semilla del proyecto para mantener un calendario continuo aunque cambie el estado en la timeline. `blinkPolicy` y `blink` dentro de `AvatarState` quedan únicamente como compatibilidad de lectura para documentos anteriores; el Web Lab los promueve al proyecto y deja de exportarlos por estado.

## ADR-012 — Ciclo global de boca durante voz continua

La detección de voz sigue determinando cuándo existe habla, pero `project.settings.mouthLoop` alterna las imágenes de boca abierta y cerrada mientras ese tramo continúa activo. Los tiempos abierta/cerrada son globales y deterministas por frame; una pausa cierra la boca y la siguiente frase reinicia el ciclo. Los efectos continuos de voz permanecen activos durante todo el tramo, mientras que las transiciones de apertura y cierre pueden reaccionar a cada cambio del ciclo.
