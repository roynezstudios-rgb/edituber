# Lista de aceptación de 0.2.0

El candidato no se convierte en versión estable hasta completar esta lista en una máquina distinta a la de desarrollo.

- [ ] Clonar o descomprimir el repositorio en Windows y Linux.
- [ ] Iniciar con el script local y abrir el Web Lab.
- [x] Importar un personaje ZIP con varias emociones.
- [ ] Grabar dos fragmentos y confirmar que se acumulan.
- [ ] Cortar, eliminar, deshacer y ampliar la timeline.
- [x] Exportar el proyecto, cerrar el navegador e importarlo nuevamente.
- [x] Confirmar que audio, sprites, timeline y ajustes sobreviven al traslado.
- [x] Renderizar el proyecto real desde el botón MP4 y reproducir el resultado.
- [x] Levantar Docker con token y consultar todas las rutas de la API.
- [x] Ejecutar `pnpm check`, `pnpm test`, `pnpm build`, `pnpm audit --prod` y el render de demostración.
- [x] Confirmar AGPL-3.0-only como licencia de distribución de EDITuber.
- [ ] Confirmar la licencia comercial aplicable de Remotion.
- [x] Registrar cualquier diferencia visual entre previsualización y MP4.

Validación externa realizada en Ubuntu 24.04.4 LTS sobre el commit `6cb7e82`: los renders
completados conservaron tamaño y SHA-256 después de reiniciar Docker; los renders interrumpidos se
recuperaron como fallidos y nunca se ofrecieron como MP4 terminados.
