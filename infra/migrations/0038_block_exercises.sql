-- 0038: block_exercises — the STRUCTURED layer of the Biblioteca de Bloques.
--
-- 0037 stored each block as Pablo's VERBATIM text only (`blocks.description`),
-- the source of truth. This migration adds the structured layer so a library
-- block materializes into real, exercise-linked `template_segments` (not just a
-- verbatim coach note): the athlete then sees each exercise + tap→video and the
-- analytics line up.
--
-- The table MIRRORS `template_segments` (0001 + 0020) so materialization is a
-- 1:1 copy: position (global order in the block), block_position (sub-block
-- index inside the block, e.g. "Deadlift + Hip thrust" → two sub-blocks),
-- exercise_id (FK to the 62-exercise catalog), params_json (the SAME canonical
-- shape the studio editor and assignment-detail loader already consume:
-- sets/reps/load_kg/load_pct/rpe/duration_seconds/distance_m(eters)/
-- pace_sec_per_km/hr_zone/rest_seconds/calories), notes.
--
-- Two columns the block layer adds on top of the segment shape:
--   * needs_review — true when the verbatim couldn't be mapped to the catalog
--     with confidence (dense WODs, ambiguous formats). Such blocks still keep
--     their verbatim; materialization degrades them to a session note rather
--     than inventing fake structure. Pablo reviews these.
--   * reps_scheme  — Pablo writes per-set rep schemes ("10/10/8/8/6") that the
--     scalar `params_json.reps` can't hold. We keep the full scheme as text so
--     nothing is lost; `params_json.sets` + `params_json.reps` carry the
--     numeric summary the editor/iOS contract consume.
--
-- `blocks.needs_review` is also added (block-level flag) so the catalog can
-- surface "X bloques pendientes de revisión por Pablo" without scanning rows.
--
-- Idempotent: `if not exists` everywhere; the migrate runner journals by stem.

begin;

create table if not exists block_exercises (
  id              bigserial primary key,
  block_id        bigint not null references blocks(id) on delete cascade,
  -- global 0-based order of the exercise within the block (mirrors
  -- template_segments.position).
  position        int not null,
  -- 0-based sub-block index inside the block (mirrors
  -- template_segments.block_position). All exercises with the same
  -- block_position form one logical sub-block (e.g. a superset).
  block_position  int not null default 0,
  exercise_id     bigint not null references exercises(id) on delete restrict,
  -- canonical params shape (see header). Same jsonb contract as
  -- template_segments.params_json.
  params_json     jsonb not null default '{}'::jsonb,
  -- per-set rep scheme verbatim ("10/10/8/8/6"); params_json.reps holds the
  -- numeric summary. NULL when not applicable (erg/run/zone work).
  reps_scheme     text null,
  notes           text null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint block_exercises_position_unique unique (block_id, position),
  constraint block_exercises_position_chk check (position >= 0),
  constraint block_exercises_block_position_chk check (block_position >= 0)
);

create index if not exists block_exercises_block_idx
  on block_exercises (block_id, block_position, position);

create index if not exists block_exercises_exercise_idx
  on block_exercises (exercise_id);

-- Block-level review flag. Default false; the parser flips it true for blocks
-- it couldn't map with confidence (dense WODs, race sims, ambiguous formats).
alter table blocks
  add column if not exists needs_review boolean not null default false;

commit;
