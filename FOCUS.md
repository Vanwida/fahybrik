# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-11** (FH-111 DA P0 dismiss fix)

## Ahora

**FH-111 — Live ✕ minimize (PR #187).** P0: `dismiss()` ya no borra `parkedCover` tras minimize (AppShell `onClose`); `dismissFully()` en finish/discard/conflict. Reabrir = mismo `WorkoutSession` ACTIVE. «Guardar para luego» (Card 142) en hoja Salir. Banner distingue ACTIVE vs pausado. Tests: `FH111LiveMinimizeTests` (+ dismiss path).

**FH-30 — Cara rodaje muñeca (build 97).** Cromo lámina Datos←Vivo→Controles. Smoke TF pendiente Alex.

**FH-110 — Archive compile fix (main).** Mergeado.

## Pendiente decisión Alex

Smoke TF build **97** (rodaje muñeca). Smoke FH-111 tras merge (✕ → banner → reabrir, muñeca sigue espejo).
