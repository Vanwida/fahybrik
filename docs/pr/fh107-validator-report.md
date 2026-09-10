# FH-107 Validator Report — build 93 smoke

**Auditor:** Cloud Agent (validator-only)  
**Branch reviewed:** `cursor/fh107-live-structure-3351` (PR #181)  
**Base:** `main` @ merge-base with FH-106  
**Build target:** `CURRENT_PROJECT_VERSION: 93` (`ios/project.yml`)  
**Verdict:** **FAIL — no merge until blockers below are closed**

Owner mandate (build 93) checked against code + tests on disk. This is a harsh read: several items are improved but not done.

---

## Checklist

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | One global live UI; Run chrome reused for Ski/Row; no overlapping pills | **FAIL** | See §1 |
| 2 | Station metrics (Run / Ski·Row / other) | **PASS** (with watch caveat) | See §2 |
| 3 | Watch: Apple HK PRIMARY, no invented GPS engine, no Readiness mid-live, stay connected | **PARTIAL PASS** | See §3 |
| 4 | Dual rests (series + rounds); station ≠ rest; X leave+resume | **PASS** | See §4 |
| 5 | Dead invent deleted (RunPaceSmoother, dual session, dense mirror, …) | **FAIL** (still present / not removed) | See §5 |

---

## §1 — One global live UI

### What improved (not enough for PASS)

- `SuperficieViva` + `PresentadorVivo` centralise routing; old `phaseRail` / `ExpertActionButton` fork is gone from `ActiveWorkoutView` (comments only — no live references).
- Device recipe pills removed from `apoyosDelHost` apoyos band (FH-107 comment at `ActiveWorkoutView.swift:867`).
- Ergo work uses `ErgHUDContent` inside `HostVivo` → `MarcoVivo` (`SuperficieViva.ergo`).

### FAIL — forks remain (not “one global live UI”)

| Surface | Chrome | Shared with Run? |
|---------|--------|----------------|
| Run outdoor | `OutdoorRunHUDView` → `MarcoVivo` | Own full-screen chrome |
| Run treadmill | `TreadmillHUDView` | **No `MarcoVivo`** — bespoke VStack/header |
| Run undecided env | `HostVivo` + `RunLiveHUD` | Partial |
| Ski/Row/erg | `HostVivo` + `ErgHUDContent` | Same **MarcoVivo shell**, different **subject** (correct for PM5) |
| EMOM | `EmomVivoView` (own `MarcoVivo`) | Separate entry |
| Strength | `FuerzaVivoView` (own `MarcoVivo`) | Separate entry |

Owner wording (“Run live chrome reused for Ski/Row **stations**”) is **not** met if interpreted as one chrome tree. If the intent was “one MarcoVivo family, no stacked covers”, treadmill is still out of family and run/erg/emom/fuerza are four presenters.

### FAIL — overlapping pills not fully gone

- `connectPM5CTA` still renders in `apoyosDelHost` when PM5 disconnected (`ActiveWorkoutView.swift:883–884`) — stacks on erg stats in landscape (exact bug owner cited in `docs/pr/fh107-live-structure.md` §Metrics layout).
- `ConnectionStrip` / `LiveRecipeDeviceBar` still exist; moved to `LiveConectividadSheet`, not deleted.

**Implementer must:** unify treadmill into `MarcoVivo`/`HostVivo` OR document explicit exception; remove bottom PM5 CTA when top-strip Conectividad is visible; prove one presenter path for station transitions (HYROX ski → run → ski) without chrome swap.

---

## §2 — Station metrics

| Modality | Required | Code | Verdict |
|----------|----------|------|---------|
| Run | m + pace + cinta speed | `RunLiveHUD`, `TreadmillHUDView` (km/h real belt), `OutdoorRunHUDModel` | **PASS** |
| Ski/Row | PM5 split / s·min⁻¹ / W | `ErgHUDContent` work rail (`ErgHUDContent.swift:451–456`) | **PASS** (phone) |
| Other | No fake meters | `StationSubject` — clock + prescription, no m (`WorkoutFormatHUDs.swift:387–423`) | **PASS** |

**Watch caveat:** standalone wrist erg (`ErgoLiveView` in `LiveFlowView.swift:189`) uses `GuionErgo.estadoSolitario` — no PM5 on wrist by design. Acceptable when phone is PRIMARY + mirror; owner smoke “metrics readable with BLE” is phone-side.

---

## §3 — Watch / HealthKit

### PASS — Apple PRIMARY path

- Wrist creates `HKWorkoutSession` + `startMirroringToCompanionDevice()` (`WatchPrimaryOwner.swift:205–208`).
- Phone adopts via `workoutSessionMirroringStartHandler` (`PhoneLiveSession.prepare()`).
- Apple Doc MCP confirms `HKWorkoutSession.startMirroringToCompanionDevice(completion:)` as the companion-mirror API (watchOS 2.0+).

### PASS — no custom GPS meter engine on watch

- `WatchRunLocationGate` — permission/accuracy only; comment: “Does not count meters” (`WatchRunLocationGate.swift:3–6`).
- `WatchRunLegDriver` reads `session.liveRunDistanceMeters` from HK builder aggregate (`WatchRunLegDriver.swift:64`) — auto-close only, same role as belt odometer on phone. Matches implementer doc “legitimate Apple usage”.

### PASS — Readiness not shown mid mirror live

- `RootView`: `primary.showsMirrorHUD` → `MirrorHUDView`, not `PreWorkoutFlow` / `ReadinessGlanceView` (`RootView.swift:66–67`).
- Mirror HK `ended`/`didFailWithError`: sets `isConnectionLost`, sends `sync`, **does not** `forceIdle()` (`WatchPrimaryOwner.swift:655–675`).

### PARTIAL — stay live / channel survival

- **PASS:** `PhoneLiveSession.tickFrame` no longer references `mirrorIsStale` for teardown (`WristMirrorTruthTests.testFh107StaleDoesNotReleaseChannelInTickFrame`).
- **PASS:** `handleMirrorSessionEnded()` relaunches watch while coaching (`PhoneLiveSession.swift:329–343`).
- **RISK:** `forceIdle()` still used for solo/orphan recovery paths (`WatchPrimaryOwner.swift:181–188, 225, 446, 661, 677`) — correct for solo, but owner smoke “cinta join + pause” needs device QA; not proven here.

---

## §4 — Dual rests, station ≠ rest, live X

### PASS — dual rests

- Engine: `fixedRestKind` `.betweenSeries` / `.betweenRounds` (`WorkoutSession+Tramo.swift:659–686`).
- Resolver after strike: `WorkoutSession+Conditioning.swift` (FH-107 comments).
- Tests: `DescansoTodosLosFormatosTests.testFH107SeriesRestEntreEstacionesRoundRestAlCerrarRonda`, `testFH107PrimaryDuranteDescansoSaltaNoMarca`.

### PASS — station ≠ rest

- `isTramoResting` drives `SuperficieViva.rest` → `RestSurface` (separate phase UI).
- Primary during rest = skip (`conditioningPrimary` test asserts no double strike).

### PASS — X soft leave

- Top X → `requestExitOrLeave` → `navigateAway` → `onLeaveAndResume` → `WorkoutContainer.navigateAway` → `leaveToResumeLater()` + disk snapshot (`ActiveWorkoutView.swift:1097–1107`, `WorkoutContainer.swift:805–813`).
- Terminar/discard stay on pause sheet (`requestExit` separate).

---

## §5 — Dead invent still present (must call out)

| Item | Status | Location |
|------|--------|----------|
| `RunPaceSmoother` | **Still in tree** | `ios/FAHYBRIK/Workout/Outdoor/RunPaceSmoother.swift`, used by `OutdoorRunHUDModel` |
| Phone GPS smoother stack | **Still in tree** | `RunLocationProvider` + `OutdoorRunHUDModel.smoother` |
| Dual session owners | **By design, not deleted** | `WorkoutSession` (coach) + `PhoneLiveSession` (HK channel) + `WatchPrimaryOwner` (wrist HK) — not duplicate classes, but three live owners |
| Dense mirror HUD | **Still in tree** | `MirrorHUDView`, `MirrorHUDTreadmill`, `MirrorHUDOverlays` (watch phone-primary UI) |
| `ConnectionStrip` / `LiveRecipeDeviceBar` | **Still in tree** | Moved to sheet, not removed |

Owner/build-93 doc explicitly allows `WatchRunLegDriver` and `WatchRunLocationGate`; it does **not** list `RunPaceSmoother` as kept. Phone outdoor still runs a custom pace smoother parallel to HK on wrist — document or delete.

---

## §6 — Additional FAIL: orientation chrome incomplete

Owner smoke: “Always see round/series/station lines.”

`LiveOrientationStrip` is wired in:

- `RoundsLiveHUD`, `RestSurface`, `ForTimeLiveHUD` / `StationSubject`

**Missing** from:

- `HostVivo` context row (`HostVivo.swift` — only tramo title + pulse chip)
- `ErgHUDContent` (uses `ForTimeContextStrip` on route stations only — no `LiveOrientationStrip` on homogeneous ski rounds)
- `EmomVivoView`, `FuerzaVivoView`
- `TreadmillHUDView`, `OutdoorRunHUDView`

`liveOrientation` returns nil unless `seg.isConditioningTimer && condCountInRemaining <= 0` — EMOM erg minutes routed to `.ergo` may show **no** round/station lines during work.

**Implementer must:** mount `LiveOrientationStrip` on every live subject band per spec (`docs/pr/fh107-live-structure.md` §Live orientation chrome), including erg + HostVivo paths.

---

## §7 — Tests / build

- iOS unit tests **not executed** in this VM (no Xcode). Logic reviewed statically.
- New tests added on branch look correct; CI on PR #181 is the gate.
- Web `pnpm test` not run (no `node_modules` in snapshot) — out of FH-107 scope.

---

## Blocking FAIL list (merge gate)

1. **Treadmill + outdoor run chrome still outside unified presenter** — not one global live UI.
2. **`connectPM5CTA` still in apoyos** — overlaps erg metrics (owner-reported layout bug).
3. **`LiveOrientationStrip` missing on erg/HostVivo/EMOM/fuerza/treadmill** — orientation smoke fails.
4. **`RunPaceSmoother` still on phone outdoor** — call out in DECISIONS or remove if wrist HK is sole distance authority for mirrored runs.

## Non-blocking / verify on device

- Watch treadmill join + pause + mirror reconnect (FH-107 manual smoke).
- TF build 93 archive (owner).

---

## References

- Implementer spec: `docs/pr/fh107-live-structure.md`
- Routing: `ios/FAHYBRIK/Workout/Vivo/SuperficieViva.swift`, `ActiveWorkoutView.superficieMontada`
- Apple HK mirror API: `HKWorkoutSession.startMirroringToCompanionDevice` (HealthKit, via apple-docs MCP)
