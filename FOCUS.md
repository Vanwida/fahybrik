# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-21** (FH-30 P0 del code gate cerrado — PR #189)

## Ahora

**FH-30 — Cara rodaje muñeca (PR #189, pendiente de review).** Lámina redo + el P0
que devolvió el code gate:
- Canvas adaptativo todas las tallas Watch incl. SE (ahora también `onChange` del tamaño, no sólo `onAppear`)
- Pager sticky (page @State en RootView, no en LiveFlowView)
- **Misma cara de verdad**: un solo decisor en Core (`RodajeLamina`), dos proyecciones
  (motor / cable). La SERIE de calle en espejo ya es la lámina, no `GuionSeries`;
  la puerta corta por formato (EMOM y ruta fuera), no por `rondaTotal`
- `.newLap` command: motor + controles para cortes libres del atleta (NUNCA bound a advance)
- Twin `watch-rodaje` rehecho: es la lámina (3 estados) y pasa a `espejo` con fuentes
- Decisión en `docs/DECISIONS.md` (2026-09-21 · FH-30)

## Pendiente decisión Alex

Smoke TF build **98** (rodaje muñeca + FH-111: ✕ → banner → reabrir, muñeca sigue espejo).
Review del PR #189 de FH-30.

## Sabido y no hecho (FH-30)

- `PhoneLiveSession.applyCommand` no relaya `.newLap` al motor (latente: hoy el
  botón sólo existe en el pager en solitario, que llama al motor local).
- `GuionSeries` queda sin vía viva en el espejo — retirada pendiente, no descuido.
