# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (live: el walk de Alex iba sin los arreglos)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no
se suma. **NO merge.**

**El walk del 29-ago iba sobre `5a8e2c0`, que es la BASE de la rama: los dos
arreglos de sus dos agujeros son posteriores** (`fa8831f1` el rest, `9a2336a3`
el reloj) y por tanto no estaban en ese binario. Hace falta re-walk sobre el
tip, no código nuevo.

1. **El rest no cerraba** (timer subiendo, distancia clavada ~830 m, el
   siguiente Run sin armar): **los tres síntomas son una línea.**
   `sampleRunDistance` tenía una guarda `tramoMide` que tiraba el sample en
   una recuperación sin modo escrito, y los metros que cierran una
   recuperación de DISTANCIA son justo esos. La guarda es de la CINTA (una
   banda rodando sin el atleta encima) y ahí se queda; el GPS la pierde.
   Cadena verificada entera: sample → `tramoRunCoveredMeters` →
   `considerDistanceClose` → `closeTramo` → siguiente Run.
   Que el work de 5:00 SÍ cerrara encaja: lleva su reloj en su medida.
2. **El reloj no entraba** (SIN RELOJ / readiness). El móvil pedía
   `startWatchApp` cada 4 s, el apretón en frío tarda más, y
   `MirrorSessionController.start` se auto-curaba de cualquier estado ≠
   `.idle` **terminando la sesión que la primera petición acababa de crear**.
   Ahora se pide una vez y se espera (12 s) y sólo se cura lo genuinamente
   viejo (20 s sin señal). `RootView` le da precedencia absoluta a
   `mirror.isActive`, así que readiness = `state == .idle`: cuadra.
   **Encima, hoy:** `startMirroringToCompanionDevice` —LA llamada que
   suscribe al móvil— se hacía con `try?`, y los dos caminos por los que
   `beginRecording` volvía a idle eran mudos. Un espejo caído era
   indistinguible de uno abierto. Se reintenta y queda dicho.

**Descartado hoy sin escribirlo:** rellenar el descanso con el `rest_s` del
plano. La gramática exige `measure` en TODO segmento (int > 0), así que un
descanso sin medida no llega por el cable: forma que el servidor no manda.

## Cerrado en código (esta PR · el por qué de cada uno en DECISIONS, 29-ago)

- **El km: el corte ya existía, el aviso es de Apple.** Se borra mi capa (era
  segunda regla sobre `km-splits.ts` y segunda voz cuando la app ya no habla).
  `AppleWorkoutMapper.kmSteps` trocea el tramo largo: `WorkoutKit` no tiene
  alerta de split, pero Apple anuncia el fin de cada PASO.
- **Las páginas del reloj se quedan**: recordaba el ÍNDICE. Por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (sin un lector). Manda
  `HKLiveWorkoutBuilder.elapsedTime`. Y **una** regla de cuenta atrás.
- **Se borra la pantalla de cinta de la muñeca** (cero llamantes) y sus tres
  campos `belt*`. Cae el acoplamiento del espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian**; el recorrido llega a la
  sesión mientras se corre; y el historial ya no divide metros de CORRER entre
  segundos de la SESIÓN.

## Descartado del inventario (motivo entero en DECISIONS)

- **`WatchRunLegDriver` no existe**: el test que lleva su nombre lo dice.
- **`RunAutoPause`/`RunPaceSmoother` se quedan**: Apple no da auto-pausa a
  terceros y `runningSpeed` es la velocidad DE LA MUÑECA.

## Pendiente de esta rama (con nombre, no como hueco)

1. **Ruta en `HKWorkoutRouteBuilder`**: atarla exige esperar el uuid que la
   muñeca contesta segundos después del cierre. Hoy la ruta es la polilínea y
   el mapa del recap **funciona**; falta Salud.
2. **Reloj en solitario en un día de sólo correr**: segundo motor, sobra — pero
   declinarlo deja sin superficie a quien no activó el opt-in de Perfil.
3. **El span del correr en el historial**: `duracion` mide por reloj de pared a
   propósito y `SegmentActualDTO` no trae `ended_at`. En un rodaje da igual.
4. **Un rodaje continuo no llega a la muñeca**: `eligibility` exige `structure`
   NATIVA mientras el motor acepta además las DERIVADAS. Refactor del mapper,
   no un corte. Y un Z2 por TIEMPO no tiene arreglo por esta vía.

**SIN COMPILAR NI EJECUTAR:** no hay Xcode aquí. El listón es el **debugger
recorriendo un Largo Z2 en simulador (iPhone + Watch)**, sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 105, 174,
175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no.
