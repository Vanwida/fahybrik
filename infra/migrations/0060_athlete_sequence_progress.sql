-- 0060: ATHLETE SEQUENCE PROGRESS — enrollment cursor for the auto-walkthrough.
--
-- WHAT THIS TRACKS
-- ----------------
-- When a coach assigns a program_sequence (one matrix cell: level × days, 0059)
-- to an athlete, the athlete starts "walking" its ordered microciclos. This table
-- is the CURSOR: which sequence the athlete is on, and at which position (1-indexed
-- into program_sequence_items.position). The materialization itself (the dated
-- workout_assignments) is produced by the EXISTING month-instantiation pipeline
-- (instantiate-program.ts); this table only records WHERE the athlete is in the
-- sequence so the system knows what to materialize next.
--
-- WHY A NEW TABLE (not athlete_month_assignments from 0017)
-- --------------------------------------------------------
-- athlete_month_assignments records a single materialized microciclo (one
-- month_template_id + its date window + the microcycle_ids it produced). It has NO
-- sequence_id and NO position cursor — it cannot answer "which sequence is this
-- athlete on and how far along". It stays as-is (the materialization receipt /
-- audit trail); this table is the orthogonal enrollment state. One concern per
-- table: athlete_month_assignments = "what got materialized when",
-- athlete_sequence_progress = "where the athlete is in their sequence".
--
-- AGNOSTIC: FKs to the agnostic 0059 tables (program_sequences). NO program_level
-- enum, NO atr_block_type. coach_id is denormalized for the coach-scoped reads/
-- ownership guards (mirrors the column on program_sequences).
--
-- ADDITIVE & NON-BREAKING: only CREATE TABLE / index. Nothing dropped or altered.

begin;

create table if not exists athlete_sequence_progress (
  id               bigint generated always as identity primary key,
  athlete_id       bigint   not null references athletes(id)          on delete cascade,
  -- Denormalized coach for coach-scoped reads + ownership guards. Matches the
  -- coach that owns both the athlete and the sequence (enforced in app code).
  coach_id         bigint   not null references coaches(id)           on delete cascade,
  -- The sequence (matrix cell) the athlete is walking through (0059).
  sequence_id      bigint   not null references program_sequences(id) on delete cascade,
  -- 1-indexed cursor into program_sequence_items.position. Starts at 1 (first
  -- microciclo) on enrollment; advances as each microciclo completes.
  current_position smallint not null default 1,
  -- Lifecycle: active while walking the sequence; completed when the last
  -- microciclo finished (end_policy resolution happens at completion, later chunk).
  status           text     not null default 'active',
  started_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint athlete_sequence_progress_position_chk check (current_position >= 1),
  constraint athlete_sequence_progress_status_chk
    check (status in ('active', 'completed'))
);

-- One ACTIVE sequence per athlete at a time (an athlete walks ONE sequence).
-- Partial unique on status='active' lets historical 'completed' rows coexist.
create unique index if not exists athlete_sequence_progress_active_uq
  on athlete_sequence_progress (athlete_id)
  where status = 'active';

-- Coach-scoped lookups (roster views, "who is on which sequence").
create index if not exists athlete_sequence_progress_coach_idx
  on athlete_sequence_progress (coach_id, status);

-- Sequence-scoped lookups (athletes currently on a given sequence cell).
create index if not exists athlete_sequence_progress_sequence_idx
  on athlete_sequence_progress (sequence_id, status);

comment on table athlete_sequence_progress is
  '0060: enrollment cursor — which program_sequence (0059 matrix cell) an athlete is walking and at which position. The dated workout_assignments are materialized by the existing month-instantiation pipeline; this table only tracks WHERE the athlete is. One active row per athlete (partial unique on status=active).';
comment on column athlete_sequence_progress.current_position is
  '1-indexed cursor into program_sequence_items.position. Starts at 1 on enrollment; advances as each microciclo completes.';
comment on column athlete_sequence_progress.status is
  'active = walking the sequence | completed = last microciclo done (end_policy resolution is a later chunk).';

commit;
