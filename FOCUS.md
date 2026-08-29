# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (live: rest que cierra + reloj que entra)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no
se suma. **NO merge.**

**Debugger 29-ago, serie de umbral. Ya es verdad:** el rest es el mismo HUD
que el Run (no el overlay gym) y el footer del reloj dice build 21.

**Y las dos que seguían siendo falsas, las dos con una causa cada una:**

1. **El motor no cerraba el rest** (timer subiendo, distancia clavada, el
   siguiente Run sin armar). `sampleRunDistance` tenía una guarda
   `tramoMide` que tiraba el sample en una recuperación **sin modo
   escrito** — y los metros que cierran una recuperación de DISTANCIA son
   justo esos. Sin metros que crucen la meta, el cursor no avanza. La
   guarda es de la CINTA (una banda rodando sin el atleta encima) y ahí se
   queda; el GPS la pierde. Si está parado, CoreLocation no reporta nada:
   la guarda no ahorraba nada en el caso que la motivó.
2. **El reloj no entraba en la sesión** (SIN RELOJ en el móvil, readiness
   en la muñeca). El móvil pedía `startWatchApp` **cada 4 s** y el apretón
   en frío tarda más; la segunda petición llegaba con la primera a medias y
   `MirrorSessionController.start` se auto-curaba de cualquier estado ≠
   `.idle`, **terminando la sesión que la primera acababa de crear**. El
   último force-release dejaba el reloj en `.idle` = la esfera. Ahora se
   pide una vez y se ESPERA (12 s), y la muñeca sólo cura un estado
   genuinamente viejo (20 s sin señal). El error de `startWatchApp` deja de
   tirarse: el móvil estrena el `Logger` que la muñeca ya tenía, así que
   «SIN RELOJ» pasa a tener diagnóstico.

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
