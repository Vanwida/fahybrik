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
| 1 | **Global shell = Run chrome tree only**; Ski/Row/all others mount same shell; metrics differ inside; no overlapping pills | **FAIL** | See §1 |
| 2 | Station metrics (Run / Ski·Row / other) | **PASS** (with watch caveat) | See §2 |
| 3 | Watch: Apple HK PRIMARY, no invented GPS engine, no Readiness mid-live, stay connected | **PARTIAL PASS** | See §3 |
| 4 | Dual rests (series + rounds); station ≠ rest; X leave+resume | **PASS** | See §4 |
| 5 | Dead invent deleted (RunPaceSmoother, dual session, dense mirror, …) | **FAIL** (still present / not removed) | See §5 |

---

## §1 — Global shell = Run chrome tree only (owner correction)

**Owner rule (authoritative):** Only **Run** live UI is correct today. That shell is the **global** live chrome. Ski, Row, and **every other modality** must mount the **same Run component tree**; only the **metrics/subject band** swaps inside that shell. `HostVivo`, `ErgHUDContent`, `EmomVivoView`, `FuerzaVivoView`, `RestSurface`, format HUDs, etc. are **separate/old UIs** → **FAIL** until deleted or folded into the Run tree.

### Canonical PASS reference (Run)

Gold path: `ActiveWorkoutView.cromoDeCarrera` → `OutdoorRunHUDView` — full `MarcoVivo { cromo / contexto / sujeto / apoyos / accion }` + `Ambiente` (`OutdoorRunHUDView.swift:60–76`). Treadmill run (`TreadmillHUDView`) and undecided-env (`HostVivo` + `RunLiveHUD`) are Run-family variants owner already accepts as “Run correct today”.

```752:806:ios/FAHYBRIK/Workout/ActiveWorkoutView.swift
    private var superficieMontada: some View {
        switch SuperficieViva.de(session) {
        case .emom:      EmomVivoView(...)           // FAIL — not Run tree
        case .fuerza:    FuerzaVivoView(...)         // FAIL
        case .relay:     HostVivo(...)               // FAIL
        case .structural: HostVivo(...)              // FAIL
        case .rest:      HostVivo + RestSurface      // FAIL
        case .ergo:      HostVivo + ErgHUDContent    // FAIL — Ski/Row MUST use Run tree
        case .runStructure, .run: cromoDeCarrera     // PASS
        case .conditioning: HostVivo + format HUDs   // FAIL
        }
    }
```

### FAIL inventory — every non-Run surface still on a separate UI

| `SuperficieViva` | What mounts today | vs Run tree |
|------------------|-------------------|-------------|
| `.run` / `.runStructure` | `cromoDeCarrera` → outdoor / treadmill / `RunLiveHUD` | **PASS** |
| `.ergo` (Ski / Row / bike) | `HostVivo` + **`ErgHUDContent`** (standalone subject layout) | **FAIL** |
| `.emom` | **`EmomVivoView`** (own `MarcoVivo` entry) | **FAIL** |
| `.fuerza` | **`FuerzaVivoView`** | **FAIL** |
| `.rest` | `HostVivo` + **`RestSurface`** (blue field, own layout) | **FAIL** |
| `.conditioning` | `HostVivo` + **`RoundsLiveHUD` / `AmrapLiveHUD` / `ForTimeLiveHUD` / …** | **FAIL** |
| `.relay` | `HostVivo` + custom relay VStack | **FAIL** |
| `.structural` | `HostVivo` + structural surface | **FAIL** |

**Ski/Row explicitly FAIL:** `ErgHUDContent` is a separate full-screen erg layout (`Devices/PM5/ErgHUDContent.swift`), wired only through `HostVivo` — not through `cromoDeCarrera` / `OutdoorRunHUDView`. PM5 split · s/min · W must become the **subject** inside the Run shell, not a different view.

**Watch (same rule):** `LiveFlowView.familyView` still forks to `ErgoLiveView`, `EmomLiveView`, `FixedLiveView`, `RelojDeParedLiveView`, `SetTableLiveView`, … — all **FAIL** until they render inside the Run wrist chrome (mirror HUD is a separate phone-primary path).

### FAIL — overlapping pills (secondary, still open)

- `connectPM5CTA` in `apoyosDelHost` when PM5 disconnected (`ActiveWorkoutView.swift:883–884`) — stacks on stats in landscape.
- `ConnectionStrip` / `LiveRecipeDeviceBar` live on in `LiveConectividadSheet`.

**Implementer must:** one entry point = Run chrome (`cromoDeCarrera` / `OutdoorRunHUDView` pattern) for **all** modalities; swap metric readers only; delete or stop routing to `HostVivo`/`ErgHUDContent`/format vivo views as top-level surfaces; HYROX station transitions must not swap chrome.

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

1. **Every non-Run modality still on a separate live UI** — Ski/Row (`ErgHUDContent`), EMOM, fuerza, rest, conditioning, relay, structural all bypass the Run chrome tree (`superficieMontada` switch above). **Hard FAIL per owner.**
2. **`connectPM5CTA` still in apoyos** — overlaps metrics in landscape.
3. **`LiveOrientationStrip` missing** on surfaces that will move into Run shell (and on Run treadmill path).
4. **`RunPaceSmoother` still on phone outdoor** — document or remove.

## Non-blocking / verify on device

- Watch treadmill join + pause + mirror reconnect (FH-107 manual smoke).
- TF build 93 archive (owner).

---

## References

- Implementer spec: `docs/pr/fh107-live-structure.md`
- Routing: `ios/FAHYBRIK/Workout/Vivo/SuperficieViva.swift`, `ActiveWorkoutView.superficieMontada`
- Apple HK mirror API: `HKWorkoutSession.startMirroringToCompanionDevice` (HealthKit, via apple-docs MCP)
