-- 0085_coach_exercise_overrides.sql
--
-- Per-coach pedagogical overrides for the GLOBAL exercise catalog.
--
-- WHY
-- ---
-- The `exercises` catalog is ONE shared row per movement (id, slug, name,
-- category, modality, the 1RM-benchmark mapping, default_metrics) — GLOBAL,
-- never duplicated. But the PEDAGOGICAL content of an exercise is the coach's
-- own voice: the cues they teach, the description they write, the demo video
-- they film. A squat is the same movement for every coach; how Pablo coaches it
-- is HIS. Until now editing cues/description/video_url on the catalog mutated the
-- GLOBAL row → it changed them for every coach. That's wrong the moment there is
-- more than one coach.
--
-- THE MODEL (Alex-approved: overrides, NOT a copy)
-- ------------------------------------------------
-- The exercise stays a single global row. This table holds ONLY the three
-- per-coach pedagogical fields, keyed unique on (coach_id, exercise_id). Each
-- field is independently nullable: NULL = "no override, fall back to the global
-- default". The athlete sees the MERGE — coalesce(override, global) per field —
-- so a coach who only set a video still inherits the global cues.
--
-- The global identity (slug / name / category / modality / 1RM mapping /
-- default_metrics / muscles / equipment / hyrox_station_position) is NEVER
-- per-coach and is intentionally absent from this table.
--
-- IDEMPOTENT: guarded by `if not exists`, safe to re-run.

create table if not exists coach_exercise_overrides (
  id           bigint generated always as identity primary key,
  coach_id     bigint not null references coaches(id)   on delete cascade,
  exercise_id  bigint not null references exercises(id) on delete cascade,
  -- The three pedagogical fields, each independently NULL-able. NULL = inherit
  -- the global default for THAT field (the read-side coalesce decides).
  cues         text,
  description  text,
  video_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One override row per coach per exercise — the upsert target.
  unique (coach_id, exercise_id)
);

-- Athlete-read merge joins by exercise_id (+ the athlete's coach_id, already the
-- left side via the unique key). Index the FK so the LEFT JOIN on the
-- assignment-detail / station-detail readers stays cheap.
create index if not exists coach_exercise_overrides_exercise_idx
  on coach_exercise_overrides (exercise_id);

comment on table coach_exercise_overrides is
  'Per-coach pedagogical overrides (cues/description/video_url) for the GLOBAL exercises catalog. Athlete sees coalesce(override, global) per field. Global identity is never per-coach and lives only on exercises.';
comment on column coach_exercise_overrides.cues is
  'Coach override for exercises.cues; NULL = inherit the global cues.';
comment on column coach_exercise_overrides.description is
  'Coach override for exercises.description; NULL = inherit the global description.';
comment on column coach_exercise_overrides.video_url is
  'Coach override for exercises.video_url (canonical YouTube watch URL); NULL = inherit the global video.';
