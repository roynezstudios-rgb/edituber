# EDITuber — PRD del primer corte vertical

## Objetivo

Demostrar que un único proyecto JSON puede controlar una actuación determinista de avatar 2D
desde una CLI y desde un Web Lab responsive, y producir un MP4 reproducible.

## Usuario inicial

- Editor que quiere generar un personaje sobre chroma para llevarlo a CapCut, Premiere o DaVinci.
- Agente o usuario técnico que quiere automatizar la actuación mediante CLI.

## Alcance 0.2

- Audio WAV/MP3/otros formatos decodificables por FFmpeg, hasta 10 minutos por defecto.
- Envolvente cacheada por frame: señal cruda, suavizada, voz, boca, énfasis y rebote.
- Stock ilimitado de estados de avatar, cada uno con UUID, metadatos y dos o cuatro imágenes.
- Boca, parpadeo, rebote y transiciones resueltos únicamente desde frame, datos y semilla.
- Proyecto y manifiesto validados mediante JSON Schema v2, con migración desde v1.
- Web Lab responsive que consume los mismos paquetes de dominio.
- Render MP4 H.264/AAC, 1080 × 1080, 30 FPS mediante adaptador Remotion.

## Fuera de alcance

Flutter, anuncios, compras, cuentas, nube, TTS, búsqueda visual, colaboración y render remoto.

## Criterio de éxito

`pnpm test` y `pnpm check` pasan; `pnpm render:demo` produce un MP4 verificable con el mismo
estado de animación que el Web Lab para cada frame.
