# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-08-28** (detail: columna opcional)

## Ahora

**DETAIL · PR 91** (`cursor/live-un-motor-0406`). El week lista
el día; GET `/assignments/:id/detail` era 500 vacío. No es HYROX:
los 5 del week (scheduled, sin execution) fallaban igual.
`is_approach` (0207) no corre sin execution — descartado para
ESE 500. El detail SÍ selecciona `block_coach_note` (0211);
el week no.

Lectura única: `to_jsonb(alias)->>'col'` (ausente = NULL, no
42703). Mismo camino para `is_approach` si hay execution.
`template_blocks` 42P01 → sin config de circuito, no un plan
inventado.

**NO es hecho de producto.** No se camina el sim. No merge.
Hecho de código: 488 y 485 en Preview = 200 con blocks/items.

No tocar: 105, 174, 175, HUD live, Watch, forks de formato,
`DEVELOPMENT_TEAM` (`S6W4459DDG`). Neon de producto no.
