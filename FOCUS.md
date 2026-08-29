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

Cuatro que salieron construyéndolo y no eran cosméticas: la zona no se leía
por el DEGRADADO, no por flojo (plano al 45 %, tope que pone el ámbar de la Z4
contra el aro); un cromo gris fijo no vive sobre un lienzo teñido (blanco con
alfa 0,76); la altura del sujeto salía de `texto.count`, que cuenta la coma y
la unidad como cifras; y el crono escribía las horas («1:02:40», siete glifos)
con tope de cinco, o sea que el rodaje largo no cabía.

**El walk del 29-ago iba sobre `5a8e2c0`, la BASE de la rama: los arreglos de
sus dos agujeros son posteriores** (`fa8831f1`, `9a2336a3`). Re-walk sobre el
tip, no código nuevo.

1. **El rest no cerraba** (timer subiendo, distancia clavada, siguiente Run sin
   armar): los tres son UNA línea, la guarda `tramoMide` de
   `sampleRunDistance`, que es de la cinta y no del GPS. Cadena verificada
   hasta `closeTramo`. Que el work de 5:00 SÍ cerrara encaja: lleva su reloj en
   su propia medida.
2. **El reloj no entraba**: el móvil relanzaba cada 4 s encima de un arranque a
   medias y la muñeca se auto-curaba matándolo. `RootView` da precedencia
   absoluta a `mirror.isActive`, así que readiness = `.idle`: cuadra. **Encima:**
   `startMirroringToCompanionDevice` —la llamada que suscribe al móvil— se hacía
   con `try?`, y los dos caminos a idle eran mudos.

## Cerrado en código (esta PR · el por qué de cada uno en DECISIONS, 29-ago)

- **El km: el corte ya existía, el aviso es de Apple.** Se borra mi capa (era
  segunda regla sobre `km-splits.ts` y segunda voz cuando la app ya no habla).
  `kmSteps` trocea el tramo: `WorkoutKit` no tiene alerta de split, pero Apple
  anuncia el fin de cada PASO.
- **Las páginas del reloj se quedan**: recordaba el ÍNDICE. Por **id**.
- **Muere el `tickTimer` de `LiveWorkoutSession`** (sin un lector): manda
  `HKLiveWorkoutBuilder.elapsedTime`. Y **una** regla de cuenta atrás.
- **Se borra la pantalla de cinta de la muñeca** (cero llamantes) y sus tres
  campos `belt*`; cae el acoplamiento del espejo a `DeviceHub`.
- **Los metros del tramo se preguntan, no se copian**; el recorrido llega a la
  sesión mientras se corre; y el historial ya no divide metros de CORRER entre
  segundos de SESIÓN. Y **descartado sin escribirlo**: rellenar el descanso con
  el `rest_s` del plano (la gramática exige `measure` en todo segmento).
- **Descartado:** `WatchRunLegDriver` no existe · `RunAutoPause` y
  `RunPaceSmoother` se quedan (Apple no da auto-pausa a terceros).

## Pendiente de esta rama (con nombre, no como hueco)

1. **El reloj EN SOLITARIO sigue con el look viejo.** Las tres páginas entran
   por el espejo, que es el 90 % de las sesiones; sin móvil manda
   `LiveFlowView`, que arma sus páginas a mano, y `GuionRodaje`/`GuionSeries`
   quedan vivos sólo en el escaparate DEBUG. Son dos looks de correr en el
   repo: hay que cerrarlo.
2. **Ruta en `HKWorkoutRouteBuilder`**: atarla exige esperar el uuid que la
   muñeca contesta después del cierre. El mapa del recap **funciona**; falta Salud.
3. **Pasados 99 min el crono son 6 glifos** y no cabe de sujeto (sólo se llega
   ahí sin un metro medido en 1 h 40). El kit manda la hora al contexto; hay un
   test que clava el límite. Y **«sin señal» también sale en una cinta sin
   emparejar**, donde tocaría «sin máquina»: el cable no dice si es de calle.
4. **El span del correr en el historial** y **un rodaje continuo no llega a la
   muñeca** (`eligibility` exige `structure` nativa): igual que estaban.

**SIN COMPILAR NI EJECUTAR:** no hay Xcode aquí. El listón es el **debugger
recorriendo un Largo Z2 en simulador (iPhone + Watch)**, sin hacer.

No tocar: GPS/authority (la cifra que cuadra con el mapa), 174, 175, plan
del 67, `DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon no. **105 ya está cortada:
su interfaz es la que hay, no se inventa otra.**
