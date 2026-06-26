-- 0067: SEQUENCE LOOP COUNTER — enables per-loop progressive overload on repeat.
--
-- WHAT THIS ADDS
-- --------------
-- A program_sequence (0059) carries a coach-set per-loop lever:
--   program_sequences.progression_pct (0-100) + progression_applies_to
--   (strength_load | volume | pace).
-- On end_policy='repeat' the athlete re-walks the sequence. Each completed loop
-- should make the work harder by that %. To apply a CUMULATIVE factor
-- ((1+pct)^N) deterministically — without ever mutating the library microciclo
-- template — the enrollment must know HOW MANY loops it has completed. This
-- column is that counter.
--
-- SEMANTICS
-- ---------
--   · 0 on enrollment (initial assign + the first pass through the sequence).
--   · +1 each time end_policy=repeat restarts the loop (cursor back to position 1).
--   · The materializer scales the repeated cycle's doses by the coach's % raised
--     to loops_completed (loads/volume grow, pace improves). 0 ⇒ verbatim.
--   · A level_up creates a FRESH enrollment (counter back to 0); a re-assign onto a
--     different sequence resets it to 0 (handled in app code's upsert).
--
-- ADDITIVE & NON-BREAKING: one column with a default; nothing dropped or altered.
-- Existing rows backfill to 0 (their current behavior — verbatim loops).

begin;

alter table athlete_sequence_progress
  add column if not exists loops_completed smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'athlete_sequence_progress_loops_chk'
  ) then
    alter table athlete_sequence_progress
      add constraint athlete_sequence_progress_loops_chk check (loops_completed >= 0);
  end if;
end $$;

comment on column athlete_sequence_progress.loops_completed is
  '0067: number of full sequence loops completed under end_policy=repeat. 0 on enrollment; +1 each loop restart. Drives the cumulative per-loop progression factor (program_sequences.progression_pct ^ loops_completed) applied to the repeated cycle''s materialized doses.';

commit;
