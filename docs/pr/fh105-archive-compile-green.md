# FH-105 — Archive exit 65: Swift 6 compile errors (build 91)

## Symptom

Xcode Cloud Archive **build 90** (merge PR #178 / FH-104) failed with exit **65**. TestFlight post-action skipped; Internal highest **85**.

FH-104 fixed MainActor isolation on `HealthKitHistoryImporter`, `semanaVisible` cross-file access, `hasNextWeek ?? false`, and `ObjectiveCatalog` family binding. Two Swift 6 errors remained (or were introduced by the FH-104 default-arg change).

## Errors fixed (exhaustive for this PR)

| # | Diagnostic (ASC / `xcodebuild archive`) | Root cause | Fix |
|---|----------------------------------------|------------|-----|
| 1 | `RaceDetailView.swift:335` — Initializer for conditional binding must have Optional type, not 'String' | `GoalGapFormat.raceClock(_:)` returns non-optional `String`. `nonHyroxTargetCard` used `if let clock = GoalGapFormat.raceClock(goal)` after optional-binding `goalTimeSeconds` — same class of bug as FH-104 #6 on `ObjectiveCatalog`. | Drop the optional bind; render `Text(GoalGapFormat.raceClock(goal))` inside `if let goal = race.goalTimeSeconds, goal > 0`. |
| 2 | `HealthKitHistoryImport.swift:189` — Covariant 'Self' type cannot be referenced from a default argument expression | FH-104 marked `defaultPauseBetweenWindows` `nonisolated` but left `pauseBetweenWindows: Duration = Self.defaultPauseBetweenWindows` in `init`. Swift 6 forbids `Self` in default parameter expressions regardless of actor isolation. | Default to the concrete literal `.milliseconds(300)` (same value as `defaultPauseBetweenWindows`). Static let kept for documentation and explicit call sites. |

**No other compile fixes in this PR.** Every pattern below was swept; zero additional actionable hits.

---

## Full error sweep (712 Swift files under `ios/`)

Method: automated regex over the full `ios/` tree + manual return-type review in focus folders + FH-104 regression checklist. **Not run:** `xcodebuild archive` (no Xcode on Linux agent). Archive green is **not claimed** here — owner confirms TF **91**.

### 1. Non-optional `if let` (formatters / helpers returning `String`)

**Patterns searched:** `if let … = GoalGapFormat.raceClock(`, `signedDuration(`, `precisionPercent(`, `ReadinessDetailSheet.relativeDay(`, and manual review of all `if let` in `Carreras/`, `HealthKit/`, `Plan/`.

| Result | Detail |
|--------|--------|
| **1 fix** | `RaceDetailView.swift:335` (this PR) |
| **0 other hits** | All other `GoalGapFormat.raceClock` uses wrap `Int?` via `.map` first → `String?` (`RaceDetailView:226,449`, `DoblesRaceGapView:131`, `GoalGapBoard.durationText`, `PredichoVsRealView.durationText`) |
| **Verified OK** | `MarkFormat.relative` / `paceLine` → `String?`; `DoblesLiveFormat.rpe` → `String?`; `DetalleDeCarrera` `Self.fuente/banda/nombre/cobertura` → `String?`; `ReadinessDetailSheet.deltaChip` → `String?`; `ObjectiveCatalog` → `familyRaw` + `ObjectiveFamily(rawValue:)` (FH-104) |

### 2. `Self` in function/init parameter default expressions

**Patterns searched:** multiline `init(` / `func(` blocks containing `= Self.` across all 712 files.

| Result | Detail |
|--------|--------|
| **1 fix** | `HealthKitHistoryImport.swift:189` (this PR) |
| **0 other hits** | `@State private var x = Self.y` in views (e.g. `YouTubeEmbedView:391`) is property initialization, not a parameter default — valid |
| **Verified OK** | `HealthKitHistoryWindowReader.init` default closure captures `HealthKitSyncService.shared` — class is not `@MainActor`; OK |

### 3. Actor isolation (`@MainActor` statics / default args / cross-context calls)

**Scope:** `HealthKit/`, all `@MainActor` types, `HealthKitHistoryImporter.shared` call sites.

| Check | Status |
|-------|--------|
| `nonisolated static` config on `HealthKitHistoryImporter` (`floorDays`, `windowDays`, `defaultPauseBetweenWindows`) | FH-104, unchanged |
| `nonisolated static` helpers (`yearLabel`, `noonBoundary`, `message(for:)`) | FH-104, unchanged |
| `@MainActor static func resumeForCurrentAthlete()` | FH-104, unchanged |
| `HealthKitSyncService` → `Task { @MainActor in HealthKitHistoryImporter.resumeForCurrentAthlete() }` | OK |
| `AuthState` / `ProfileView` / `DeviceConnectionsView` → `shared` / `rebind` from SwiftUI `@MainActor` | OK |
| `@MainActor class` init defaults: `HealthKitHistoryWindowReader.shared`, `AuthState.persistedAthleteId()`, `.standard` — none are MainActor-isolated | OK |

### 4. Access control across files (`private` vs extension in another file)

**Scope:** `Plan/` (FH-102 `PlanAcciones` ↔ `PlanView`), `Carreras/ObjectiveCatalog`, multi-file `WorkoutSession+*`.

| Check | Status |
|-------|--------|
| `semanaVisible` in `PlanView.swift` | **internal** with cross-file comment; `PlanAcciones.swift:123` legal (FH-104) |
| `puedeAvanzarSemana`, `peekBloqueadoPorHorizonte`, `diaMostrado`, etc. | remain `private` in `PlanView.swift` only — no cross-file reads |
| `ObjectiveCatalog.objectiveFamily` on `RaceCalendarEvent` | single-file extension; FH-104 `familyRaw` bind |
| **0** cross-file reads of `private` members detected |

### 5. `Bool ??` on non-optional `Bool`

**Patterns searched:** `hasNextWeek ??`, `peekBlockedByHorizon ??`, `vis.hasNextWeek ??` across `ios/`.

| Location | Status |
|----------|--------|
| `PlanView.swift:349` | `return vis.hasNextWeek` — direct, no `??` (FH-104) |
| `PlanHoyModel.swift:192-193` | `resp.week.hasNextWeek ?? false` — wire field is `Bool?` in `PlanService.swift:111` — correct |
| `PlanView.swift:353` | `semanaVisible?.peekBlockedByHorizon ?? planVisibility?.peekBlockedByHorizon ?? false` — optional chaining on container, not `Bool ??` on non-optional |
| **0** broken `Bool ?? false` on `SemanaDelPlan.hasNextWeek: Bool` |

### 6. watchOS → iOS-only symbols

**Scope:** `FAHYBRIKWatch/`, `FAHYBRIKCore/WorkoutSession+*`, FH-103 regression.

| Symbol | Status |
|--------|--------|
| `ensurePhoneWorkoutRun()` | defined + called only under `#if os(iOS)` (`WorkoutSession+Lifecycle.swift`, `WorkoutSession+RunEnvironment.swift`) |
| `PhoneWorkoutRun` in `WorkoutSession+Clock.swift` | `#if os(iOS)` block |
| `FAHYBRIKWatch/` | no `UIKit`, no `PhoneWorkoutRun`, no `ensurePhoneWorkoutRun` imports |
| Watch haptics | local shim `WatchHaptics.swift` |

### 7. FH-104 regression checklist (`docs/pr/fh104-archive-swift6-green.md`)

| FH-104 # | Issue | Status in build 91 branch |
|----------|-------|---------------------------|
| 1 | MainActor default arg on `defaultPauseBetweenWindows` | Superseded by literal default (FH-105 #2) |
| 2 | `shared` / `resumeForCurrentAthlete` isolation | Present |
| 3 | `nonisolated` helpers | Present |
| 4 | `semanaVisible` private cross-file | Fixed → internal |
| 5 | `hasNextWeek ?? false` on non-optional | Fixed |
| 6 | `if let family` / `ObjectiveFamily` collision | Fixed → `familyRaw` |

### Focus-folder file counts (manual spot-check after automation)

| Folder | `.swift` files | Extra review |
|--------|----------------|--------------|
| `FAHYBRIK/Carreras/` | 28 | all `if let` + `GoalGapFormat` |
| `FAHYBRIK/HealthKit/` | 7 | importer + window reader inits |
| `FAHYBRIK/Plan/` | 24 | visibility + Bool?? |
| `FAHYBRIKCore/` | 89 | watch-shared workout session guards |
| `FAHYBRIKWatch/` | 31 | iOS symbol isolation |

---

## Preserved contracts

- **FH-104** — HealthKit history import actor isolation, `nonisolated` static config, `@MainActor resumeForCurrentAthlete`.
- **FH-103** — `#if os(iOS)` around `ensurePhoneWorkoutRun()`.
- **FH-102** — mid-run env switch; `PlanAcciones.diasDestino` + internal `semanaVisible`.
- **FH-27** — week visibility horizon.
- **FH-77** — goals catalog / custom event / FijarObjetivo.
- **FH-99–101** — live ownership, idle cleanup, Terminar sync.

## Build

`CURRENT_PROJECT_VERSION` → **91** in `ios/project.yml`. Xcode Cloud `ci_pre_xcodebuild.sh` stamps app + watch + widgets before Archive.

## Verification (agent VM — no Xcode)

1. Python sweep: **712** Swift files — **0** remaining `Self.` param defaults; **0** direct `if let … raceClock(`.
2. FH-104 six-item checklist: all fixes still present in source.
3. `nonHyroxTargetCard` UX unchanged (clock vs “Sin tiempo objetivo”).
4. Import pause duration still 300 ms (`defaultPauseBetweenWindows` static + init literal).
5. **Not run:** `xcodebuild archive`. **Owner only Done when TF shows 91.**
