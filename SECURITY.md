# Seguridad

## Despliegue

- La configuración local escucha en `127.0.0.1`.
- Un servidor que escuche fuera de loopback debe usar `EDITUBER_API_TOKEN`.
- Docker publica el servicio solamente en `127.0.0.1:4317`; usa HTTPS y un proxy inverso para acceso remoto.
- No expongas el token en URLs, commits, capturas ni archivos de proyecto.
- La API recibe paquetes autocontenidos y no permite rutas de archivos elegidas por el cliente.
- Conserva actualizado Node.js, las dependencias y la imagen base.

## Reportes

Mientras el proyecto permanezca en etapa privada de pruebas, informa vulnerabilidades directamente al propietario del repositorio. No abras un issue público que incluya secretos, datos de usuarios o instrucciones de explotación.
