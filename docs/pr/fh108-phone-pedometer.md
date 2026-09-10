# FH-108 — Phone-only outdoor pedometer wiring (build 94)

## Problem (DA P0, post FH-107)

`RunPhoneSensorPlan` (FH-101/107) correctly decided that outdoor phone-only runs need `CMPedometer` **independent** of which live surface owns GPS — but `ActiveWorkoutView.updateRunGPS()` only applied `plan.ownGPS`. `RunPedometer` was never instantiated, started, or wired to `sampleRunDistance(.healthkit)`. Same site ignored `plan.altimeter`.

**Symptom:** phone-only outdoor → **zero official meters** (`RunDistanceAuthority` rejects `.gps`; no HK mirror on wrist).

## Apple-first distance (iOS 18 deploy target)

| API | Role | Notes |
|-----|------|-------|
| **`CMPedometer`** (`startUpdates(from:withHandler:)`) | Live + authoritative outdoor phone meters | Same engine as Health `distanceWalkingRunning`; fuses pedometer + GPS at system level. Used via existing `RunPedometer`. |
| **`HKLiveWorkoutBuilder`** | Watch PRIMARY path | iOS **26+** only; watch path unchanged (already HK). Phone defers to mirror channel when bound. |
| **`CLLocationManager` / `RunLocationProvider`** | Route trace + speed + GPS altitude anchor | **Never** official meters — DA invariant preserved. |

References: Apple Core Motion `CMPedometer`; HealthKit `HKLiveWorkoutBuilder` (watch / future).

## Fix

`ActiveWorkoutView` now applies **all three** plan fields:

1. **`plan.pedometer`** → `RunPedometer.start/stop` → `onDistanceDelta` → `session.sampleRunDistance(..., .healthkit)`.
2. **`plan.ownGPS`** → existing `runGPS` (unchanged split vs outdoor HUD model GPS).
3. **`plan.altimeter`** → `RunAltimeter.shared.start/stop`; GPS anchor via whichever GPS is live; `onAltitude` → `session.sampleAltitude`.

Lifecycle hooks: segment / block / environment / tramo / HK mirror channel changes call `updateRunGPS()`; teardown on disappear + finish.

## Guard: tramo vs segment (DA P1, cheap)

`RunPhoneSensorPlan.decide(isRunSegment:)` now receives **`session.tramoIsRun`**, not `segment.kind == .running`. Mixed HYROX blocks fold to `.reps` but run **windows** are still run tramos — pedometer must live there too (`BloqueMixtoConCarreraTests`).

## Wrist / duplicate meters

When `PhoneLiveSession.hasMirroredHKSession` is true, `plan.pedometer == false` — watch HK stream owns meters; phone pedometer stays off (`RunPhoneSensorPlanTests.testStreetRunWithHKMirrorChannelBoundStandsThePedometerDown`).

## Out of scope

- No homemade GPS distance integrator.
- Watch PRIMARY path unchanged.
- `PhoneLiveSession` stale mirror → `handleMirrorSessionEnded` (FH-107) already relaunches wrist without `releaseChannel()` mid-coaching — not reworked here.

## Verification

- `RunPhoneSensorPlanTests` — plan matrix (unchanged).
- `RunDistanceAuthorityTests` — `.healthkit` accepted, `.gps` rejected outdoor.
- `BloqueMixtoConCarreraTests` — `tramoIsRun` on folded mixed blocks.
- Manual: phone-only outdoor run, no watch mirror → meters climb via CMPedometer.
