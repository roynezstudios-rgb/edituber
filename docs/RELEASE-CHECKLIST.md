# Lista de aceptación de 0.2.0

Aceptación de la versión estable ejecutada el 4 de agosto de 2026 en Windows y mediante validación externa en Ubuntu 24.04.4 LTS. La CI vuelve a ejecutar formato, tipos, pruebas, compilación, seguridad y render sobre el commit publicado.

- [x] Clonar o descomprimir el repositorio en Windows y Linux.
- [x] Iniciar con el script local y abrir el Web Lab.
- [x] Importar un personaje ZIP con varias emociones.
- [x] Grabar dos fragmentos y confirmar que se acumulan mediante el flujo y sus pruebas de regresión.
- [x] Cortar, eliminar, deshacer y ampliar la timeline; además, recargar y recuperar el WAV editado.
- [x] Exportar el proyecto, cerrar el navegador e importarlo nuevamente.
- [x] Confirmar que audio, sprites, timeline y ajustes sobreviven al traslado.
- [x] Renderizar el proyecto real desde el botón MP4 y reproducir el resultado.
- [x] Levantar Docker con token y consultar todas las rutas de la API.
- [x] Ejecutar `pnpm check`, `pnpm test`, `pnpm build`, `pnpm audit --prod` y el render de demostración.
- [x] Confirmar AGPL-3.0-only como licencia de distribución de EDITuber.
- [x] Confirmar la licencia aplicable de Remotion para un mantenedor individual/equipo de hasta tres personas.
- [x] Registrar cualquier diferencia visual entre previsualización y MP4.

Validación externa realizada en Ubuntu 24.04.4 LTS sobre el commit `6cb7e82`: los renders
completados conservaron tamaño y SHA-256 después de reiniciar Docker; los renders interrumpidos se
recuperaron como fallidos y nunca se ofrecieron como MP4 terminados.

Validación Windows del Web Lab sobre `56f7878`: 88/88 pruebas, compilación completa y recuperación
inmediata del audio después de cortar 0:00–0:02 y recargar. Los cambios posteriores hasta la etiqueta
`v0.2.0` se limitan a separación de alcance, versión y documentación y se vuelven a comprobar en CI.
