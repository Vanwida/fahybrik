# FOCUS — FAHYBRID

Estado para agentes. Tope: 80 líneas. Diario viejo: `docs/archivo/FOCUS-2026-08-13.md`.
Alex no lee este fichero. El mapa que abre él: `docs/tablero.html`.
Última actualización: **2026-09-09** (FH-99 build 83 — live ownership rewrite)

## Ahora

**FH-99 — live session ownership rewrite (PR pendiente, build 83).**
Verdad reloj (`wristMirrorLive`), create≠start (`LiveLaunchPolicy`), tramo hecho
con auto-pausa, X→Terminar/soft-leave, resume banner→recoverOnLaunch, programar día
en builder libre. Diseño: `docs/pr/fh99-live-ownership.md`.

**FH-97 — Watch PRIMARY rewrite (main, build 80–82).**
Delete-first: `MirrorSessionController*` → `WatchPrimaryOwner`; `PhoneMirrorService` →
`PhoneLiveSession` + `PhoneMirrorFrameBuilder`. Teardown deadline 5s nunca se cancela
al guardar — GUARDANDO no puede quedarse pegado. Rebase sobre FH-95/96 Start UX.

**FH-96 — one PRIMARY per intent (main, build 79).**
Prep reloj = UI-only (`noteWatchPrepIntent`); único `begin`/`startWatchApp` en
`PreWorkoutReleaseLive.release`. Latch idempotente. Tests: `PhoneMirrorDoubleBeginTests`.

**FH-95 — Devices hub + un solo Empezar (main, build 78).**
Brief → `PreWorkoutDevicesHubView` → brief `readyToStart` (único ▶ EMPEZAR →
`PreWorkoutReleaseLive.release` → live). Borrados: `SessionStartGate`, erg/run pre-flows.

**FH-94 — superseded by FH-95** (build 77).

**FH-88 — Perfil compacto (main, build 75).** Archive build 74 falló: `profileDoorSection`
capturaba `@ViewBuilder destination` no-escaping dentro de `NavigationLink` → fix:
parámetro `destination: Destination` (View value). Build **75** en main previo a FH-94.
Build 73/74 previos: private/fileprivate (#162 ProfileShared) + escaping (#163).

**FH-86 — COROS «Sincronizar ahora» (main, build 73, #160).**
Fix silencio iOS: alerta en sync manual y pull con imports/errores; API
`activities_found` + `skip_reason`.

**FH-93 — Start→Watch→Terminar estable (rama `cursor/fh93-start-watch-stable-555a`, build 72).**
Un solo EMPEZAR: builder = Continuar; gate = única puerta ▶ EMPEZAR (sin auto-release).
Mirror/HK solo en `releaseLive()`, Cancel limpia mirror. Watch: timeout 8s en `.ending`.
Borrar libre: Plan + FreeInicio (context) + Historial (`origin` en API). Pendiente: smoke Alex.

**Pack runtime phone↔Watch — build 66 (#155).** Reconcile, Terminar bilateral, preview gate, resume banner, launch conflict.

**FH-54 — Guardar entreno libre sin arrancar (PR `cursor/fh-54-free-plan-save-781c`).**
`POST /api/athlete/workouts/free/plan` = template + segments + assignment
scheduled, sin `workout_executions`. iOS: **Guardar** junto a Empezar en los
tres builders; editar/borrar/lanzar desde Plan (Libre). Build **66** (pack runtime).

**Xcode Cloud Archive (build 20 → 70):** `PlanAcciones`/`PlanView` compile fixes
(`freeEditAssignmentId` internal; `accionDelDia` reusa `abrir`). Build **70**.
`ci_pre_xcodebuild.sh` fuerza `CURRENT_PROJECT_VERSION` del repo en archive;
Manage Version ON en ASC sigue pisando en export → Lingxi: toggle OFF (checklist §4).
Pendiente: Rebuild Default workflow → TestFlight Internal.
