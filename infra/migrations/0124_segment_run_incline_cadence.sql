-- 0124: running INCLINE + CADENCE per segment on segment_executions.
--
-- (Numbering note: 0119 lives on another in-flight branch; the runner journals
-- by filename stem, so gaps/collisions are harmless. 0123 is the current highest
-- on this branch → this is 0124.)
--
-- WHY
-- ---
-- Running capture was blind to two first-class run signals a dedicated running
-- app always shows: INCLINE (treadmill / uphill grade) and CADENCE (steps/min).
-- Segment intensity (mig 0045) modelled pace, power and `stroke_rate_spm` — but
-- `stroke_rate_spm` is ERG strokes/min (row/ski ~20-40, bike rpm), a DIFFERENT
-- physical quantity from running cadence (~150-190 steps/min). Cramming run
-- cadence into `stroke_rate_spm` (as the Garmin lap path did) both mislabels it
-- and hides it: the running analytics never read `stroke_rate_spm`. These two
-- columns give running its own honest home.
--
-- WHAT
-- ----
--   * incline_pct      numeric(4,1) — AVERAGE incline / grade of the segment, in
--                                     PERCENT (treadmill setting or uphill grade).
--                                     Non-negative (treadmill incline is ≥0; this
--                                     v1 does not model downhill/net grade).
--                                     Bounded 0..30 (treadmill tops out ~15; the
--                                     headroom covers steep trail legs).
--   * run_cadence_spm  integer      — AVERAGE running cadence over the segment, in
--                                     STEPS per minute. Distinct column from
--                                     `stroke_rate_spm` precisely because a step
--                                     is not a stroke. Bounded 100..250: below 100
--                                     is walking (not a running cadence), 250 is a
--                                     generous sprint ceiling. The INGEST layer is
--                                     responsible for range-gating device values
--                                     to null BEFORE insert, so a stray reading can
--                                     never make the CHECK reject a whole lap row.
--
-- Both NULLABLE and additive — zero backfill, existing rows unaffected. No index:
-- these are not grouping keys; the cadence-trend aggregate rides the run rows the
-- existing modality filter already scans. Idempotent via `if not exists`; the
-- CHECK constraints are guarded (ADD CONSTRAINT has no IF NOT EXISTS).

begin;

alter table segment_executions
  add column if not exists incline_pct     numeric(4,1),
  add column if not exists run_cadence_spm integer;

-- incline_pct ∈ [0, 30] (nullable). Treadmill/uphill grade percent, non-negative.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_incline_pct_chk'
  ) then
    alter table segment_executions
      add constraint segment_executions_incline_pct_chk
      check (incline_pct is null or (incline_pct >= 0 and incline_pct <= 30));
  end if;
end $$;

-- run_cadence_spm ∈ [100, 250] (nullable). Running steps/min; below 100 = walking.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'segment_executions_run_cadence_spm_chk'
  ) then
    alter table segment_executions
      add constraint segment_executions_run_cadence_spm_chk
      check (run_cadence_spm is null or (run_cadence_spm >= 100 and run_cadence_spm <= 250));
  end if;
end $$;

commit;
