# FH-99 — Live session ownership rewrite

## What was wrong

1. **Dual watch flags lied.** `wristJoined` flipped true on HK channel bind (`adopt`) even when the wrist was on a normal face and not streaming — UI showed «Reloj grabando».
2. **Soft leave broke ownership.** `navigateAway` called `LiveWorkoutResume.dismiss()`, clearing tracked state; resume banner taps in Plan/Free opened a *new* brief instead of restoring the snapshot.
3. **Create blocked by snapshot.** `LiveWorkoutLaunchConflict` treated a fresh autosave like an active live gate — blocking «Construir entreno» while a paused run existed.
4. **Tramo hecho dead under auto-pause.** `primaryAdvance` rejected all advances while `isPaused`, including athlete taps during GPS auto-pause.
5. **X without finish path.** Top-left X always soft-left; with recorded work the athlete had no Terminar/Guardar/Descartar on that gesture.

## Deleted / replaced

- UI truth on `PhoneLiveSession.wristJoined` alone → **`wristMirrorLive`** (`WristMirrorTruth`: recent wrist signal required).
- `LiveWorkoutLaunchConflict.shouldPrompt(snapshot:)` blocking create → **`LiveLaunchPolicy`**: create never blocked; start blocked only when live cover/tracked exists.
- Resume banner → Plan/Free now call **`recoverOnLaunch`**, not `attemptWorkoutLaunch`.
- Stale mirror channel kept alive indefinitely → watchdog **`releaseChannel()`** when signal times out.

## New ownership model

| Layer | Owner | Responsibility |
|---|---|---|
| Coach engine | `WorkoutSession` | Timer, segments, persistence |
| Phone HK mirror | `PhoneLiveSession` | `startWatchApp`, channel, frames, honest `wristMirrorLive` |
| Wrist PRIMARY | `WatchPrimaryOwner` | HK recording on watch |
| Process UI | `LiveWorkoutResume` | Cover + tracked; snapshot on disk via `WorkoutStateStore` |
| Create | Builder save APIs | Plan only — never touches live |
| Start | `PreWorkoutReleaseLive` | One `begin` → live |

**One live max:** only one `LiveWorkoutResume` cover/tracked + one coaching engine. Creating N scheduled workouts/day is allowed; starting another live session prompts Seguir | Terminar y empezar.

## Mid-run source switch

`LiveConectividadSheet` already switches `runEnvironment` without stopping `WorkoutSession.timer`. `ensurePhoneWorkoutRun` is idempotent — hang-off UUID preserved, elapsed clock unchanged.
