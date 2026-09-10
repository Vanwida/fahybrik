# FH-107 — Live session structure (Round → Series → Station)

## Problem (owner smoke, build 91)

1. **Dual rests missing in create** — only «Descanso entre rondas»; live applied block rest at wrong granularity (between series/stations).
2. **Station ≠ rest ≠ series** — «Estación hecha» advanced cursor and rest without clear separation; contradictory chrome («2 de 15» + estación hecha + «listo — rema»).
3. **No orientation** — athlete could not read round / series / station during work or rest.
4. **Metrics vs devices** — recipe device pills stacked on erg stats (S/MIN · vatios · pulso).
5. **Watch** — dropped to Readiness during live; treadmill join / pause broke mirror.
6. **Live X** — leave/re-enter too heavy; dismiss must not destroy session.

## Hierarchy (first principles)

```
Block (format: Rondas | For Time route | …)
└── Outer round (prescription.rounds)          ← HUD «Ronda X/Y»
    └── Station / movement (sets[] cycle)      ← HUD «Estación X/N» when N>1
        └── Work window (LiveTramo)            ← what device measures NOW
```

**Rest kinds (never conflated):**

| Kind | Prescription field | When it fires |
|------|-------------------|---------------|
| **Series rest** | `PrescriptionSet.restS` | After closing a station **within** the same outer round (multi-movement). |
| **Round rest** | `Prescription.restS` | After closing the **last** station of an outer round. |
| **Route rest** | `PrescriptionSet.restS` only | Chipper / one-pass For Time: between stations; block `restS` never auto-applied mid-route. |
| **Homogeneous rounds** | `Prescription.restS` (fallback set) | Single movement × N rounds: rest after each round tap. |

**Estación hecha** closes the work window only. Rest is a **separate phase** (`fixedRestRemaining > 0` → `RestSurface`). Primary button during rest = **SALTAR DESCANSO** (`skipFixedRest`), never another strike.

## Create UI (funcional · Rondas)

- **Descanso entre series** → `seriesRestSeconds` → written to **each** movement's `PrescriptionSet.restS`.
- **Descanso entre rondas** → `restSeconds` → block `Prescription.restS`.
- Both persisted via `FreeFunctionalPrefs` (per format).

## Live orientation chrome

`WorkoutSession.liveOrientation` exposes:

- `roundLine` — e.g. `Ronda 2/5`
- `stationLine` — e.g. `Estación 2/4` (nil when homogeneous)
- `restKind` — `.none | .betweenSeries | .betweenRounds`

Shown on `LiveOrientationStrip` (shell apoyos, Rounds HUD, outdoor/treadmill apoyos) — always consistent with engine cursor.

## Metrics layout

- **One erg stats row** (`ErgLiveStrip`) in the subject band.
- **Device connection** only in top strip (`BotonConectividad` → sheet) — removed duplicate `LiveRecipeDeviceBar` + redundant `ConnectionStrip` from apoyos when it overlapped stats.

## Live UI unification (FH-107 build 93 — one Run tree)

- **`RunLiveShellView`**: único entry en `ActiveWorkoutView.superficieMontada`. Un `MarcoVivo` + `CromoVivoEntreno` para run, erg, EMOM, fuerza, descanso, conditioning.
- **`SuperficieViva.de`**: decide **solo la banda sujeto**. **EMOM gana sobre ergo y sobre run tramo** — ski↔run↔rest no cambian de shell; solo métricas.
- **Run outdoor/cinta**: bandas `RunOutdoorBands` / `TreadmillHUDView(embebidoEnShell:)` inyectadas dentro del mismo shell — no `OutdoorRunHUDView` ni árbol treadmill paralelo.
- **Subject by modality**: EMOM → `EmomVivoSubjectBand` (+ `ErgHUDContent` o bandas run cuando tramoIsErg/tramoIsRun); erg → `ErgHUDContent`; fuerza → `FuerzaVivoShellHosts`; rest → `RestSubjectBand`; run → bandas outdoor/cinta.
- **Previews/tests**: `OutdoorRunHUDView`, `EmomVivoView`, `FuerzaVivoView` son wrappers finos sobre `RunLiveShellView` — no montan MarcoVivo propio.
- **Sensor authority**: `RunPhoneSensorPlan` uses `hasMirroredHKSession` (HK channel bound), not `wristMirrorLive` UI flag.

## Watch — Apple-first rewrite (FH-107 build 93)

**Owner mandate:** stop patching invented mirror/connect layers; one Apple workout path.

### Deleted / abandoned patterns

| Removed behavior | Why |
|------------------|-----|
| `PhoneLiveSession.tickFrame` → `releaseChannel()` on `mirrorIsStale` | Invented watchdog tore down `HKWorkoutSession` mid-workout when HR/frame paused briefly (treadmill join, BLE, phone background). |
| `WatchPrimaryLifecycle` blocking mirror when `WatchWorkoutCoordinator.phase != .idle` | Two competing session owners — `startWatchApp` silently failed if wrist had standalone active. |
| Duplicate `WatchRunLocationGate` on coordinator | GPS permission/accuracy belongs on the one PRIMARY owner (`WatchPrimaryOwner.locationGate`); distance comes from `HKLiveWorkoutBuilder`, not custom integration. |
| `forceIdle()` on mirror HK `didFailWithError` | Dropped athlete to Readiness; phone session still live. |

**Not removed (legitimate Apple usage):**

- `WatchRunLegDriver` — DISTANCE-leg auto-close on HK distance deltas (no 0.5 s timer). Pure structured RUN → `AppleWorkoutMapper` / `AppleWatchWorkoutScheduler` (WorkoutKit).
- `WatchRunLocationGate` — `CLLocationManager` permission only; enables Apple distance collection for outdoor run activities.
- `RunDistanceAuthority` — rejects `.gps` as official meters; HealthKit only.
- `PolylineCodec` — **decode/display only** for legacy `workout_routes` rows; live capture SoT → `HKWorkoutRouteBuilder` (next slice).

### Inventiveness audit — deleted / thinned (build 93)

| Killed or thinned | Replaced by |
|-------------------|-------------|
| `RunPaceSmoother.swift` | `WorkoutSession.liveCoveredPaceSecPerKm` (HK / pedometer distance ÷ elapsed) |
| `RunAutoPause.swift` + outdoor auto-pause UI | Manual pause + HK session pause on wrist; no homemade speed hysteresis on phone GPS |
| `GPSSignalQuality.isFixUsable` gating fixes | Display badge only; all valid CLLocation fixes feed map coords |
| `WatchRunLegDriver` 0.5 s timer | `noteHealthKitDistanceSample()` on builder distance deltas |
| `PhoneWorkoutRun.hasPrimarySession` / `startMirroring()` stub | Phone never mints PRIMARY; mirror only via `PhoneLiveSession` |
| `PostWorkoutSummary.closedTraces` `.gps` distance branch | Always adopt `HealthKitDistanceProbe` when available |
| Dual `CountdownFormat` implementations | One `format(_:style:)` owner (standalone CEIL vs mirrored ROUND) |
| Outdoor pace fork (smoother vs covered) | Single pace derivation in `WorkoutSession+Accessors` |

**Kept direction (Owner):**

- `WatchPrimaryOwner` — one `HKWorkoutSession` + `HKLiveWorkoutBuilder` PRIMARY
- `AppleWorkoutMapper` / `AppleWatchWorkoutScheduler` — structured RUN on native Entrenamiento app
- `CLLocation` — map coordinates only, not meter SoT

**Deferred (documented, not blocking TF 93):**

- `MirrorStateFrame` / `PhoneMirrorFrameBuilder` full thin → builder stats + minimal commands
- `HKWorkoutRouteBuilder` replaces `capturedRoutePolyline` as route SoT in execution POST
- Pure RUN wrist sessions without phone → WorkoutKit start instead of dual `WorkoutSession` + coordinator (hybrid/fuerza still need coach engine)

### Apple APIs (single PRIMARY path)

| Concern | API |
|---------|-----|
| Phone launches wrist | `HKHealthStore.startWatchApp(with:)` |
| Wrist creates PRIMARY | `HKWorkoutSession.init(healthStore:configuration:)` + `startMirroringToCompanionDevice()` |
| Phone receives mirror | `HKHealthStore.workoutSessionMirroringStartHandler` → adopt session |
| Live metrics | `HKLiveWorkoutBuilder` + `HKLiveWorkoutDataSource` (HR, kcal, `distanceWalkingRunning`) |
| Coach script phone → wrist | `HKWorkoutSession.sendToRemoteWorkoutSession` (`MirrorWire` frames) |
| Wrist → phone durable end | `WCSession.transferUserInfo` (`WatchLiveEnded`, FH-101) |
| Crash recovery | `HKHealthStore.recoverActiveWorkoutSession` + `WKApplicationDelegate.handleActiveWorkoutRecovery` |
| Run piece activity switch | `HKWorkoutSession.beginNewActivity` / `endCurrentActivity` |

### Structural fixes

1. **Mirror preempts standalone** — `WatchWorkoutCoordinator.yieldForPhoneMirror()` clears wrist coach engine when phone is PRIMARY; mirror start never blocked.
2. **HK channel survives blips** — stale signal → UI `wristMirrorLive = false` + sync ping; channel stays bound until explicit end or post-workout idle.
3. **Mid-workout HK end** — `handleMirrorSessionEnded()` relaunches `startWatchApp` without clearing `primaryRequested`.
4. **Mirror HUD stays mounted** — HK `ended`/`stopped`/`didFailWithError` on mirror/orphan → connection banner + `sync`, not `forceIdle` → Readiness.
5. **Pause/resume** — frame phase syncs `hkPaused`; wrist controls idempotent (`resumeIfPaused`).

FH-100/101 preserved: teardown deadline, athlete Terminar ownership, bilateral end sync.

## Live X (FH-99 extension)

- Top **X** always **soft leave** (`leaveToResumeLater` + disk snapshot).
- Terminar / Guardar / Descartar remain on **pause sheet** only.
- Re-open cover or resume banner continues same session.

## Out of scope

Goals catalog, FH-30 laminas polish, scrapers.

## Smoke (owner)

- Create rondas with series rest ≠ round rest; live honors both.
- Estación hecha ≠ auto rest con valores distintos; next station clear.
- Always see round/series/station lines.
- Metrics readable with multiple BLE devices.
- Watch stays live through cinta join + pause.
- X out, reopen, continue; save then continue.
