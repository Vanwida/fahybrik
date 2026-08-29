# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (live: correr es de Apple)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no
se suma. **Correr ya tiene dueño y es Apple**: cada fila del inventario
verificada contra la documentación, dos descartadas (abajo).

**Dos escritores para una carrera, y ganaba el malo.** Debugger, Z2 de
Alex, asignación 494: al terminar 3,78 km/22:33/153/5:58; al reabrir
**22:40 y cero bloques**, con **0 POSTs en 18 h**.

1. **iOS no escribía al terminar.** Del final a GUARDAR el entreno vivía
   SOLO en memoria: `finish()` ya cerró la instantánea y el resumen no
   encola. La separación estaba en la base sin usar (`workout_executions`
   upserta por `assignment_id` con `coalesce`), así que **lo MEDIDO va al
   terminar** —lo declarado en nil, que es lo que impide pisar el RPE— y
   **lo DECLARADO va en el resumen**. Compartir es un accesorio: cuando
   aparece no queda nada por guardar.
2. **El volcado de Salud sí escribía.** El HKWorkout de la MUÑECA llegaba
   sin firma, así que `linkExecution` lo adoptaba: duración de **reloj de
   pared** y ni un tramo. Sus cuatro guardas preguntan todas por
   evidencia que sólo existe si nuestro POST llegó primero — eran una
   carrera. La firma sube a `FAHYBRIKCore/HealthKit/SaludNuestra.swift`
   (mismo literal), la ponen las dos vías de la muñeca, y el lector
   aprende la regla que las MUESTRAS ya tenían: `measuredOnly` para
   entrenos. De «¿llegó ya el nuestro?» a «¿es nuestro?».

Cero servidor, cero migraciones en las dos.

## Cerrado en código (esta PR, esta tanda)

El por qué de cada uno, con el caso real, en `docs/DECISIONS.md` (29-ago).

- **Un km es un suceso.** El cursor vivía en el cerebro del AUDIO, lo
  empujaban los DOS modelos de HUD y sólo la cinta lo reiniciaba al abrir
  tramo (un rodaje de CALLE arrastraba los metros del tramo anterior). Lo
  detecta el motor donde entran los metros (`RunKmSplits`) → `onKmSplit`:
  la voz lo dice, la muñeca lo escribe como `HKWorkoutEvent.lap`.
- **Las páginas del reloj se quedan.** El lienzo recordaba el ÍNDICE y el
  guion no devuelve lista fija: la página cambiaba debajo del pulgar. Por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (1 Hz, mirando NUESTRO
  `isPaused`, **sin un solo lector**). Manda `HKLiveWorkoutBuilder.elapsedTime`.
- **Una regla para la cuenta atrás.** `standalone`/`mirrored` convivían en
  la MISMA pantalla. Queda `remaining()`, y el háptico del 3-2-1 lee el
  entero QUE SE PINTA.
- **Se borra la pantalla de cinta de la muñeca** (cero llamantes) y sus
  tres campos `belt*`, copia de `MirrorTramo`. Cae `isTreadmillLive` y con
  él el acoplamiento del espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian**, y el recorrido llega
  a la sesión **mientras se corre**: con el orden real (`finish` →
  `onFinish` → fase → `onDisappear`) la escritura del final iba sin mapa.
- **Numerador y denominador, del mismo sitio.** El historial dividía metros
  de CORRER entre segundos de la SESIÓN: con un bloque de core detrás, el
  ritmo medio salía más lento que cualquiera de sus tramos.

## Descartado del inventario (motivo entero en DECISIONS)

- **`WatchRunLegDriver` no existe**: el test que lleva su nombre es un
  guarda-raíl que lo dice. Nada que borrar.
- **`RunAutoPause`/`RunPaceSmoother` se quedan**: Apple no da auto-pausa a
  terceros, y `runningSpeed` es la velocidad DE LA MUÑECA.

## Pendiente de esta rama (tres, con nombre)

1. **Ruta en `HKWorkoutRouteBuilder`.** La API sirve, pero atarla exige
   esperar el uuid que la muñeca contesta segundos después del cierre, y
   ese encuentro asíncrono no se hace a medias. Hoy la ruta es la
   polilínea y el mapa del recap **funciona**; falta que lo vea Salud.
2. **Reloj en solitario en un día de sólo correr.** Segundo motor, sobra
   — pero declinarlo hoy deja sin superficie a quien no activó el envío a
   la app Entrenamiento (`AppleWatchWorkoutScheduler.isEnabled`, opt-in en
   Perfil). Necesita que viaje en `WatchTodayPayload`, o es downgrade.
3. **El span del correr en el historial.** `CarreraDeLaSesion.duracion`
   mide bloque a bloque por reloj de pared a propósito: suma-vs-span ES la
   recuperación que nadie grabó. El historial no puede reproducirla porque
   `SegmentActualDTO` trae `started_at` y no `ended_at`. En un rodaje da
   igual (un tramo, span = suma).

**SIN COMPILAR NI EJECUTAR:** no hay Xcode aquí. Símbolos de Apple
verificados contra la documentación y los propios contra su declaración,
pero el listón es el **debugger recorriendo un Largo Z2 en simulador
(iPhone + Watch)** y eso está sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 105, 174,
175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no.
