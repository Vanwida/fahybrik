# FH-100 — Watch zombie after Terminar: structural idle cleanup

## What was wrong

After Terminar, the watch app stayed in a zombie PRIMARY state in-process:

1. **`forceIdle()` was not idempotent** — `guard phase != .idle` skipped cleanup when phase was already idle but a stale `HKWorkoutSession` handle survived.
2. **Redundant-start policy ignored `startWatchApp` on dead mirrors** — compatible config + `phase == .recording` blocked the second launch even when the phone channel was gone (`isConnectionLost`).
3. **Dual teardown gate** — `phase == .ending` plus `isTeardownRunning` duplicated ownership; stuck `.ending` could decline the next launch.
4. **Phone `releaseChannel()` did not always reach idle** — `phase` only flipped when already `.ending`, leaving latches (`primaryRequested`, `didLaunchWatch`) across workouts.

## Structural fix

| Layer | Change |
|---|---|
| `WatchPrimaryLifecycle` | `isCleanIdle`, `shouldForceIdleFromStuckEnding`; start requires clean idle |
| `MirrorPrimaryLaunchPolicy` | `mirrorChannelAlive` — zombie mirror is never "redundant" |
| `WatchPrimaryOwner` | `reconcileIdleBeforeLaunch` before every `handle(_:)`; idempotent `forceIdle()`; HK `.ended`/`.stopped` always drains to idle |
| `PhoneLiveSession` | Split `releaseChannel()` (mid-workout drop) vs `enterIdle()` (post-workout: latches + launch generation bump) |

## Contract

- Terminar → phone `enterIdle()` + watch `forceIdle()` — no residual HK session, pending start, or PRIMARY latch.
- Every Empezar after a clean end behaves like a cold first start.
- UI uses `wristMirrorLive` (FH-99) — never claims grabando without recent wrist signal.

## Tests

- `WatchPrimaryLifecycleTests` — clean idle + stuck ending
- `PhoneMirrorDoubleBeginTests` — zombie mirror restart policy
- `PhoneMirrorEndRetryTests` — end → second begin launches watch again
