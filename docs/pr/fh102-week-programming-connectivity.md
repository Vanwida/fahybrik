# FH-102 — Week programming + mid-run connectivity (FH-99 leftovers)

## What #171 / FH-99 already shipped

| Area | Delivered | Not delivered |
|------|-----------|---------------|
| **Week** | `LiveLaunchPolicy` (create ≠ start); day picker on measured free builder (7-day rolling); `PlanView` carril + move for coached; N sessions/day in `buildAthleteWeekPlan` | Free Plan tab = conversion demo, not operational week; strength/functional save → today only; free strip lacks move/edit; peek-next-week move used wrong week |
| **Connectivity** | `LiveConectividadSheet`; timer preserved on env switch (test); `.indoor` without BLE; FTMS feeder session-wide | Control only on `HostVivo` topStrip — buried once outdoor/treadmill HUD mounts; meters not accumulated across source swap |

## What was wrong (structure, not patches)

### A. Week programming

1. **Two truths for free week.** Real week lived on Inicio strip; Plan tab showed marketing demo (`FreePlanWeekCard`). Athlete could not program from Plan.
2. **Day picker was track-local.** Measured builder had picker; strength/functional defaulted to today — same API, different UX.
3. **Move was coached-only.** Same `POST /plan/session/move` works for self-origin; free UI never exposed it.
4. **Peek week bug.** `diasDestino` read `semana` not `semanaVisible` — move targets wrong week when previewing next.

### B. Mid-run connectivity

1. **HUD chrome hid the control.** `BotonConectividad` only in `HostVivo.topStrip`. Once `RunLiveChrome` mounted outdoor/treadmill HUD, athlete lost visible path to swap calle ↔ cinta.
2. **Distance buckets were source-local.** `lapGpsDistanceMeters` and `lapBeltDistanceMeters` reset semantics on `claimTreadmillDistanceSource()` — switching env dropped prior meters from display. Timer was correct; distance model was not session-continuous.

## New structure

### Week — `ProgramarDiaPicker` + `SemanaAtletaOperativa`

| Piece | Role |
|-------|------|
| `ProgramarDiaPicker` | Mon–Sun calendar week (aligned with `GET /plan/week`); shared by measured/strength/functional builders |
| `scheduledDayISO` on all free drafts | One field → `scheduled_for` on save |
| `SemanaAtletaOperativa` | Real week rail + day panel + move/edit/delete for self-origin; used on free Inicio **and** Plan |
| `PlanAcciones.diasDestino` | Uses `semanaVisible` |

Create CTA unchanged: **Guardar / Construir** → plan only (`LiveLaunchPolicy.blocksCreatingPlan` always false).

### Connectivity — `switchRunEnvironment` + `ControlFuenteCarrera`

| Piece | Role |
|-------|------|
| `runDistanceCarryMeters` | Snapshot of official meters before each env switch |
| `WorkoutSession.switchRunEnvironment(to:)` | Commit active bucket → carry; reset anchors; set env; idempotent `ensurePhoneWorkoutRun()` |
| `liveRunDistanceMeters` / belt display | `carry + active` — one continuous total |
| `ControlFuenteCarrera` | Compact chip in outdoor/treadmill HUD chrome → same `LiveConectividadSheet` |
| Copy | `RunEnvironment.hudLabel` — Calle / Cinta / Sin conexión (agnostic) |

Preserved: FH-100 idle cleanup, FH-101 `live_ended_v1` / `applyWristEnded`, Devices → Brief → one Empezar.

## Tests

- `FH102RunEnvironmentSwitchTests` — elapsed + meters accumulate outdoor → treadmill → outdoor
- `ProgramarDiaPickerTests` — Mon–Sun window contains today
- Existing `LiveLaunchPolicyTests`, `FH99LiveOwnershipTests`, `FH101WatchEndSyncTests` unchanged

## Out of scope

FH-98 share, brief coach on plan, brand, new Watch Terminar work.
