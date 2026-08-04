# Guion directivo de emociones

El guion directivo es la pista de instrucciones que una IA entrega junto con el audio. Cada línea indica el momento exacto en que debe cambiar la emoción:

```text
# edituber-directives v1
00:00.000 | 🙂 | Hoy vamos a explicar una idea sencilla.
00:03.250 | 🤔 | Primero pensemos por qué ocurre.
00:08.900 | 😮 | Y aquí aparece el dato sorprendente.
```

La unidad es `horas:minutos:segundos.milisegundos` o `minutos:segundos.milisegundos`. La primera directiva debe comenzar en `00:00.000` y los tiempos deben aumentar estrictamente.

## Regla de producción

Antes de modificar la timeline, el sistema valida todo el archivo. Si un emoji no existe entre los estados del personaje, devuelve la lista completa de emociones faltantes y no aplica ningún cambio. Tampoco acepta tiempos fuera del audio, líneas sin texto ni marcas desordenadas.

En el Web Lab, usa **Importar guion directivo** dentro de la timeline. Para automatización, usa `POST /api/v1/directives/validate` y aplica únicamente un resultado con `ok: true`.

Una IA que genere voz debe calcular las marcas usando el audio definitivo, no solo una estimación de lectura. Si todavía no existe audio, puede producir una propuesta, pero debe recalcularla antes de producción.
