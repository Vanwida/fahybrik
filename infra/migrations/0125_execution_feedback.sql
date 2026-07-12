-- 0125: structured post-workout feedback from the athlete on a finished session.
--
-- (Numbering note: the runner journals by filename stem, so gaps/collisions are
-- harmless. 0124 is the current highest on this branch → this is 0125.)
--
-- WHY
-- ---
-- A finished session already carries RPE (perceived_exertion) + free-text notes.
-- Those answer "how hard" and "anything to say", but not two questions the coach
-- acts on directly:
--   * Was the session calibrated right for THIS athlete TODAY — too easy, as
--     expected, or too hard? (RPE is absolute effort; this is a relative verdict
--     against what the plan intended, which is what drives a load/volume nudge.)
--   * Did anything HURT — a specific body area — so the coach can adapt before a
--     niggle becomes an injury? This is the earliest, cheapest injury signal.
--
-- WHAT
-- ----
--   * perceived_difficulty text — the calibration verdict, a CLOSED 3-value set
--                                 ('too_easy' | 'as_expected' | 'too_hard'). Not
--                                 free text: it feeds an analytic + a coach nudge,
--                                 so it must be one of three known tokens.
--   * pain_area text — a short GENERIC body-area token the athlete taps if a spot
--                      bothered them ('rodilla' | 'tobillo' | 'cadera' | 'espalda'
--                      | 'hombro' | 'otra'). Agnostic vocabulary (no brand/coach
--                      names). NULL = nothing hurt (the common case).
--   * pain_note text — optional free-text detail on the molestia (≤500 chars).
--                      Only meaningful alongside pain_area but not enforced as a
--                      hard FK-style dependency; the writer sets both together.
--
-- All three NULLABLE and additive — zero backfill, existing rows untouched. The
-- installed app that never sends these keeps writing NULLs. No index: these are
-- read per-session on the coach detail surface + scanned in the (small) recent
-- window by the attention rollup, never grouped. Idempotent via `if not exists`;
-- the CHECK constraints are guarded (ADD CONSTRAINT has no IF NOT EXISTS).

begin;

alter table workout_executions
  add column if not exists perceived_difficulty text,
  add column if not exists pain_area            text,
  add column if not exists pain_note            text;

-- perceived_difficulty ∈ closed 3-value set (nullable).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_executions_perceived_difficulty_chk'
  ) then
    alter table workout_executions
      add constraint workout_executions_perceived_difficulty_chk
      check (perceived_difficulty is null
             or perceived_difficulty in ('too_easy', 'as_expected', 'too_hard'));
  end if;
end $$;

-- pain_area ∈ closed generic body-area set (nullable).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_executions_pain_area_chk'
  ) then
    alter table workout_executions
      add constraint workout_executions_pain_area_chk
      check (pain_area is null
             or pain_area in ('rodilla', 'tobillo', 'cadera', 'espalda', 'hombro', 'otra'));
  end if;
end $$;

-- pain_note length bound (nullable). Keeps a single free-text note honest-sized.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_executions_pain_note_len_chk'
  ) then
    alter table workout_executions
      add constraint workout_executions_pain_note_len_chk
      check (pain_note is null or char_length(pain_note) <= 500);
  end if;
end $$;

commit;
