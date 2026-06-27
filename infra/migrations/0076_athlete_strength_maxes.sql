-- 0076_athlete_strength_maxes.sql
--
-- STRENGTH analog of athlete_zone_profiles (0061). Where zone profiles store an
-- athlete's resolved PACE zones (test threshold in → bands out), this stores an
-- athlete's resolved STRENGTH maxes (a 1RM per lift). The two are the same shape:
-- a versioned, per-athlete resolved value that the plan resolver + calculator
-- read so a "5×5 @ 80% RM back squat" can print an absolute load.
--
-- WHY a versioned table (not a single editable row)
-- -------------------------------------------------
-- A 1RM changes over a block. Each new test (or coach/athlete entry) inserts a
-- new row with version+1 for that (athlete, lift); the highest version is current
-- and history is kept for audit + progression analytics. Same precedent as
-- athlete_zone_profiles_version_uq / _current_idx.
--
-- The 1RM may be entered DIRECTLY (a true single → one_rm_kg) or ESTIMATED from a
-- multi-rep set (test_weight_kg × test_reps via the coach's formula, recorded in
-- one_rm_method). The estimator is agnostic per coach (coach_methodology.one_rm_
-- estimation, default Epley); the math lives in @fahybrid/shared/domain/strength.
--
-- ADDITIVE + idempotent (create-if-not-exists), same style as 0061.

create table if not exists athlete_strength_maxes (
  id              bigint generated always as identity primary key,
  athlete_id      bigint not null references athletes(id) on delete cascade,

  -- The lift this max is for. Free-text key into the canonical benchmark slug
  -- vocabulary (shared/domain/coach/benchmark-slugs): back_squat_1rm | deadlift_1rm
  -- | bench_press_1rm | ohp_1rm | clean_1rm | snatch_1rm. Same namespace as
  -- athlete_benchmarks.exercise_slug (no FK — that catalog is a different one).
  exercise_slug   text not null,
  -- The resolved one-rep max, in kg. Either entered directly or estimated from
  -- (test_weight_kg × test_reps) by one_rm_method.
  one_rm_kg       numeric(6,2) not null,

  -- Provenance: onboarding (self-reported at signup) | athlete_test (self-entered
  -- from the app) | coach_test (coach-recorded, validated). Mirrors the
  -- athlete_zone_profiles.source axis.
  source          text not null,

  -- The test set this was estimated from (null for a direct/onboarding entry):
  -- the weight lifted and the reps performed. test_reps = 1 means a true single
  -- (direct max); >1 means one_rm_kg was estimated by one_rm_method.
  test_weight_kg  numeric(6,2),
  test_reps       int,
  -- The coach formula used to estimate one_rm_kg from the test set: Epley |
  -- Brzycki | Lombardi. Null for a direct entry (no estimation happened).
  one_rm_method   text,

  -- Review gate: an auto-derived / athlete-entered max can be flagged for coach
  -- confirmation before it drives prescriptions. Same precedent as
  -- athlete_zone_profiles.needs_review.
  needs_review    boolean not null default false,

  -- Monotonic per (athlete, exercise_slug). Highest = current.
  version         int not null,
  notes           text,
  recorded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint athlete_strength_maxes_source_chk
    check (source in ('onboarding', 'athlete_test', 'coach_test')),
  constraint athlete_strength_maxes_one_rm_chk
    check (one_rm_kg > 0 and one_rm_kg <= 1000),
  constraint athlete_strength_maxes_test_reps_chk
    check (test_reps is null or (test_reps >= 1 and test_reps <= 20)),
  constraint athlete_strength_maxes_version_chk check (version >= 1),
  constraint athlete_strength_maxes_version_uq
    unique (athlete_id, exercise_slug, version)
);

-- The current max = MAX(version) per (athlete, exercise). This index serves the
-- "give me this athlete's current 1RM for lift X" read.
create index if not exists athlete_strength_maxes_current_idx
  on athlete_strength_maxes (athlete_id, exercise_slug, version desc);

comment on table athlete_strength_maxes is
  '0076: VERSIONED resolved strength maxes per athlete × lift (the strength analog of athlete_zone_profiles). one_rm_kg in + provenance/test set. Highest version = current; history kept for audit + progression analytics. The estimator is agnostic per coach (coach_methodology.one_rm_estimation).';
comment on column athlete_strength_maxes.exercise_slug is
  '0076: canonical 1RM benchmark slug (back_squat_1rm | deadlift_1rm | bench_press_1rm | ohp_1rm | clean_1rm | snatch_1rm). Same namespace as athlete_benchmarks.exercise_slug; no FK (free-text contract enforced in shared/domain/coach/benchmark-slugs).';
comment on column athlete_strength_maxes.one_rm_method is
  '0076: coach formula used to estimate one_rm_kg from (test_weight_kg × test_reps): Epley | Brzycki | Lombardi. NULL for a direct entry (a true single, no estimation).';
