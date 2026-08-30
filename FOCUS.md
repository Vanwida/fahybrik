# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero; el mapa que abre él es `docs/tablero.html`.
Última actualización: **2026-08-30** (clase 1: un dueño en la muñeca)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no se suma. **NO merge.**

**Clase 1 hecha en código.** Se borró el dueño de `HKWorkoutSession` en
`MirrorSessionController` (sesión, builder, delegados). Queda
`LiveWorkoutSession` — la instancia del coordinador. El espejo suscribe el
canal. `liveStart` lleva actividad + ubicación y ARRANCA esa sesión (un `true`
viejo se resuelve con el día). Cierre único: `finishWorkout` acotado → `ended`
por el canal vivo → `session.end()`. `cederMotor()` suelta el cursor y no mata
la grabación.

**SIN RELOJ todavía puede pasar** si no hay reloj emparejado, si
`startMirroringToCompanionDevice` falla del todo, o si la app del reloj no
está en marcha y `startWatchApp` no la levanta. No si el reloj está en
readiness: ese era el walk (`d59ce98b`).

**105 CORTADA.** `datos | VIVO | controles`. Mocks en
`cursor/reloj-correr-tres-paginas-5db7` (diseño, no se mergea).

## Cerrado en código (esta PR · el por qué en DECISIONS)

**Borrado:** el segundo primary de la muñeca · `abandon()` · CONECTANDO ·
`hasRecordedWork` · mi capa de km · `tickTimer` · cinta de la muñeca ·
degradado de zona · `TabView` sobre el paginador · velos de pausa/descanso.
**Arreglado:** recap = telemetría · `finish()` escribe la pierna abierta ·
páginas por id · metros del tramo · recorrido en vivo · recap al End.
**Descartado:** `WatchRunLegDriver` · no rellenar descanso con `rest_s` del plano.

## Pendiente de esta rama

1. **BLOQUEANTE: el km no se canta.** `HKWorkoutSession` no acepta
   `WorkoutPlan`. Propuesta en DECISIONS; decide Alex. No se inventa voz.
2. El reloj EN SOLITARIO sigue con `LiveFlowView` — dos looks.
3. Ruta en `HKWorkoutRouteBuilder` (Salud no recibe recorrido). Crono a 6
   glifos pasados 99 min. «Sin señal» en cinta sin emparejar. Span del
   historial.

**SIN COMPILAR AQUÍ:** no hay Xcode. Build 21 visible. Este turno no se
compiló ni ejecutó.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM`
(`S6W4459DDG`). Neon no. **105 cortada: su interfaz es la que hay.**
