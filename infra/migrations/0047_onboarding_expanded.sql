-- 0047: expanded athlete onboarding (13-step single intake) — SCHEMA + CONTRACT.
--
-- WHY
-- ---
-- The athlete intake is growing from a flat ~60-field snapshot dumped verbatim
-- into `intake_notes_json` into a structured 13-step model whose answers FEED
-- THE PLAN (level inference, day-assignment, load/readiness, exercise
-- contraindications, run prescription, race anchoring). Data the planner and IA
-- read must live in NORMALIZED columns / first-class rows — NOT free text and
-- NOT an opaque json blob. This migration adds that normalized surface.
--
-- STRICTLY ADDITIVE
-- -----------------
--   * Only NEW nullable columns on `athletes` + NEW enum types.
--   * NO column is dropped, renamed, or retyped. The existing onboarding path
--     (route.ts writing intake_notes_json + a few athletes columns) keeps
--     working untouched.
--   * The pre-existing `equipment_access` enum is NOT extended (avoids churn on
--     a 4-value enum used elsewhere). Step-7 multi-select equipment lives in a
--     structured `equipment_json` array instead — reconciled, not forked.
--   * Benchmarks (Steps 10/11) normalize into the EXISTING `athlete_benchmarks`
--     table; races (Step 12) into the EXISTING `races` table (0046); injuries
--     (Step 4) into the EXISTING `athletes.injuries_json` array; devices
--     (Step 8) into the EXISTING `devices` table. This migration only adds the
--     athletes-level columns those steps also need (quick-read flags the planner
--     wants without a join).
--
-- DESTINATION SUMMARY (see the contract doc handed to implementers)
-- -----------------------------------------------------------------
--   Step 2  -> athletes.goal_type / goal_other_text / run_experience / strength_experience
--   Step 3  -> athletes.sleep_quality / stress_level / commitment_level
--   Step 4  -> athletes.injuries_json (structured array) + movement_limitations
--   Step 5  -> athletes.availability_json + available_from/to + session_minutes + schedule_flexible
--   Step 6  -> athletes.preferred_week_json
--   Step 7  -> athletes.facility_type / facility_other_text / equipment_json / has_track / has_flat_run
--   Step 8  -> athletes.watch_brand / watch_model / has_hr_belt  (+ real `devices` rows, by implementer)
--   Step 9  -> athletes.goal_short / goal_mid / goal_long / achievable_2_4_months
--              / biggest_obstacle / pct_depends_on_me / coach_role
--   Step 10 -> athlete_benchmarks rows (1RMs)            [no new athletes cols]
--   Step 11 -> athlete_benchmarks rows (run/hybrid PRs)  [no new athletes cols]
--   Step 12 -> races rows (0046)                         [no new athletes cols]
--   Step 13 -> athletes.healthkit_granted  (+ garmin/concept2 state via their own tables)

begin;

-- =============================================================================
-- Enums (idempotent — created only if absent)
-- =============================================================================

do $$
begin
  -- Step 2 — relación con el deporte
  if not exists (select 1 from pg_type where typname = 'onboarding_goal_type') then
    create type onboarding_goal_type as enum (
      'first_hyrox',          -- primera HYROX
      'improve_hyrox_mark',   -- mejorar marca HYROX
      'improve_running',      -- mejorar carrera
      'complete_fun',         -- completar / disfrutar
      'other'                 -- + goal_other_text
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'run_experience') then
    create type run_experience as enum (
      'enthusiast',   -- le encanta correr
      'comfortable',  -- cómodo corriendo
      'reluctant',    -- a regañadientes
      'none'          -- no corre
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'strength_experience') then
    create type strength_experience as enum (
      'loves_lifting',  -- le encanta levantar
      'weekly_ish',     -- entrena fuerza ~semanalmente
      'with_guidance',  -- solo con supervisión
      'none'            -- nada de fuerza
    );
  end if;

  -- Step 7 — instalación
  if not exists (select 1 from pg_type where typname = 'facility_type') then
    create type facility_type as enum (
      'commercial_gym',  -- gimnasio comercial
      'crossfit_box',    -- box de crossfit
      'multiple',        -- varias instalaciones
      'other'            -- + facility_other_text
    );
  end if;

  -- Step 9 — viabilidad de la meta a 2-4 meses
  if not exists (select 1 from pg_type where typname = 'goal_achievable') then
    create type goal_achievable as enum ('yes', 'no', 'unknown');
  end if;
end
$$;

-- =============================================================================
-- athletes — additive nullable columns
-- =============================================================================

alter table athletes
  -- Step 2 — relación con el deporte (FEEDS PLAN: level inference + emphasis)
  add column if not exists goal_type            onboarding_goal_type,
  add column if not exists goal_other_text      text,
  add column if not exists run_experience       run_experience,
  add column if not exists strength_experience  strength_experience,

  -- Step 3 — hábitos & estado (subjective 1-10; FEEDS load/readiness)
  -- NOTE distinct from daily_checkins.sleep_quality (a 1-5 DAILY metric) and
  -- from the iOS draft's sleep_hours_avg (objective hours). These are the
  -- athlete's standing self-assessment captured once at intake.
  add column if not exists sleep_quality        smallint,
  add column if not exists stress_level         smallint,
  add column if not exists commitment_level     smallint,

  -- Step 4 — movement limitations (the free-text companion to the STRUCTURED
  -- injuries_json array, which already exists and is now populated, not added).
  add column if not exists movement_limitations text,

  -- Step 5 — disponibilidad (FEEDS planner day-assignment).
  -- availability_json: object keyed mon..sun -> 'program' | 'other_activity' | 'rest'.
  -- training_days_per_week stays DERIVED (count of 'program' days) — kept, not replaced.
  add column if not exists availability_json    jsonb not null default '{}'::jsonb,
  add column if not exists available_from       time,      -- window start (local)
  add column if not exists available_to         time,      -- window end (local)
  add column if not exists session_minutes      smallint,  -- typical session length
  add column if not exists schedule_flexible    boolean,

  -- Step 6 — semana típica preferida (FEEDS planner day-type assignment).
  -- preferred_week_json: object keyed mon..sun -> array of preferred type slugs
  -- {isolated_run | strength_gym | hyrox_transitions | ergo_conditioning | specific_material}.
  add column if not exists preferred_week_json  jsonb not null default '{}'::jsonb,

  -- Step 7 — instalación & material (FEEDS template/exercise filtering + run rx).
  -- equipment_json: array of equipment slugs (reconciled list, see contract);
  -- kept as structured json to avoid churning the existing equipment_access enum.
  add column if not exists facility_type        facility_type,
  add column if not exists facility_other_text  text,
  add column if not exists equipment_json       jsonb not null default '[]'::jsonb,
  add column if not exists has_track            boolean,   -- pista de atletismo
  add column if not exists has_flat_run         boolean,   -- terreno llano para correr

  -- Step 8 — dispositivos (quick-read flags; real rows go in `devices`).
  add column if not exists watch_brand          device_type,  -- reuse existing device_type enum
  add column if not exists watch_model          text,
  add column if not exists has_hr_belt          boolean,

  -- Step 9 — metas (mostly coach/IA narrative context; anchors the macro).
  add column if not exists goal_short           text,
  add column if not exists goal_mid             text,
  add column if not exists goal_long            text,
  add column if not exists achievable_2_4_months goal_achievable,
  add column if not exists biggest_obstacle     text,
  add column if not exists pct_depends_on_me    smallint,  -- 1-10
  add column if not exists coach_role           text,

  -- Step 13 — connections (client truth; garmin/concept2 live in their tables).
  add column if not exists healthkit_granted    boolean;

-- =============================================================================
-- Bounded-value checks for the 1-10 subjective scales (data integrity)
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'athletes_sleep_quality_chk') then
    alter table athletes add constraint athletes_sleep_quality_chk
      check (sleep_quality is null or sleep_quality between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'athletes_stress_level_chk') then
    alter table athletes add constraint athletes_stress_level_chk
      check (stress_level is null or stress_level between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'athletes_commitment_level_chk') then
    alter table athletes add constraint athletes_commitment_level_chk
      check (commitment_level is null or commitment_level between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'athletes_pct_depends_chk') then
    alter table athletes add constraint athletes_pct_depends_chk
      check (pct_depends_on_me is null or pct_depends_on_me between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'athletes_session_minutes_chk') then
    alter table athletes add constraint athletes_session_minutes_chk
      check (session_minutes is null or session_minutes between 10 and 360);
  end if;
end
$$;

-- =============================================================================
-- Column comments (self-documenting schema for implementers)
-- =============================================================================

comment on column athletes.goal_type is 'Step 2: primary goal. Feeds plan level inference + emphasis. other => goal_other_text.';
comment on column athletes.run_experience is 'Step 2: relationship with running. Feeds run-volume emphasis.';
comment on column athletes.strength_experience is 'Step 2: relationship with strength training. Feeds strength-block emphasis.';
comment on column athletes.sleep_quality is 'Step 3: subjective sleep quality 1-10 (standing self-assessment at intake; distinct from daily_checkins 1-5). Feeds load/readiness.';
comment on column athletes.stress_level is 'Step 3: subjective stress 1-10. Feeds load/readiness. (Supersedes the iOS draft subjective_stress json field.)';
comment on column athletes.commitment_level is 'Step 3: self-rated commitment 1-10.';
comment on column athletes.movement_limitations is 'Step 4: free-text movement limitations (companion to structured injuries_json).';
comment on column athletes.injuries_json is 'Step 4 (structured): array of {area, type, active:bool, note?}. Feeds exercise contraindications. (Pre-existing column, now populated.)';
comment on column athletes.availability_json is 'Step 5: object {mon..sun -> program|other_activity|rest}. Feeds planner day-assignment. training_days_per_week stays DERIVED from program-day count.';
comment on column athletes.available_from is 'Step 5: typical training window start (local time).';
comment on column athletes.available_to is 'Step 5: typical training window end (local time).';
comment on column athletes.session_minutes is 'Step 5: typical session length in minutes (10-360).';
comment on column athletes.schedule_flexible is 'Step 5: whether the weekly schedule can flex.';
comment on column athletes.preferred_week_json is 'Step 6: object {mon..sun -> [isolated_run|strength_gym|hyrox_transitions|ergo_conditioning|specific_material]}. Feeds planner day-type assignment.';
comment on column athletes.facility_type is 'Step 7: facility kind. other => facility_other_text. Feeds template/exercise filtering.';
comment on column athletes.equipment_json is 'Step 7 (structured): array of equipment slugs [barbells_plates,dumbbells,sleds,bags_kb,open_space,pulleys,treadmill,stationary_bike,rower,skierg,other]. Reconciled with (not extending) the equipment_access enum.';
comment on column athletes.has_track is 'Step 7: access to an athletics track. Feeds run prescription.';
comment on column athletes.has_flat_run is 'Step 7: access to flat running terrain. Feeds run prescription.';
comment on column athletes.watch_brand is 'Step 8: watch brand (reuses device_type enum: apple_watch|garmin|...). Real device rows also written to `devices`.';
comment on column athletes.watch_model is 'Step 8: free-text watch model.';
comment on column athletes.has_hr_belt is 'Step 8: owns a chest HR belt.';
comment on column athletes.goal_short is 'Step 9: short-term goal (narrative). Coach/IA context.';
comment on column athletes.goal_mid is 'Step 9: mid-term goal (narrative).';
comment on column athletes.goal_long is 'Step 9: long-term goal (narrative). Anchors the macro.';
comment on column athletes.achievable_2_4_months is 'Step 9: does the athlete believe the goal is achievable in 2-4 months (yes/no/unknown).';
comment on column athletes.biggest_obstacle is 'Step 9: athlete-stated biggest obstacle.';
comment on column athletes.pct_depends_on_me is 'Step 9: how much (1-10) the athlete feels the outcome depends on them.';
comment on column athletes.coach_role is 'Step 9: what the athlete wants from the coach (narrative).';
comment on column athletes.healthkit_granted is 'Step 13: HealthKit permission granted on device (client truth).';

commit;
