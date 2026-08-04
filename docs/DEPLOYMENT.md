# Instalación local y VPS

## Computadora local

Requisitos: Node.js 22, Corepack y FFmpeg/FFprobe en `PATH`.
En Windows el render usa Chrome o Edge instalado. Si está en una ubicación personalizada, define `EDITUBER_BROWSER_EXECUTABLE` con la ruta completa del ejecutable.

Windows:

```powershell
.\scripts\start-local.ps1
```

Linux o macOS:

```bash
./scripts/start-local.sh
```

Abre `http://127.0.0.1:4317`. El navegador conserva el proyecto y los personajes mediante IndexedDB; **Exportar JSON** genera además una copia portable con el audio incorporado.

## Docker en un VPS

```bash
cp .env.example .env
# Sustituye el valor de EDITUBER_API_TOKEN dentro de .env.
docker compose up --build -d
curl http://127.0.0.1:4317/api/health
```

El puerto queda enlazado únicamente al loopback del VPS. Para acceso remoto se recomienda Caddy, Nginx o Traefik con HTTPS y autenticación adicional. Los MP4 se conservan en el volumen `edituber-data`.

## Respaldo y traslado

- El almacenamiento automático del navegador pertenece a ese perfil y dispositivo.
- Usa **Exportar JSON** para trasladar una producción; el documento incluye audio, imágenes, configuración y timeline.
- Los ZIP de personajes se guardan por separado en el navegador. Conserva también los ZIP originales como biblioteca maestra.
