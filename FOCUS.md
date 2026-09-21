# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-21** (FH-30 lámina redo — PR pendiente)

## Ahora

**FH-30 — Cara rodaje muñeca (PR pendiente a main).** Lámina redo completa:
- Canvas adaptativo todas las tallas Watch incl. SE (GeometryReader measure-once + EnvironmentKey)
- Pager sticky (page @State en RootView, no en LiveFlowView)
- Mirror same-face: rodaje en espejo usa la misma lámina que en solitario (MirrorRodajeFace)
- `.newLap` command: motor + controles para cortes libres del atleta (NUNCA bound a advance)
- Pixel B/C/D: juicio → veredicto + etiquetaSegundo, recupera con "luego" dim
- Twin actualizado (watch-rodaje, vivo-correr)

## Pendiente decisión Alex

Smoke TF build **98** (rodaje muñeca + FH-111: ✕ → banner → reabrir, muñeca sigue espejo).
Review del PR de FH-30.
