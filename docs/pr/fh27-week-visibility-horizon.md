# FH-27 — Plan week visibility horizon (multi-tenant)

## Owner contract (locked 9 Sep)

| Rule | Detail |
|------|--------|
| Default (new coaches) | Athlete Plan sees **this week only** |
| Coach control | Club-wide dashboard setting (v1 — not per athlete, not per program) |
| Unlock options | **next week** · **~2 weeks** · **~1 month** |
| Athlete override | Never |
| Free (no coach) | Only self-scheduled work — no coach horizon, no fake coach weeks |
| Wall | Short objective copy when peek is blocked by horizon |
| Multi-tenant | Different clubs differ via data, not code forks |

## What was wrong (structure, not patches)

1. **`has_next_week` ≠ coach horizon.** It only answered «is there published content in week N+1?». A coach who wants this-week-only still got `has_next_week: true` when the next week existed.
2. **`MAX_WEEK_OFFSET = 1` hardcoded** in `web/app/api/athlete/plan/week/route.ts`. Two-week and one-month unlocks were impossible without another constant.
3. **iOS boolean peek.** `verProximaSemana` + `semanaSiguiente` could only hold offset 0|1. Extending to 2 or 4 weeks required replacing the boolean with an integer offset and a week cache.
4. **Free tier conflated with coached peek.** Free athletes use `FreePlanView` / `SemanaAtletaOperativa` (this week, self-origin). They must not inherit a coached horizon.

## New structure

### Data — `coaches.plan_week_horizon`

| Value | Max `week_offset` | Meaning |
|-------|-------------------|---------|
| `this_week` | 0 | This Mon–Sun only |
| `next_week` | 1 | +1 week peek (legacy default for existing clubs) |
| `two_weeks` | 2 | ~2 weeks ahead |
| `one_month` | 4 | ~4 weeks ahead |

- Column default **`this_week`** → new coaches.
- Migration backfills **existing** coaches to **`next_week`** so clubs that never touched the setting keep today’s behaviour (HARD RULE Nº0).
- Method = editable data on `coaches`; mechanism = `maxWeekOffset()` + API clamp in code.

### Server — single resolver

`resolveAthletePlanWeekVisibility(athlete_id)`:

- `coach_id IS NULL` → `{ max_week_offset: 0, horizon: null, wall_message: null, peek_blocked_by_horizon: false }`
- else → read coach’s `plan_week_horizon`, map to max offset.

`buildAthleteWeekPlan(athlete_id, weekOffset, visibility?)`:

- Reject / empty when `weekOffset > max_week_offset` (route returns 403 + wall copy).
- `has_next_week` = content exists at offset+1 **AND** `weekOffset + 1 <= max_week_offset`.
- `peek_blocked_by_horizon` = content exists at offset+1 **AND** `weekOffset + 1 > max_week_offset` (drives wall on swipe attempt).

Response adds top-level `plan_visibility` (additive, snake_case).

### Dashboard

`PlanWeekHorizonForm` in `/ajustes` — same card pattern as `SignalThresholdsForm`.  
`GET/PATCH /api/coach/plan-week-horizon`.

### iOS — offset carril

| Before | After |
|--------|-------|
| `verProximaSemana: Bool` | `offsetVisible: Int` (0…max) |
| `semanaSiguiente` | `semanasCargadas: [Int: SemanaDelPlan]` |
| Swipe gated on `hasNextWeek` only | Swipe +1 if `hasNextWeek`; if `peekBlockedByHorizon` → wall sheet |
| `fetchWeek(offset: 1)` only | `fetchWeek(offset: n)` for any allowed n |

`PlanService` decodes `plan_visibility`. Free `SemanaAtletaOperativa` unchanged (no swipe, this week).

## Tests

- Unit: `maxWeekOffset`, wall copy, `has_next_week` logic with mocked visibility.
- DB: tenant A `this_week` vs tenant B `one_month`; free athlete max 0; 403 beyond horizon.

## Preserved

FH-100 idle, FH-101 Watch Terminar, FH-102 week rail + mid-run connectivity, free self-schedule.

## Out of scope

Per-athlete/program horizons, infinite scroll, FH-98 share.
