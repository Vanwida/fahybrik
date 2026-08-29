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
   upserta por `assignment_id` con `coalesce`): **lo MEDIDO va al
   terminar** —lo declarado en nil, que es lo que impide pisar el RPE— y
   **lo DECLARADO va en el resumen**. Compartir es un accesorio.
2. **El volcado de Salud sí escribía.** El HKWorkout de la MUÑECA llegaba
   sin firma, así que `linkExecution` lo adoptaba. Sus cuatro guardas
   preguntan por evidencia que sólo existe si nuestro POST llegó primero —
   eran una carrera. La firma sube a
   `FAHYBRIKCore/HealthKit/SaludNuestra.swift` (mismo literal), la ponen
   las dos vías de la muñeca, y el lector aprende la regla que las MUESTRAS
   ya tenían: `measuredOnly` para entrenos.
3. **Y ese escritor guardaba MENOS que el huérfano.** El mismo HKWorkout
   sin asignación deja km, pulso, calorías, UN tramo y zonas; casado con la
   sesión del coach dejaba duración y procedencia y **nada más**. El mismo
   entreno salía PEOR por estar prescrito. Un escritor:
   `materializeHealthkitWorkout` con `assignment_id`, sin rama (`unique
   (assignment_id)` y los NULL no colisionan).
4. **Las zonas son cuerpo de la carrera**, no adorno del sujeto: se
   pintaban sólo si el sujeto ERA la zona, así que un rodaje con objetivo
   de zona se quedaba sin saber dónde estuvo el pulso.

Cero servidor, cero migraciones en las dos.

## Cerrado en código (esta PR · el por qué de cada uno en DECISIONS, 29-ago)

- **El km: el corte ya existía, el aviso es de Apple.** Metí una segunda
  regla sobre lo que `km-splits.ts` ya corta —«el único sitio que sabe
  derivarlos»— y una segunda voz cuando la app **ya no habla**. Se borra mi
  capa. `AppleWorkoutMapper.kmSteps` trocea un tramo largo de distancia en
  km: `WorkoutKit` **no tiene alerta de split**, pero Apple anuncia el fin
  de cada PASO.
- **Las páginas del reloj se quedan**: recordaba el ÍNDICE y el guion no
  devuelve lista fija, así que la página cambiaba bajo el pulgar. Por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (1 Hz, mirando NUESTRO
  `isPaused`, **sin un lector**). Manda `HKLiveWorkoutBuilder.elapsedTime`.
- **Una regla para la cuenta atrás**, y el háptico del 3-2-1 lee el entero
  QUE SE PINTA.
- **Se borra la pantalla de cinta de la muñeca** (cero llamantes) y sus tres
  campos `belt*`, copia de `MirrorTramo`. Cae con ellos el acoplamiento del
  espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian**, y el recorrido llega
  a la sesión **mientras se corre**.
- **Numerador y denominador del mismo sitio**: el historial dividía metros
  de CORRER entre segundos de la SESIÓN.

## Descartado del inventario (motivo entero en DECISIONS)

- **`WatchRunLegDriver` no existe**: el test que lleva su nombre lo dice.
- **`RunAutoPause`/`RunPaceSmoother` se quedan**: Apple no da auto-pausa a
  terceros, y `runningSpeed` es la velocidad DE LA MUÑECA.

## Pendiente de esta rama (con nombre, no como hueco)

1. **Ruta en `HKWorkoutRouteBuilder`**: la API sirve, pero atarla exige
   esperar el uuid que la muñeca contesta segundos después del cierre. Hoy
   la ruta es la polilínea y el mapa del recap **funciona**; falta Salud.
2. **Reloj en solitario en un día de sólo correr**: segundo motor, sobra —
   pero declinarlo deja sin superficie a quien no activó el envío a la app
   Entrenamiento (opt-in en Perfil).
3. **El span del correr en el historial**: `CarreraDeLaSesion.duracion` mide
   por reloj de pared a propósito (suma-vs-span ES la recuperación que nadie
   grabó) y `SegmentActualDTO` no trae `ended_at`. En un rodaje da igual.
4. **Un rodaje continuo no llega a la muñeca**, así que Apple no tiene paso
   que cantarle: `eligibility` exige `structure` NATIVA mientras el motor
   acepta además las DERIVADAS. Cerrarlo es refactor del mapper, no un corte.
   Y un Z2 por TIEMPO no tiene arreglo por esta vía.

**SIN COMPILAR NI EJECUTAR:** no hay Xcode aquí. Símbolos de Apple
verificados contra la documentación y los propios contra su declaración,
pero el listón es el **debugger recorriendo un Largo Z2 en simulador
(iPhone + Watch)** y eso está sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 105, 174,
175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no.
