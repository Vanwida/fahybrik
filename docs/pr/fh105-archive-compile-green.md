# FH-105 — Archive exit 65: Swift 6 compile errors (build 91)

## Symptom

Xcode Cloud Archive **build 90** (merge PR #178 / FH-104) still failed with exit **65**. TestFlight post-action skipped; Internal highest **85**.

FH-104 fixed MainActor isolation on `HealthKitHistoryImporter`, `semanaVisible` cross-file access, `hasNextWeek ?? false`, and `ObjectiveCatalog` family binding. Two Swift 6 errors remained (or were introduced by the FH-104 default-arg change).

## Errors fixed (exhaustive for this PR)

| # | Diagnostic (ASC / `xcodebuild archive`) | Root cause | Fix |
|---|----------------------------------------|------------|-----|
| 1 | `RaceDetailView.swift:335` — Initializer for conditional binding must have Optional type, not 'String' | `GoalGapFormat.raceClock(_:)` returns non-optional `String`. `nonHyroxTargetCard` used `if let clock = GoalGapFormat.raceClock(goal)` after optional-binding `goalTimeSeconds` — same class of bug as FH-104 #6 on `ObjectiveCatalog`. | Drop the optional bind; render `Text(GoalGapFormat.raceClock(goal))` inside `if let goal = race.goalTimeSeconds, goal > 0`. |
| 2 | `HealthKitHistoryImport.swift:189` — Covariant 'Self' type cannot be referenced from a default argument expression | FH-104 marked `defaultPauseBetweenWindows` `nonisolated` but left `pauseBetweenWindows: Duration = Self.defaultPauseBetweenWindows` in `init`. Swift 6 forbids `Self` in default parameter expressions regardless of actor isolation. | Default to the concrete literal `.milliseconds(300)` (same value as `defaultPauseBetweenWindows`). Static let kept for documentation and future explicit call sites. |

## Scan — same patterns (no further fixes needed)

Grep across `ios/FAHYBRIK/`, `ios/FAHYBRIKCore/`, `ios/FAHYBRIKWatch/`:

- **`if let` + non-optional formatter:** only `RaceDetailView.swift:335`. Other `GoalGapFormat.raceClock` uses wrap optional `Int?` via `.map` first (`RaceDetailView:226`, `DoblesRaceGapView:131`, `GoalGapBoard.durationText`, etc.).
- **`Self.` in init default args:** only `HealthKitHistoryImport.swift:189`. `@State = Self.xxx` in views (e.g. `YouTubeEmbedView`) is valid — not a default-argument expression.
- **FH-104 items 3–6:** unchanged and still correct in source.

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

- Grep: no remaining `if let … = GoalGapFormat.raceClock(` without prior optional map.
- Grep: no remaining `= Self.` in function/init parameter defaults under `ios/`.
- Code review: `nonHyroxTargetCard` UX unchanged (clock vs “Sin tiempo objetivo”).
- Code review: import pause duration still 300 ms.
- **Not run here:** `xcodebuild archive` (no Xcode on Linux agent). Owner confirms Archive green + TF **91**.
