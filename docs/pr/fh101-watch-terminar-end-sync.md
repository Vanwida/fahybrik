# FH-101 — Watch Terminar + bilateral end sync (reconnect)

## What was wrong

End sync was **asymmetric by transport**:

| Direction | Connected | Disconnected |
|---|---|---|
| Phone → Watch | HK `MirrorEnd` (retry) + WC `live_end_v1` (durable) | WC `transferUserInfo` queues `live_end_v1` |
| Watch → Phone | HK `MirrorEnded` (mirror channel only) | **Nothing durable** — phone stayed live until HK happened to deliver |

Structural symptoms:

1. **Watch Terminar hidden** — only on `isFinalStep` (live page) or `connectionLost` (controls page). Athlete away from phone could not finish unless the watchdog fired.
2. **Single ingest path on phone** — `PhoneLiveSession.handleIncoming` owned `MirrorEnded`, but no WC equivalent; reconnect after watch-only finish depended on HK mirror luck.
3. **Reopen gap** — `handleWristAthleteFinishWhenBackgrounded` refused when `tracked != nil` (soft leave), and `reopenFreshSnapshotIfNeeded` blocked on `hasLiveSession` instead of `cover == nil`. Wrist finish + closed cover could stall.
4. **No replay on recover** — `wristFinishedByAthlete` already true when cover reopens did not trigger `cerrarPorqueTerminoLaMuneca` (`.onChange` does not replay).

FH-100 fixed idle/zombie after phone Terminar; FH-101 completes the **owner contract**: one session, two screens, either Terminar ends it, reconnect delivers ended state, watch wins on late delivery.

## Single end-authority model

```
                    ┌─────────────────────────────────────┐
                    │  ONE coach engine (WorkoutSession)   │
                    │  ONE wrist PRIMARY (WatchPrimaryOwner)│
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
    Phone UI Terminar           Watch UI Terminar            (no auto-watchdog end)
          │                           │
          ▼                           ▼
   session.finish()            finishByAthlete()
          │                           │
          ▼                           ▼
 PhoneLiveSession.end()        performTeardown → HK save
   WC live_end_v1 ──────────► finishFromPhone (watch idle)
   HK MirrorEnd ────────────► requestEnd(reason: phone)
                                      │
                                      ▼
                              MirrorEnded(reason: athlete)
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
              HK mirror (immediate)              WC live_ended_v1
                    │                          (transferUserInfo)
                    └─────────────┬─────────────────┘
                                  ▼
                    PhoneLiveSession.applyWristEnded()
                    wristFinishedByAthlete → engine.finish()
                    enterIdle() — no second Terminar, no zombie
```

**Authority rule:** whoever the athlete taps Terminar on owns the *local* teardown on that device; **`reason=athlete` propagates** to the other side. Phone-initiated ends use `reason=phone` on the wrist (recording only, not engine). Watchdog/discarded never finish the phone engine (DECISIONS 2026-08-24 preserved).

**Durable delivery (Apple-correct):** WCSession `transferUserInfo` for watch→phone athlete finish — same pattern as `execution_result_v1` and phone→watch `live_end_v1`. No custom queue. HK mirror remains the low-latency path when bound.

## Structural changes (not patches)

| Layer | Change |
|---|---|
| `WatchWireKeys.liveEnded` | Durable watch→phone `MirrorEnded` over WC |
| `WatchPrimaryOwner.performTeardown` | Emit WC aviso when `reason == athlete` |
| `PhoneLiveSession.applyWristEnded` | Single sink for HK + WC; calls `enterIdle()` |
| `WatchConnectivityiOSService` | `didReceiveMessage` + `didReceiveUserInfo` → `applyLiveEnded` |
| `MirrorHUDControls` | **Terminar** always on controls page (confirm, minimal copy) |
| `LiveWorkoutResume` | Reconcile wrist-finish first; reopen when `cover == nil` |
| `WorkoutContainer.applyRecovered` | Replay wrist finish if flag already set |

## Preserved

- FH-100 `forceIdle` / `enterIdle` / `mirrorChannelAlive`
- FH-99 `wristMirrorLive` truth
- FH-96/95 single Empezar / Devices → Brief flow
- `phoneEndIsNoOp` after athlete end — no second `MirrorEnd`

## Tests

- `FH101WatchEndSyncTests` — WC path, idempotency, reopen, second begin
- `MirrorWireModelsTests` — `live_ended_v1` roundtrip
- Existing `PhoneMirrorEndRetryTests` — phone end + athlete idle preserved

## Verificado

1. Wire model compiles in both targets (`WatchWireModels.swift` shared).
2. Phone ingest unified in `applyWristEnded` — HK and WC same semantics.
3. Watch controls expose Terminar without connection-lost gate.
4. Reconcile path prioritizes `wristFinishedByAthlete` before asymmetry heuristics.
5. `CURRENT_PROJECT_VERSION` → **85**.
