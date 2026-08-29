# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero; el mapa que abre él es `docs/tablero.html`.
Última actualización: **2026-08-29** (las dos clases del walk)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no se suma. **NO merge.**

**105 CORTADA. La interfaz de correr en la muñeca ya no es propuesta:**
`datos | VIVO | controles`, el esfuerzo en el CENTRO y el deslizamiento se
queda. Mocks en `cursor/reloj-correr-tres-paginas-5db7` (diseño, no se
mergea). Nace `GuionCorrer` y el espejo deja de servir `GuionRodaje` /
`GuionSeries`: un rodaje libre y un 5×1.000 del coach son las mismas tres
páginas con distinto contenido. El por qué entero en DECISIONS (29-ago).

Cuatro que salieron construyéndolo y no eran cosméticas: la zona no se leía por
el DEGRADADO, no por flojo (plano al 45 %, tope que pone el ámbar de la Z4
contra el aro); un cromo gris fijo no vive sobre un lienzo teñido (blanco con
alfa 0,76); la altura del sujeto salía de `texto.count`, que cuenta la coma y la
unidad como cifras; y el crono escribía las horas (siete glifos, tope cinco), o
sea que el rodaje largo no cabía.

**Walk en simulador (compila, build 21): DOS CLASES, no doce bugs, y las dos
eran una pregunta contestada por quien no le tocaba.** El por qué en DECISIONS.

1. **La muñeca no estaba EN la sesión.** Spinner + «CONECTANDO…» + «El entreno se
   controla desde el iPhone»: todo el vivo colgaba de que llegara una trama.
   Esa pantalla ES la pieza — la sesión de HealthKit ya era suya y estaba
   grabando. Se borra; sin trama pinta lo que ELLA mide (`GuionDeLaMuneca`, las
   mismas tres páginas con la pieza abierta), y pausar/terminar actúan sobre su
   propia sesión. La trama pasa de condición a enriquecimiento.
2. **Salir no era terminar.** La puerta preguntaba por el trabajo que CUENTA
   (excluye el calentamiento a propósito) en vez de por lo que se MIDIÓ. El día
   caminado empieza por un calentamiento de 8:00: con 307 m de GPS ya en
   pantalla, el aspa descartaba en SILENCIO. Ahora pregunta
   `hayMedidoQueSePerderia` y `hasRecordedWork` se borra (sin llamantes, y su
   comentario describía una regla que ya no existe).

Del walk anterior (sobre `5a8e2c0`) quedan cerrados el rest que no cerraba —la
guarda `tramoMide`, estrechada— y el apretón de manos del reloj. En DECISIONS.

## Cerrado en código (esta PR · el por qué de cada uno en DECISIONS, 29-ago)

- **El km: se borró mi capa** (era segunda regla sobre `km-splits.ts`) y `kmSteps`
  trocea el tramo para que Apple cante cada paso — pero eso sólo vale en la app de
  Apple: **ver el bloqueante 1, hoy no se canta**.
- **Las páginas del reloj se quedan**: recordaba el ÍNDICE. Por **id**.
- **Muere el `tickTimer`** (sin un lector): manda `HKLiveWorkoutBuilder.elapsedTime`.
  Y **una** regla de cuenta atrás. Se borra la pantalla de cinta de la muñeca (cero
  llamantes) y sus tres campos `belt*`.
- **Los metros del tramo se preguntan, no se copian**; el recorrido llega a la
  sesión mientras se corre; y el historial ya no divide metros de CORRER entre
  segundos de SESIÓN.
- **Descartado:** `WatchRunLegDriver` no existe · `RunAutoPause` y
  `RunPaceSmoother` se quedan · rellenar el descanso con el `rest_s` del plano
  (la gramática exige `measure` en todo segmento, así que no llega por el cable).

## Pendiente de esta rama (con nombre, no como hueco)

1. **BLOQUEANTE: el km no se canta en NINGUNA superficie.** «Lo canta Apple» +
   «el Watch está en la sesión» no pueden ser verdad a la vez:
   `HKWorkoutSession` no acepta un `WorkoutPlan` (comprobado en la doc), así que
   Apple sólo canta en SU app —donde las tres páginas no están— y un Z2 `steady`
   ni llega ahí (`eligibility` exige estructura nativa). Propuesta en DECISIONS:
   el corte del km como SUCESO grabado en la traza. **Decide Alex.**
2. **El reloj EN SOLITARIO (sin espejo abierto) sigue con `LiveFlowView`**, que
   arma sus páginas a mano, y `GuionRodaje`/`GuionSeries` viven en el escaparate
   DEBUG: dos looks de correr en el repo.
3. **Ruta en `HKWorkoutRouteBuilder`**: Salud no recibe recorrido. El mapa del
   recap **funciona** (polilínea nuestra).
4. **Pasados 99 min el crono son 6 glifos** y no cabe de sujeto · **«sin señal»
   sale también en una cinta sin emparejar**, donde tocaría «sin máquina» · el
   **span del correr en el historial**, igual que estaba.

**SIN COMPILAR AQUÍ:** no hay Xcode en esta VM. El debugger sí compiló en el Mac
(build 21); lo de este turno no se ha compilado ni ejecutado.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no. **105 cortada: su interfaz es la que hay.**
