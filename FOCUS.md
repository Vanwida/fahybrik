# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero; el mapa que abre él es `docs/tablero.html`.
Última actualización: **2026-08-30** (clase 1: beginCollection no mata la sesión)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Un escritor. Se borra, no se suma. **NO merge.**

**Walk `375ded21` (simulador, build 21, Libre 1×800):** Health Access, luego
«Abre FAHYBRID en el iPhone» + teléfono rojo. Nunca las tres páginas.
`startActivity(with:)` es lo que pone la sesión en marcha (doc Apple).
`beginCollection` solo arma el builder. Un `false` ahí hacía `session.end()`
+ `resetToIdle()`: la muñeca volvía a idle sin `today` → esa copy. **Borrado.**
La sesión vive tras Health Access. El HUD no se tira a idle. WC se activa en
`applicationDidFinishLaunching` para que `liveStart` no llegue a un cable
muerto. No se tocó el copy. No se reintenta `startWatchApp`. GPS=map HOLDS.

**Dueño:** `LiveWorkoutSession`. El espejo no crea sesión.

**105 CORTADA.** `datos | VIVO | controles`.

## Cerrado en código (esta PR · el por qué en DECISIONS)

**Borrado:** el segundo primary · matar la sesión si `beginCollection` falla ·
`abandon()` · CONECTANDO · `hasRecordedWork` · capa de km · `tickTimer` ·
cinta de la muñeca · degradado · `TabView` sobre el paginador · velos.
**Arreglado:** recap = telemetría · `finish()` escribe la pierna abierta.
**Descartado:** `WatchRunLegDriver` · no rellenar descanso con `rest_s`.

## Pendiente de esta rama

1. **BLOQUEANTE: el km no se canta.** Decide Alex. No se inventa voz.
2. Reloj en solitario: `LiveFlowView` — dos looks.
3. Ruta en `HKWorkoutRouteBuilder`. Crono a 6 glifos / 99 min. «Sin señal»
   en cinta sin emparejar. Span del historial.

**SIN COMPILAR AQUÍ:** no hay Xcode. Build 21. Este turno no se compiló.

No tocar: GPS/authority, 174, 175, plan del 67, `DEVELOPMENT_TEAM`
(`S6W4459DDG`). Neon no. Analítica 178 no. **105 cortada.**
