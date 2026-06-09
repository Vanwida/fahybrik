-- FAHYBRIK migration 0006: coach mass adjustments
--
-- Mass Adjustments (UX spec /docs/ux/10-coach-mass-adjustments.md, signed off
-- 2026-05-07). Pablo applies a single change (load %, volume %, exercise
-- refactor, insert/delete/reschedule session, private note) across many
-- athletes at once. Every commit is logged with full payload + the exact
-- assignments touched, so we can revert within 7 days.
--
-- Why two tables:
--   * coach_mass_adjustments — the action header (scope, type, payload,
--     totals, rollback window). One row per Apply click.
--   * coach_mass_adjustment_targets — per-affected-assignment audit trail
--     with prior values needed for rollback.
--
-- Why not just diff_json on audit_log: rollback within 7 days needs
-- structured query access ("what assignments were touched"), not free-form
-- diffs. audit_log still receives a row (action='create' on commit,
-- 'restore' on rollback) per FAHYBRIK convention.

begin;

create type coach_mass_adjustment_type as enum (
  'strength_load_pct',
  'running_volume_pct',
  'refactor_exercise',
  'insert_session',
  'delete_session',
  'reschedule_shift',
  'private_note'
);

create type coach_mass_adjustment_status as enum (
  'applied',
  'rolled_back'
);

create table coach_mass_adjustments (
  id                       bigint generated always as identity primary key,
  coach_id                 bigint not null
                             references coaches(id) on delete cascade,
  adjustment_type          coach_mass_adjustment_type not null,
  -- Snapshot of how Pablo selected scope (kind + filters or explicit ids).
  -- Kept for audit + history detail rendering. Shape:
  --   { kind: 'selection'|'filter'|'a_event'|'manual', ... }
  scope_filter_json        jsonb not null default '{}'::jsonb,
  -- Type-specific payload: { delta_pct }, { from_exercise_id, to_exercise_id },
  -- { template_id, day_offset }, { shift_days }, { note_body }, etc.
  adjustment_payload       jsonb not null default '{}'::jsonb,
  -- Athletes resolved at apply time (after exclusions). Stored verbatim so
  -- the history view stays stable even if athletes leave Pablo's cohort.
  athletes_affected_count  integer not null default 0,
  athletes_affected_json   jsonb not null default '[]'::jsonb,
  status                   coach_mass_adjustment_status not null default 'applied',
  applied_by_user_id       bigint not null
                             references users(id) on delete restrict,
  applied_at               timestamptz not null default now(),
  rollback_deadline        timestamptz not null,
  rolled_back_at           timestamptz,
  rolled_back_by_user_id   bigint references users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint coach_mass_adjustments_count_chk
    check (athletes_affected_count >= 0)
);

create index coach_mass_adjustments_coach_idx
  on coach_mass_adjustments (coach_id, applied_at desc);

create index coach_mass_adjustments_active_idx
  on coach_mass_adjustments (coach_id, rollback_deadline)
  where status = 'applied';

create trigger coach_mass_adjustments_set_updated_at
  before update on coach_mass_adjustments
  for each row execute function set_updated_at();

-- Per-assignment trail. Captures the *prior* state so rollback is a pure
-- restore from these rows (no need to recompute). For 'insert_session' the
-- prior_state_json is null and assignment_id points at the inserted row
-- (rollback deletes it). For 'delete_session'/'reschedule_shift' prior_state
-- holds the values before the change. For load/volume/note/refactor the
-- prior `notes` field is captured (we append a structured note prefix; the
-- adjustment lives in notes for now until per-athlete prescription override
-- table lands).
create table coach_mass_adjustment_targets (
  id                  bigint generated always as identity primary key,
  adjustment_id       bigint not null
                        references coach_mass_adjustments(id) on delete cascade,
  athlete_id          bigint not null references athletes(id) on delete cascade,
  assignment_id       bigint references workout_assignments(id) on delete set null,
  prior_state_json    jsonb,
  created_at          timestamptz not null default now()
);

create index coach_mass_adjustment_targets_adjustment_idx
  on coach_mass_adjustment_targets (adjustment_id);
create index coach_mass_adjustment_targets_assignment_idx
  on coach_mass_adjustment_targets (assignment_id);

-- Saved patterns Pablo wants to re-apply later ("Bump load TRANS +5% post-deload").
create table coach_mass_adjustment_patterns (
  id                bigint generated always as identity primary key,
  coach_id          bigint not null
                      references coaches(id) on delete cascade,
  name              text not null,
  adjustment_type   coach_mass_adjustment_type not null,
  scope_filter_json jsonb not null default '{}'::jsonb,
  payload_json      jsonb not null default '{}'::jsonb,
  use_count         integer not null default 0,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint coach_mass_adjustment_patterns_name_unique
    unique (coach_id, name)
);

create index coach_mass_adjustment_patterns_coach_idx
  on coach_mass_adjustment_patterns (coach_id, last_used_at desc nulls last);

create trigger coach_mass_adjustment_patterns_set_updated_at
  before update on coach_mass_adjustment_patterns
  for each row execute function set_updated_at();

commit;
