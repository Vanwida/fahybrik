# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-29** (correr en la muñeca: tres páginas)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no
se suma. **NO merge.**

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

**El walk del 29-ago iba sobre `5a8e2c0`, la BASE de la rama: los arreglos de
sus dos agujeros son posteriores** (`fa8831f1`, `9a2336a3`). Re-walk sobre el tip.

1. **El rest no cerraba** (timer subiendo, distancia clavada, siguiente Run sin
   armar): los tres son UNA línea, la guarda `tramoMide` de `sampleRunDistance`,
   que es de la cinta y no del GPS. Cadena verificada hasta `closeTramo`. Que el
   work de 5:00 SÍ cerrara encaja: lleva su reloj en su propia medida.
2. **El reloj no entraba**: el móvil relanzaba cada 4 s encima de un arranque a
   medias y la muñeca se auto-curaba matándolo. `RootView` da precedencia
   absoluta a `mirror.isActive`, así que readiness = `.idle`: cuadra. **Encima:**
   `startMirroringToCompanionDevice` —la que suscribe al móvil— se hacía con
   `try?`, y los dos caminos a idle eran mudos.

## Cerrado en código (esta PR · el por qué de cada uno en DECISIONS, 29-ago)

- **El km: se borró mi capa** (era segunda regla sobre `km-splits.ts`) y
  `kmSteps` trocea el tramo para que Apple cante el fin de cada paso. Pero eso
  sólo vale en la app de Apple — **ver el bloqueante 1: hoy no se canta**.
- **Las páginas del reloj se quedan**: recordaba el ÍNDICE. Por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (sin un lector): manda
  `HKLiveWorkoutBuilder.elapsedTime`. Y **una** regla de cuenta atrás.
- **Se borra la pantalla de cinta de la muñeca** (cero llamantes) y sus tres
  campos `belt*`; cae el acoplamiento del espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian**; el recorrido llega a la
  sesión mientras se corre; y el historial ya no divide metros de CORRER entre
  segundos de SESIÓN.
- **Descartado:** `WatchRunLegDriver` no existe · `RunAutoPause` y
  `RunPaceSmoother` se quedan · rellenar el descanso con el `rest_s` del plano
  (la gramática exige `measure` en todo segmento, así que no llega por el cable).

## Pendiente de esta rama (con nombre, no como hueco)

1. **BLOQUEANTE DEL LISTÓN: el km no se canta en NINGUNA superficie**, y «lo
   canta Apple» + «el Watch está en la sesión» no pueden ser verdad a la vez.
   `HKWorkoutSession` no acepta un `WorkoutPlan` (comprobado en la doc), así
   que Apple sólo canta dentro de SU app — donde las tres páginas no están —,
   y un Z2 `steady` ni llega ahí porque `eligibility` exige estructura nativa.
   La voz propia se borró el 29-ago con una premisa que sólo valía en la
   superficie de Apple. Propuesta en DECISIONS: el corte del km es un SUCESO,
   se graba en la traza, se dice en vivo y el recap pinta ese mismo evento.
   **Decide Alex; no lo construyo a medias.**
2. **El reloj EN SOLITARIO sigue con el look viejo.** Las tres páginas entran
   por el espejo, que es el 90 % de las sesiones; sin móvil manda
   `LiveFlowView`, que arma sus páginas a mano, y `GuionRodaje`/`GuionSeries`
   quedan vivos sólo en el escaparate DEBUG: dos looks de correr en el repo.
3. **Ruta en `HKWorkoutRouteBuilder`**: atarla exige esperar el uuid que la
   muñeca contesta después del cierre. El mapa del recap **funciona**; falta Salud.
4. **Pasados 99 min el crono son 6 glifos** y no cabe de sujeto. Y **«sin señal»
   también sale en una cinta sin emparejar**, donde tocaría «sin máquina». Más
   **el span del correr en el historial**, igual que estaba.

**SIN COMPILAR NI EJECUTAR:** no hay Xcode aquí. El listón es el **debugger
recorriendo un Largo Z2 en simulador (iPhone + Watch)**, sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 174, 175, plan
del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no. **105 ya está cortada:
su interfaz es la que hay, no se inventa otra.**
