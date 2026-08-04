# Inventario de la primera entrega

## Raíz

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`: workspace y comandos reproducibles.
- `tsconfig.base.json`, `tsconfig.json`: TypeScript estricto y referencias de proyecto.
- `biome.json`: formato y lint.
- `README.md`: instalación, comandos, alcance y límites.

## Aplicaciones

- `apps/cli/src/index.ts`: comandos `render` y `validate`.
- `apps/cli/src/load-bundle.ts`: validación de rutas/tamaños, caché y assets embebidos.
- `apps/web-lab/src/App.tsx`: preview, parpadeo global, stock de estados y timeline responsive.
- `apps/web-lab/src/StateEditor.tsx`, `EffectEditor.tsx`: editor progresivo 1/2/4 y cinco grupos de efectos.
- `apps/web-lab/src/portable.ts`: importación/exportación del documento portable.
- `apps/web-lab/src/fixture.ts`: adaptación del fixture al navegador.
- `apps/web-lab/src/styles.css`: diseño desktop/móvil.
- `apps/web-lab/vite.config.ts`: servidor de desarrollo y puente local de render.

## Paquetes

- `packages/contracts/schema`: proyecto y manifiesto v2.
- `packages/contracts/src`: tipos, validación y migración v1→v2.
- `packages/audio-engine/src`: análisis puro, caché y decodificación FFmpeg.
- `packages/timeline-engine/src`: eventos y transición por frame.
- `packages/avatar-engine/src`: selección 1/2/4, blink y composición determinista de efectos/transiciones.
- `packages/core/src`: bundle compartido y estado visual por frame.
- `packages/renderer-contract/src`: interfaz `RenderEngine`.
- `packages/renderer-remotion/src`: composición y exportación Remotion.

## Fixtures y comprobación

- `fixtures/avatars/robot`: carcasa SVG, manifiesto y 12 capas faciales.
- `fixtures/audio/demo.wav`: audio sintético generado para pruebas.
- `fixtures/audio/demo-envelope.json`: envolvente determinista cacheada.
- `fixtures/projects/demo.edituber.json`: proyecto v2 de 6 segundos y tres estados.
- `fixtures/projects/single-image.edituber.json`: proyecto v2 de una imagen que reacciona a la voz mediante efectos.
- `scripts/verify-demo.ts`: inspección de MP4 y todos sus frames.
- `outputs/edituber-demo.mp4`: artefacto generado, excluido de Git por ser reproducible.

## Documentación

- `docs/PRD.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `ROADMAP.md`.
- `docs/LICENSE-REVIEW.md`: dependencias, assets y revisión comercial pendiente.
