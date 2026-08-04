# Reglas para agentes que automatizan EDITuber

1. Lee `README.md`, `docs/API.md` y `docs/SCRIPT-DIRECTIVES.md` antes de producir un proyecto.
2. No modifiques el contrato JSON, el motor determinista ni el render sin actualizar esquemas, migraciones, pruebas y documentación.
3. Todo guion automático debe usar `TIEMPO | EMOJI | TEXTO`, comenzar en `00:00.000` y validarse contra el avatar antes de tocar la timeline.
4. Si falta un emoji, detén la producción y reporta todas las emociones que deben agregarse. No sustituyas emociones silenciosamente.
5. El audio definitivo es la fuente de verdad para los tiempos. Recalcula las directivas después de generar o editar la voz.
6. Conserva `audioSource` en el documento portable cuando el proyecto deba trasladarse o renderizarse por API.
7. Nunca envíes rutas arbitrarias al servidor ni publiques una API sin token y HTTPS.
8. Ejecuta `pnpm check`, `pnpm test` y `pnpm build` antes de entregar cambios.
