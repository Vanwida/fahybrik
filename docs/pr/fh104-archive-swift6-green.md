# FH-104 — Archive exit 65: Swift 6 compile errors (build 90)

## Symptom

Xcode Cloud Archive **build 89** (merge PR #177 / FH-103) still failed with exit **65**. TestFlight post-action skipped; Internal highest **85**.

FH-103 fixed the watchOS `ensurePhoneWorkoutRun` symbol; the Archive log still reported additional Swift compile errors on the iOS app target.

## Errors fixed (exhaustive for this PR)

| # | Diagnostic (ASC / `xcodebuild archive`) | Root cause | Fix |
|---|----------------------------------------|------------|-----|
| 1 | Main actor-isolated static property `defaultPauseBetweenWindows` cannot be used… | `@MainActor class HealthKitHistoryImporter` made **all** static members MainActor-isolated. Default argument `pauseBetweenWindows: = HealthKitHistoryImporter.defaultPauseBetweenWindows` is evaluated in the caller's isolation domain (including `static let shared = …` init). | Mark configuration statics `nonisolated`: `defaultPauseBetweenWindows`, `floorDays`, `windowDays`. Init default uses `Self.defaultPauseBetweenWindows`. |
| 2 | Main actor-isolated static property `shared` / calls from nonisolated context | Same class isolation: `resumeForCurrentAthlete()` and lazy `shared` access must be explicitly MainActor. Call sites already wrap in `Task { @MainActor in … }` (SyncService, AuthState). | Annotate `resumeForCurrentAthlete()` `@MainActor`. Document that `shared` first touch is MainActor-only (SwiftUI / tests). |
| 3 | Main actor-isolated static method … from nonisolated context | Pure helpers `yearLabel`, `noonBoundary`, `message(for:)` were MainActor-isolated by class annotation but are called from tests and error paths without actor hop. | Mark those three `nonisolated static` — they only use `Calendar` / switch, no instance state. |
| 4 | `'semanaVisible' is inaccessible due to 'private' protection level` | FH-27 introduced `private var semanaVisible` in `PlanView.swift`. FH-102 `PlanAcciones.diasDestino` (separate file, same type extension) reads it for peek-week move targets. Swift `private` is scoped to the **declaration file**, not the whole type. | Change to internal `var semanaVisible` with comment — intentional cross-file API for `PlanAcciones`. |
| 5 | Cannot use optional chaining on non-optional `Bool` / `Binary operator '??' cannot be applied to operands of type 'Bool' and …` | FH-27 `puedeAvanzarSemana` used `vis.hasNextWeek ?? false` after `SemanaDelPlan.hasNextWeek` became non-optional `Bool` (decoded from optional wire in `PlanHoyModel.desde`). | Return `vis.hasNextWeek` directly. Wire nil-coalescing stays in `PlanHoyModel.desde` only. |
| 6 | Initializer for conditional binding must have Optional type, not 'String' | FH-77 `ObjectiveCatalog.objectiveFamily` used shorthand `if let family` inside `extension RaceCalendarEvent` where `family` is `String?` but collides with enum name `ObjectiveFamily` in strict Swift 6 name lookup. | Explicit bind: `if let familyRaw = family, let parsed = ObjectiveFamily(rawValue: familyRaw)`. |

## Preserved contracts

- **FH-103** — `#if os(iOS)` around `ensurePhoneWorkoutRun()` in `WorkoutSession+RunEnvironment.swift` (unchanged).
- **FH-102** — mid-run env switch + metre carry; `PlanAcciones.diasDestino` still uses `semanaVisible` (now legal).
- **FH-27** — offset carril, horizon wall, `hasNextWeek` / `peekBlockedByHorizon` on `SemanaDelPlan`.
- **FH-77** — goals catalog picker / custom event / conditional FijarObjetivo (unchanged behaviour).
- **FH-99/100/101** — live ownership, idle cleanup, Terminar sync (untouched).

## Build

`CURRENT_PROJECT_VERSION` → **90** in `ios/project.yml`. Xcode Cloud `ci_pre_xcodebuild.sh` stamps app + watch + widgets before Archive.

## Verification (agent VM — no Xcode)

- Grep / code review: all six error classes addressed in source.
- `hasNextWeek ?? false` only remains on optional wire field in `PlanHoyModel.desde` (correct).
- HealthKitHistoryImporter: `nonisolated` statics + `@MainActor resumeForCurrentAthlete`; call sites already MainActor-hopped.
- **Not run here:** `xcodebuild archive` (no Xcode on Linux agent). Owner confirms Archive green + TF **90**.
