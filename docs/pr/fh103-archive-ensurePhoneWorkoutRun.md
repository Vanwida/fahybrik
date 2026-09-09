# FH-103 — Archive exit 65: `ensurePhoneWorkoutRun` out of scope on watchOS

## Symptom

Xcode Cloud Archive (builds 86–88) failed with exit **65**:

```
Cannot find 'ensurePhoneWorkoutRun' in scope
at WorkoutSession+RunEnvironment.swift:19
```

TestFlight Internal stuck at build **85** (post-action never ran).

## Root cause

FH-102 added `WorkoutSession+RunEnvironment.swift` under **`FAHYBRIKCore`**, which compiles for **both** iOS and watchOS (phone + wrist share the folder).

`switchRunEnvironment(to:)` calls `ensurePhoneWorkoutRun()` unconditionally at line 19.

That helper was introduced in **FH-99** inside `WorkoutSession+Lifecycle.swift`, wrapped in `#if os(iOS)` because it binds `PhoneWorkoutRun` and launches the watch app — APIs that exist only on the phone target (`FAHYBRIK/`, not `FAHYBRIKCore/`).

On **watchOS** compilation of `FAHYBRIKCore`, the symbol simply does not exist → Archive fails when building the embedded watch target, even though the call site is only exercised from iOS UI (`LiveConectividadSheet`, `TreadmillHUDView`).

Nothing removed the helper; FH-102 added a **cross-target call** without the same platform guard used everywhere else in the lifecycle extension.

## Structural fix (not a stub)

Wrap the phone-session rebind at the **call site**, matching `WorkoutSession+Lifecycle.start()`:

```swift
#if os(iOS)
ensurePhoneWorkoutRun()
#endif
```

| Layer | Behaviour |
|-------|-----------|
| **Shared (`FAHYBRIKCore`)** | `switchRunEnvironment` still commits distance buckets → `runDistanceCarryMeters`, resets anchors, sets `runEnvironment` — valid on both platforms |
| **iOS only** | Rebind hang-off UUID + `PhoneWorkoutRun.startIfNeeded` + `PhoneLiveSession.launchWatchIfNeeded` via existing idempotent helper |

No no-op stub on watch: the wrist never drives mid-run calle↔cinta swap; it does not need `PhoneWorkoutRun`.

## Preserved contracts

- FH-99 live ownership — `ensurePhoneWorkoutRun` unchanged, still idempotent
- FH-102 mid-run switch — timer + metre carry unchanged; iOS path still rebinds HK/Watch after env change
- FH-100 idle cleanup, FH-101 Terminar sync, FH-27 week horizon, FH-77 goals catalog — untouched

## Tests

Existing unit coverage remains valid (iOS test target):

- `FH102RunEnvironmentSwitchTests` — elapsed + metre carry across outdoor ↔ treadmill ↔ indoor
- `FH99LiveOwnershipTests.testRunEnvironmentSwitchPreservesElapsed`

## Build

`CURRENT_PROJECT_VERSION` → **89** in `ios/project.yml` (Xcode Cloud `ci_pre_xcodebuild.sh` syncs into `project.pbxproj` + Generated Info.plists).
