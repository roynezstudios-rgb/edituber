# API local de EDITuber

La API recibe documentos `edituber-portable` v1 autocontenidos. No acepta rutas elegidas por el cliente: el audio y las imágenes viajan dentro del documento, lo que evita lecturas arbitrarias del servidor.

## Inicio

```bash
pnpm build:web
pnpm start:server
```

Por defecto escucha exclusivamente en `127.0.0.1:4317`. Para un VPS:

```bash
EDITUBER_HOST=0.0.0.0 EDITUBER_API_TOKEN="una-clave-larga" pnpm start:server
```

Cuando existe `EDITUBER_API_TOKEN`, todas las rutas salvo `/api/health` exigen `Authorization: Bearer <token>`. No se debe publicar el puerto directamente; colócalo detrás de HTTPS y un proxy inverso.

## Rutas

- `GET /api/health`: estado y versión.
- `POST /api/v1/validate`: valida un documento portable sin renderizarlo.
- `POST /api/v1/directives/validate`: valida un guion directivo contra las emociones del avatar y devuelve sus eventos por frame.
- `POST /api/v1/renders`: crea un trabajo de render y devuelve `202` con su identificador.
- `GET /api/v1/renders/:id`: devuelve `queued`, `rendering`, `completed` o `failed`.
- `GET /api/v1/renders/:id/file`: descarga el MP4 cuando terminó.

Ejemplo:

```bash
curl -H "Authorization: Bearer $EDITUBER_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @proyecto.edituber.json \
  http://127.0.0.1:4317/api/v1/renders
```

La cola ejecuta un render a la vez para evitar que varios Chromium agoten la memoria. El límite predeterminado es 180 MB por solicitud y 600 segundos de audio; se configura con `EDITUBER_MAX_DURATION_SECONDS`.

`EDITUBER_BROWSER_EXECUTABLE` permite indicar Chrome/Chromium explícitamente. En Windows, si no se define, EDITuber busca Chrome y Edge en sus ubicaciones habituales; en Linux usa el Chromium incluido para render.
