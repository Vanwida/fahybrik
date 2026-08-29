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
   controla desde el iPhone»: todo el vivo colgaba de que llegara una trama. Esa
   pantalla ES la pieza — su sesión de HealthKit ya estaba grabando. Se borra; sin
   trama pinta lo que ELLA mide (`GuionDeLaMuneca`: las mismas tres páginas con la
   pieza abierta) y pausar/terminar actúan sobre su propia sesión. **Y en el
   motor:** `abandon()` acababa la grabación SIN escribir el entreno al traspasar,
   así que empezar en la muñeca y abrir luego el móvil costaba esos minutos.
   Borrado: toda sesión que acaba guarda.
2. **Salir no era terminar.** La puerta preguntaba por el trabajo que CUENTA
   (excluye el calentamiento a propósito) en vez de por lo que se MIDIÓ. El día
   caminado empieza por un calentamiento de 8:00: con 307 m de GPS ya en
   pantalla, el aspa descartaba en SILENCIO. Ahora pregunta
   `hayMedidoQueSePerderia` y `hasRecordedWork` se borra (sin llamantes, y su
   comentario describía una regla que ya no existe).

Del walk de `5a8e2c0` quedan cerrados el rest y el apretón de manos. En DECISIONS.

## Cerrado en código (esta PR · el por qué de cada uno en DECISIONS, 29-ago)

**Borrado:** mi capa de km · el `tickTimer` sin lectores · la pantalla de cinta de la muñeca y sus campos `belt*` · el degradado que apagaba la zona · el `TabView` sobre el paginador · los velos de pausa y descanso.
**Arreglado:** páginas por **id** y no por índice · una regla de cuenta atrás · los metros del tramo se preguntan · el recorrido llega mientras se corre · el recap se persiste al End antes de cualquier UI.
**Descartado con motivo:** `WatchRunLegDriver` no existe · `RunAutoPause`/`RunPaceSmoother` se quedan · rellenar el descanso con el `rest_s` del plano (la gramática exige `measure`).

## Pendiente de esta rama (con nombre, no como hueco)

1. **BLOQUEANTE: el km no se canta en NINGUNA superficie.** «Lo canta Apple» +
   «el Watch está en la sesión» no pueden ser verdad a la vez:
   `HKWorkoutSession` no acepta un `WorkoutPlan` (comprobado en la doc), así que
   Apple sólo canta en SU app —donde las tres páginas no están— y un Z2 `steady`
   ni llega ahí (`eligibility` exige estructura nativa). Propuesta en DECISIONS:
   el corte del km como SUCESO grabado en la traza. **Decide Alex.**
2. **CLASE 1 VIVA: dos dueños de `HKWorkoutSession` en la muñeca.** `liveStart` está
   en el cable *para* cuando `startWatchApp` no levanta la app, y al llegar sólo
   cierra el motor de la muñeca — nunca la pone a grabar: de ahí SIN RELOJ en el
   iPhone y readiness en el reloj. **Verificado en la doc**: `HKWorkoutSessionType`
   sólo tiene `.primary` («on watchOS») y `.mirrored` («on the companion iOS
   device»), así que `MirrorSessionController` creando la suya es un SEGUNDO primary
   donde Apple tiene uno. **Diseño en DECISIONS** con las tres cosas que lo hacen un
   pase con compilador: el orden del `ended` (el uuid existe tras `finishWorkout` y
   el canal muere con la sesión), el timeout de un `finishWorkout` colgado, y las
   guardas de época. El lado del dueño se escribió y se **revirtió** antes de
   empujar: sin migrar el espejo era API muerta. **Diseñado; no empezado.**
3. **El reloj EN SOLITARIO sigue con `LiveFlowView`**, que arma sus páginas a
   mano, y `GuionRodaje`/`GuionSeries` viven en el escaparate DEBUG: dos looks.
4. **Ruta en `HKWorkoutRouteBuilder`**: Salud no recibe recorrido; el mapa del
   recap funciona con nuestra polilínea. **Pasados 99 min** el crono son 6 glifos
   y no cabe de sujeto. **«Sin señal»** sale también en una cinta sin emparejar,
   donde tocaría «sin máquina». Y el **span del correr en el historial**, igual.

**SIN COMPILAR AQUÍ:** no hay Xcode en esta VM. El debugger sí compiló en el Mac
(build 21); lo de este turno no se ha compilado ni ejecutado.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no. **105 cortada: su interfaz es la que hay.**
