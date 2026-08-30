# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero; el mapa que abre él es `docs/tablero.html`.
Última actualización: **2026-08-30** (clase 1: chrome ≠ sesión Apple)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no se suma. **NO merge.**

**Walk `1be0aad4` v23 Mac (Libre 1×800):** iPhone SIN RELOJ + FC sin reloj
todo el rato (187→388 m). GPS=map. Watch: 3 páginas AL AIRE LIBRE ·
llevas, crono 00:00. Eso es `GuionDeLaMuneca` (chrome), no una
`HKWorkoutSession` `.primary` con `HKLiveWorkoutBuilder`. Recap iPhone
388 m · 2:19 · 5:59/km — no tocar. EmptyState al salir: no es el muro;
no se parchea el copy.

**Hipótesis: confirmada.** `start()` creaba el objeto, ponía `isActive =
true` y el segundo `start` salía por `session != nil` sin
`startActivity` ni `beginCollection`. `elapsedTime(at:)` = 0. Sin
`.running` no hay `startMirroringToCompanionDevice` → el iPhone no es
suscriptor `.mirrored`.

**Borrado:** esa mentira. `isActive` sigue `session.state` (`.running` /
`.paused`). Si el objeto existe y no corre, se llama `prepare()` +
`startActivity` + `beginCollection(at:)`. El espejo al teléfono cuando
Apple dice `.running`. Una primary. Sin motor nuevo. Sin bump de
versión.

**Dueño:** `LiveWorkoutSession`. El espejo no crea sesión.

**105 CORTADA.** `datos | VIVO | controles`.

## Cerrado en código (esta PR · el por qué en DECISIONS)

**Borrado:** el segundo primary · matar la sesión si `beginCollection`
falla · `isActive` al crear el objeto · `abandon()` · CONECTANDO ·
`hasRecordedWork` · capa de km · `tickTimer` · cinta de la muñeca ·
degradado · `TabView` sobre el paginador · velos.
**Arreglado:** recap = telemetría · `finish()` escribe la pierna abierta.
**Descartado:** `WatchRunLegDriver` · no rellenar descanso con `rest_s`.

## Pendiente de esta rama

1. **BLOQUEANTE: el km no se canta.** Decide Alex. No se inventa voz.
2. Reloj en solitario: `LiveFlowView` — dos looks.
3. Ruta en `HKWorkoutRouteBuilder`. Crono a 6 glifos / 99 min. «Sin señal»
   en cinta sin emparejar. Span del historial.

**SIN COMPILAR AQUÍ:** no hay Xcode. Marc compila en Mac + Libre 1×800.
Si SIN RELOJ o crono 00:00: sigue sin hecho.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM`
(`S6W4459DDG`). Neon no. Analítica 178 no. **105 cortada.**
