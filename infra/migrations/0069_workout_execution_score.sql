-- 0069_workout_execution_score.sql
--
-- Metcon / HYROX final score entry. A For Time / RFT / HYROX-sim workout is
-- scored by its final TIME; an AMRAP by ROUNDS (+ partial reps). Until now the
-- athlete had no way to record that result, so the coach only saw duration/RPE
-- and per-segment actuals, never the headline score.
--
-- Additive, agnostic (no format enum coupling): three nullable scalar columns,
-- populated only for scored formats. Non-scored sessions leave them null. Explicit
-- columns (not a JSON blob) so analytics/IA can read the score directly.
--   · score_time_s  → For Time / RFT / HYROX-sim final time, in seconds
--   · score_rounds  → AMRAP completed rounds
--   · score_reps    → AMRAP partial reps in the unfinished round

alter table workout_executions
  add column if not exists score_time_s int,
  add column if not exists score_rounds int,
  add column if not exists score_reps   int;

-- Non-negative guards, added idempotently (no IF NOT EXISTS for constraints in PG).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_executions_score_time_chk') then
    alter table workout_executions
      add constraint workout_executions_score_time_chk check (score_time_s is null or score_time_s >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_executions_score_rounds_chk') then
    alter table workout_executions
      add constraint workout_executions_score_rounds_chk check (score_rounds is null or score_rounds >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_executions_score_reps_chk') then
    alter table workout_executions
      add constraint workout_executions_score_reps_chk check (score_reps is null or score_reps >= 0);
  end if;
end $$;
