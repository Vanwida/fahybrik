-- 0086: Frozen planned ORDER of a session within its microcycle (week).
--
-- WHY
-- ---
-- `workout_assignments` already carries `scheduled_for` (the date the athlete is
-- meant to do a session) but NOT the position that session held in the coach's
-- ORIGINAL weekly sequence. The two diverge the moment an athlete drags a session
-- to another day: `scheduled_for` moves, but the intended order ("Day-1 strength
-- before Day-3 intervals") is lost. We need that intended order frozen so we can
-- later detect when an athlete completed their week OUT of the planned sequence
-- (a coaching signal distinct from merely moving a day).
--
-- THE MODEL
-- ---------
-- `planned_sequence` is the 1..N rank of the session inside its (athlete,
-- microcycle) week, captured ONCE from the original `(scheduled_for, id)` order
-- and never recomputed. Moving a session to a different day does NOT change it —
-- that is the whole point: the frozen plan order is the baseline that "did they
-- do it in order?" is measured against. NULLABLE because brand-new rows get it
-- assigned by the write path, not by this backfill.
--
-- IDEMPOTENT: `add column if not exists` + the backfill only touches rows where
-- `planned_sequence is null`, so a re-run selects nothing and changes nothing.

begin;

-- =============================================================================
-- 1. Column — frozen planned position within the week.
-- =============================================================================
alter table workout_assignments
  add column if not exists planned_sequence smallint;

comment on column workout_assignments.planned_sequence is
  'frozen planned order of the session within its microcycle (week), 1..N by original (scheduled_for,id); does NOT change when the athlete moves a session to another day — used to detect order-altered completion.';

-- =============================================================================
-- 2. Backfill — capture the ORIGINAL within-week order, once.
-- =============================================================================
-- Rank each session inside its (athlete, microcycle) partition by the original
-- schedule, tie-broken by id for a stable total order. Guarded by `is null` so a
-- re-run (or rows already populated by the write path) is a no-op.
with planned as (
  select
    id,
    row_number() over (
      partition by athlete_id, microcycle_id
      order by scheduled_for asc, id asc
    ) as seq
  from workout_assignments
)
update workout_assignments wa
set planned_sequence = planned.seq
from planned
where planned.id = wa.id
  and wa.planned_sequence is null;

commit;
