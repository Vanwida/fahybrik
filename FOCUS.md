# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-10** (FH-108 build 94 — phone pedometer wiring)

## Ahora

**FH-108 — Phone-only outdoor pedometer (PR pendiente, build 94).**
DA P0 post-FH-107: `RunPhoneSensorPlan.pedometer` + `plan.altimeter` aplicados en `ActiveWorkoutView`; `CMPedometer` → `sampleRunDistance(.healthkit)`. Guard `tramoIsRun` (EMOM run minutes).
Diseño: `docs/pr/fh108-phone-pedometer.md`. Pendiente DA antes de merge.

**FH-107 — Live session structure (main, build 93).** Diseño: `docs/pr/fh107-live-structure.md`.

**Xcode Cloud / TestFlight:** Objetivo TF **94** tras Archive verde. ASC Manage Version OFF.

## Pendiente decisión Alex

Confirmar TF build **94** cuando ASC Archive pase (owner smoke FH-108).
