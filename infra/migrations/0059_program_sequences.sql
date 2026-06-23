-- 0059: PROGRAM SEQUENCES — the agnostic periodization matrix (nivel × días).
--
-- WHAT A SEQUENCE IS
-- ------------------
-- A "Secuencia" is one cell of the matrix (level_id × days_per_week) for a coach:
-- an ORDERED list of microciclos (microciclo 1 → 2 → 3 …) that an athlete walks
-- through automatically, plus the policy for what happens when the last microciclo
-- finishes, plus the progression applied on each loop.
--
--   * "microciclo" in this DB = `program_month_templates` (a multi-week structure).
--     A sequence ORDERS those templates; it does not own them.
--   * Levels = `athlete_levels` (per coach, 0057). NEVER the `program_level` enum.
--   * Phases (optional per item) = `methodology_phases` (0052). NEVER atr_block_type.
--
-- WHY CLEAN NEW TABLES (not reusing 0014 program_macrocycle_*)
-- -----------------------------------------------------------
-- The 0014 macrocycle tables (program_macrocycle_templates / _blocks /
-- program_block_months) are orphaned (0 rows, 0 endpoints) AND carry non-agnostic
-- baggage that the agnostic model forbids:
--   * program_macrocycle_templates.level is the `program_level` ENUM (must be
--     athlete_levels FK).
--   * program_macrocycle_blocks.type is the `atr_block_type` ENUM (must be
--     methodology_phases FK).
--   * Wrong shape: they interpose a `block` layer, have NO days_per_week dimension,
--     and NO end-policy / progression-rule fields. Adapting = a rewrite.
-- They are LEFT UNTOUCHED here (additive/non-breaking). This migration adds two
-- new tables that reuse only the GOOD, live, agnostic-at-row-level table
-- `program_month_templates` as the microciclo FK.
--
-- ADDITIVE & NON-BREAKING: only CREATE TABLE / index. Nothing dropped or altered.

begin;

-- =============================================================================
-- program_sequences — one matrix cell: (coach_id × level_id × days_per_week).
-- end_policy = what happens after the last microciclo finishes.
-- progression_* = the per-loop increment applied when the cell loops/advances.
-- =============================================================================
create table if not exists program_sequences (
  id                     bigint generated always as identity primary key,
  coach_id               bigint   not null references coaches(id)        on delete cascade,
  -- AGNOSTIC level (per-coach data, 0057). NOT the program_level enum.
  level_id               bigint   not null references athlete_levels(id) on delete restrict,
  -- HYROX/hybrid training cadence. 3-6 sessions/week is the realistic band.
  days_per_week          smallint not null,
  -- What the athlete does after finishing the last microciclo of this cell:
  --   repeat   -> loop this same sequence again (applying progression_*).
  --   level_up -> graduate to the next athlete_level (next by sort_order).
  --   stop     -> the structured plan ends here.
  end_policy             text     not null default 'repeat',
  -- Per-loop progression: increment (%) applied to a target dimension on each
  -- repeat/level_up. Both NULL => the cell loops flat (no automatic increment).
  progression_pct        numeric(5,2),
  -- WHAT the increment applies to. Agnostic across modalities:
  --   strength_load -> %/kg on strength prescriptions.
  --   volume        -> distance/time/reps on conditioning.
  --   pace          -> target /km or /500m pace.
  progression_applies_to text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint program_sequences_days_chk
    check (days_per_week between 3 and 6),
  constraint program_sequences_end_policy_chk
    check (end_policy in ('repeat', 'level_up', 'stop')),
  constraint program_sequences_progression_pct_chk
    check (progression_pct is null or (progression_pct >= 0 and progression_pct <= 100)),
  constraint program_sequences_progression_applies_chk
    check (progression_applies_to is null
           or progression_applies_to in ('strength_load', 'volume', 'pace')),
  -- One sequence per matrix cell.
  constraint program_sequences_cell_uq
    unique (coach_id, level_id, days_per_week)
);

create index if not exists program_sequences_coach_idx
  on program_sequences (coach_id, level_id, days_per_week);

comment on table program_sequences is
  '0059: agnostic periodization matrix cell (coach × athlete_level × days_per_week). Ordered microciclos live in program_sequence_items. end_policy/progression_* drive the auto-walkthrough. Levels via athlete_levels (NOT program_level enum); phases via methodology_phases (NOT atr_block_type).';
comment on column program_sequences.end_policy is
  'After the last microciclo: repeat (loop) | level_up (next athlete_level by sort_order) | stop (plan ends). The level_up TARGET is derived from athlete_levels.sort_order, not stored, to keep one source of truth for level ordering.';
comment on column program_sequences.progression_applies_to is
  'Agnostic target of progression_pct: strength_load | volume | pace. NULL => no automatic increment on loop.';

-- =============================================================================
-- program_sequence_items — the ORDERED microciclos of a sequence.
-- position is 1-indexed and contiguous (server derives it from array order).
-- phase_id is an OPTIONAL methodology_phases label for the item.
-- =============================================================================
create table if not exists program_sequence_items (
  id                bigint   generated always as identity primary key,
  sequence_id       bigint   not null references program_sequences(id)        on delete cascade,
  position          smallint not null,
  -- The microciclo this slot points at (multi-week program_month_templates row).
  month_template_id bigint   not null references program_month_templates(id)  on delete restrict,
  -- OPTIONAL coach-defined phase label for this item (0052). NULL => no label.
  phase_id          bigint   references methodology_phases(id)                on delete set null,

  constraint program_sequence_items_position_chk check (position >= 1),
  constraint program_sequence_items_position_uq  unique (sequence_id, position)
);

create index if not exists program_sequence_items_sequence_idx
  on program_sequence_items (sequence_id, position);
create index if not exists program_sequence_items_month_idx
  on program_sequence_items (month_template_id);

comment on table program_sequence_items is
  '0059: ordered microciclos of a program_sequence. position 1..N contiguous (server-derived from array order). month_template_id = the microciclo (program_month_templates). phase_id = optional methodology_phases label.';

commit;
