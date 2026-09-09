# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-09** (FH-101 build 85 — watch Terminar + end sync)

## Ahora

**FH-101 — Watch Terminar + bilateral end sync (PR pendiente, build 85).**
Terminar en muñeca siempre al alcance (controls page). `live_ended_v1` durable
watch→phone (`transferUserInfo`). `PhoneLiveSession.applyWristEnded` unifica HK+WC.
Reconcile reopen cuando cover cerrado y muñeca ya terminó. Diseño:
`docs/pr/fh101-watch-terminar-end-sync.md`.

**FH-100 — watch zombie after Terminar (main, build 84).**
Segundo Empezar sin force-quit: `reconcileIdleBeforeLaunch`, `forceIdle` idempotente,
`enterIdle` en phone, mirror zombie no ignora `startWatchApp`. Diseño:
`docs/pr/fh100-watch-idle-cleanup.md`.

**FH-99 — live session ownership rewrite (main, build 83).**
Verdad reloj (`wristMirrorLive`), create≠start (`LiveLaunchPolicy`), tramo hecho
con auto-pausa, X→Terminar/soft-leave, resume banner→recoverOnLaunch. Diseño:
`docs/pr/fh99-live-ownership.md`.

**FH-97 — Watch PRIMARY rewrite (main, build 80–82).**
`WatchPrimaryOwner` + `PhoneLiveSession`. Teardown deadline 5s. Rebase FH-95/96.

**FH-96/95 — Start UX (main).** Un PRIMARY, Devices → Brief → un Empezar.

**Xcode Cloud / TestFlight:** build **85** en rama FH-101. ASC Manage Version OFF.

## Pendiente decisión Alex

Ninguno en FH-101 (copy Terminar es objetivo; confirmación mínima ya en reloj).
