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
