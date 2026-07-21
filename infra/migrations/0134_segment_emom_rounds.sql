-- 0134: EMOM completion (rounds done vs prescribed) per segment on segment_executions.
--
-- (Numbering note: 0133 is the current highest on this branch → this is 0134. The
-- runner journals by filename stem, so any prefix collision on another in-flight
-- branch is harmless.)
--
-- WHY
-- ---
-- An EMOM segment records WHETHER the athlete hit the prescribed work each minute
-- ONLY in device memory: `emomCompletedIntervals`. Until now that count was zeroed
-- by the live engine's teardown BEFORE the lap closed, so the execution row landed
-- with the EMOM completion LOST — the coach's prescrito-vs-hecho was blank even
-- though the finish dialog promised "Se registrará con X/Y rondas hechas". These
-- two columns give the count an honest, explicit home so the loop closes.
--
-- Neither `reps_completed` nor a `set_executions` row is the right home: an EMOM
-- interval is not a rep (it would pollute strength volume) nor a strength set (it
-- would appear as a phantom lift in the per-set analytics). EMOM rounds get their
-- own columns.
--
-- WHAT
-- ----
--   * emom_rounds_completed  integer — how many of the EMOM's intervals the athlete
--                                      completed the prescribed work in (0..N).
--   * emom_rounds_prescribed integer — how many intervals the EMOM prescribed (N).
--                                      Stored alongside so "X/Y rondas" needs no
--                                      re-derivation from the prescription snapshot.
--
-- Both NULLABLE and additive — zero backfill, existing rows unaffected; a non-EMOM
-- segment leaves both NULL (honest absence, never a fabricated 0). No index: these
-- are not grouping keys. Idempotent via `if not exists`; the CHECK constraints are
-- guarded (ADD CONSTRAINT has no IF NOT EXISTS). The migrate runner journals by
-- filename stem (0134_segment_emom_rounds).

begin;

alter table segment_executions
  add column if not exists emom_rounds_completed  integer,
  add column if not exists emom_rounds_prescribed integer;

-- emom_rounds_completed ≥ 0 (nullable). NULL for non-EMOM segments.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_emom_rounds_completed_chk'
  ) then
    alter table segment_executions
      add constraint segment_executions_emom_rounds_completed_chk
      check (emom_rounds_completed is null or emom_rounds_completed >= 0);
  end if;
end $$;

-- emom_rounds_prescribed ≥ 0 (nullable). NULL for non-EMOM segments.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_emom_rounds_prescribed_chk'
  ) then
    alter table segment_executions
      add constraint segment_executions_emom_rounds_prescribed_chk
      check (emom_rounds_prescribed is null or emom_rounds_prescribed >= 0);
  end if;
end $$;

commit;
