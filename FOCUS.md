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
GUARDAR — y del final a ese toque (lectura, resumen, RPE, compartir) el
entreno vivía SOLO en memoria: `finish()` ya cerró la instantánea y el
resumen no encola. Matar la app ahí se llevaba km, pulso y mapa. La
separación ya estaba en la base sin usar: `workout_executions` upserta
por `assignment_id` con `coalesce`. Así que **lo MEDIDO va al terminar**
(lo declarado en nil = no puede pisar el RPE) y **lo DECLARADO va en el
resumen**. Compartir es un accesorio: cuando aparece no queda nada por
guardar. Cero servidor, cero migraciones.

**Y quien SÍ escribía era el volcado de Salud** (debugger, Z2 de Alex,
asignación 494: al terminar 3,78 km/22:33/153/5:58; al reabrir **22:40 y
cero bloques**, con 0 POSTs en 18 h). El HKWorkout de la MUÑECA llegaba
sin firma, así que `linkExecution` lo adoptaba: duración de **reloj de
pared** y ni un tramo. Sus cuatro guardas preguntan todas por evidencia
que sólo existe si nuestro POST llegó primero — eran una carrera. La
firma sube a `FAHYBRIKCore/HealthKit/SaludNuestra.swift` (mismo literal),
la ponen las dos vías de la muñeca, y el lector aprende la regla que las
MUESTRAS ya tenían: `measuredOnly` para entrenos. La pregunta pasa de
«¿llegó ya el nuestro?» a «¿es nuestro?».

## Cerrado en código (esta PR, esta tanda)

- **Un km es un suceso.** El cursor vivía en el cerebro del AUDIO,
  empujado por los DOS modelos de HUD desde sus timers, y sólo la cinta
  lo reiniciaba al abrir tramo: un rodaje de CALLE arrastraba los metros
  del tramo anterior. Ahora lo detecta el motor donde entran los metros
  (`RunKmSplits`) y sale por `onKmSplit`: la voz lo dice y la muñeca lo
  escribe como `HKWorkoutEvent.lap`. Sin segunda voz: no hay segundo
  detector.
- **Las páginas del reloj se quedan.** El lienzo recordaba el ÍNDICE y
  `GuionRodaje` no devuelve lista fija (ritmo y distancia sólo con GPS
  fijado; pulso primero con zona viva): la página elegida cambiaba
  debajo del pulgar. Se guarda por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (1 Hz, mirando NUESTRO
  `isPaused`, **sin un solo lector**). Manda `HKLiveWorkoutBuilder.elapsedTime`.
- **Una regla para la cuenta atrás.** `standalone`/`mirrored` convivían
  en la MISMA pantalla del espejo. Queda `remaining()` con la regla del
  móvil, y el háptico del 3-2-1 lee el entero QUE SE PINTA.
- **Se borra la pantalla de cinta de la muñeca** (cero llamantes) y sus
  tres campos `belt*` del cable, que eran copia de `MirrorTramo`. Cae
  `isTreadmillLive` y el acoplamiento del espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian**
  (`legCoveredMeters` era copia con medio segundo de retraso), y el
  recorrido llega a la sesión **mientras se corre** (cada 5 puntos): con
  el orden real la escritura del final salía sin mapa.
- **El numerador y el denominador, del mismo sitio.** El historial de una
  carrera dividía los metros de CORRER entre los segundos de la SESIÓN
  (coalesce al revés): con un bloque de core detrás, el ritmo medio salía
  más lento que cualquiera de sus tramos, y distinto del final. Manda lo
  que midieron los tramos.

## Descartado, con motivo (no reabrir sin leer esto)

- **`WatchRunLegDriver` no existe.** El test que lleva su nombre es un
  guarda-raíl que lo dice: el cierre vive en `RunLegProgress` +
  `considerDistanceClose`. Nada que borrar.
- **`RunAutoPause`/`RunPaceSmoother` se quedan.** Apple no da auto-pausa
  a terceros (`motionPaused` lo genera el sistema DENTRO de una sesión de
  watchOS; en iOS no hay API) y `runningSpeed` (watchOS 9) es la velocidad
  DE LA MUÑECA, que una carrera de calle conducida desde el móvil no tiene.

## Pendiente de esta rama (tres, con nombre)

1. **Ruta en `HKWorkoutRouteBuilder`.** La API sirve, pero atarla exige
   esperar el uuid que la muñeca contesta segundos después del cierre, y
   ese encuentro asíncrono no se hace a medias. Hoy la ruta es la
   polilínea y el mapa del recap **funciona**; falta que lo vea Salud.
2. **Reloj en solitario en un día de sólo correr.** Segundo motor, sobra
   — pero declinarlo hoy deja sin superficie a quien no activó el envío a
   la app Entrenamiento (`AppleWatchWorkoutScheduler.isEnabled`, opt-in
   en Perfil). Necesita que viaje en `WatchTodayPayload`, o es un downgrade.
3. **El span del correr en el historial.** `CarreraDeLaSesion.duracion`
   mide bloque a bloque por reloj de pared a propósito: la diferencia
   suma-vs-span ES la recuperación que nadie grabó. El historial no puede
   reproducirla porque `SegmentActualDTO` trae `started_at` y no
   `ended_at`. Para un rodaje da igual (un tramo, span = suma).

**SIN COMPILAR NI EJECUTAR:** esta máquina no tiene Xcode. Símbolos de
Apple verificados contra la documentación y los propios contra su
declaración, pero el listón es el **debugger recorriendo un Largo Z2 en
simulador (iPhone + Watch)** y eso está sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 105, 174,
175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no.
