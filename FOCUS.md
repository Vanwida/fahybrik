# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-28** (live: rest=tramo, un gesto, un dueño)

## Ahora

**LIVE · PR 91** (`cursor/live-un-motor-0406`). Debugger Series umbral
(atleta 67, asg 485, no Chipper). Tres clases, un escritor:

1. Rest es un tramo del HUD. `times: N` de solo work en una serie
   (`intervals`/`rounds`) no pega los works. Entre ellos hay rest
   (durado si `rest_s>0`; abierto si `nil`). El árbol que ya trae
   recovery no se dobla. `sets`/drills no inventan rest. Cero
   escrito = no hay.
2. Un gesto = un tramo. Se borra el salto `lastIndex+1` del
   calentamiento. LEG SWINGS no se come el 80 m.
3. Un dueño. `live_start_v1` + `phoneOwnsLive` + `startWatchApp`.
   El reloj no abre otro `WorkoutSession`. No 105.

**NO es hecho de producto.** Marc camina el debugger. No merge.

No tocar: plan del 67, 105, stream GPS (`RunDistanceAuthority` /
`sampleRunDistance` / cifra 24 m → 2,44 km), forks de formato,
inventario de bloques, `DEVELOPMENT_TEAM` (`S6W4459DDG`).
Neon de producto no.

## Cerrado en esta PR (código)

- Detail 200 (columnas opcionales).
- Sesión ready: `/me` no 500; start no espera un me roto.
