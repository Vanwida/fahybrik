# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (live: correr es de Apple)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra,
no se suma. **Correr ya tiene dueño y es Apple.** Cada fila del
inventario, verificada contra la documentación antes de tocar nada; dos
descartadas porque la realidad no las sostenía.

**Lo gordo: la carrera se guarda al TERMINAR.** Se guardaba al pulsar
GUARDAR — y del final del esfuerzo a ese toque (lectura, resumen, RPE,
compartir) el entreno vivía SOLO en memoria: `finish()` ya cerró la
instantánea y el resumen no encola. Matar la app ahí se llevaba km,
pulso y mapa. La separación ya estaba en la base sin usar:
`workout_executions` upserta por `assignment_id` con `coalesce`. Así que
**lo MEDIDO va al terminar** (lo declarado en nil = no puede pisar el
RPE) y **lo DECLARADO va en el resumen**. Compartir es un accesorio de
verdad: cuando aparece no queda nada por guardar. Cero servidor, cero
migraciones.

## Cerrado en código (esta PR, esta tanda)

- **Un km es un suceso.** El cursor vivía en el cerebro del AUDIO,
  empujado por los DOS modelos de HUD desde sus timers, y sólo la cinta
  lo reiniciaba al abrir tramo: un rodaje de CALLE arrastraba los metros
  del tramo anterior. Ahora lo detecta el motor donde entran los metros
  (`RunKmSplits`) y sale por `onKmSplit`: la voz lo dice y la muñeca lo
  escribe como `HKWorkoutEvent.lap`. Sin segunda voz porque no hay
  segundo detector.
- **Las páginas del reloj se quedan.** El lienzo recordaba el ÍNDICE y
  `GuionRodaje` no devuelve lista fija (ritmo y distancia sólo con GPS
  fijado; pulso primero con zona viva): la página elegida cambiaba
  debajo del pulgar. Se guarda por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (1 Hz, `Date() -
  startDate`, mirando NUESTRO `isPaused`, **sin un solo lector**). Manda
  `HKLiveWorkoutBuilder.elapsedTime`.
- **Una regla para la cuenta atrás.** `standalone`/`mirrored` convivían
  en la MISMA pantalla del espejo. Queda `remaining()` con la regla del
  móvil, y el háptico del 3-2-1 lee el entero QUE SE PINTA.
- **Se borra la pantalla de cinta de la muñeca** (`treadmillContent` + 5
  ayudantes, cero llamantes) y con ella los tres campos `belt*` del
  cable, que eran copia de `MirrorTramo`. Cae `isTreadmillLive` y el
  acoplamiento del espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian.**
  `legCoveredMeters` era copia del motor con medio segundo de retraso.
- El recorrido llega a la sesión **mientras se corre** (cada 5 puntos):
  con el orden real la escritura del final salía sin mapa.

## Descartado, con motivo (no reabrir sin leer esto)

- **`WatchRunLegDriver` no existe.** El test que lleva su nombre es un
  guarda-raíl que lo dice: el cierre vive en `RunLegProgress` +
  `considerDistanceClose`. Nada que borrar.
- **`RunAutoPause`/`RunPaceSmoother` se quedan.** Apple no da auto-pausa
  a terceros (`motionPaused` lo genera el sistema DENTRO de una sesión
  de watchOS; en iOS no hay API) y `runningSpeed` (watchOS 9) es la
  velocidad DE LA MUÑECA, que una carrera de calle conducida desde el
  móvil no tiene.

## Pendiente de esta rama (dos, con nombre)

1. **Ruta en `HKWorkoutRouteBuilder`.** La API sirve (`insertRouteData`
   + `finishRoute(with:)` atan la ruta a un HKWorkout ya guardado), pero
   atarla exige esperar el uuid que la muñeca contesta segundos después
   del cierre. Ese encuentro asíncrono no se hace a medias. Hoy la ruta
   es la polilínea y el mapa del recap **funciona**; falta que lo vea
   Salud.
2. **Reloj en solitario en un día que sólo es correr.** Es un segundo
   motor y sobra, pero declinarlo hoy deja sin superficie a quien no
   activó el envío a la app Entrenamiento
   (`AppleWatchWorkoutScheduler.isEnabled`, opt-in en Perfil). Necesita
   que esa disponibilidad viaje en `WatchTodayPayload`, o es un
   downgrade.

**SIN COMPILAR NI EJECUTAR:** esta máquina no tiene Xcode. Símbolos de
Apple verificados contra la documentación y los propios contra su
declaración, pero el listón es el **debugger recorriendo un Largo Z2 en
el simulador (iPhone + Watch)** y eso está sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 105, 174,
175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no.
