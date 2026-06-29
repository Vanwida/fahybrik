-- 0088: honest work logging — prescribed/actual/skipped + per-set strength detail.
--
-- WHY
-- ---
-- Until now a logged segment carried only `reps_completed` / `weight_used_kg` —
-- the ACTUAL numbers — with no way to say WHAT was prescribed, whether the
-- athlete actually CONFIRMED the value or merely advanced past it, and no honest
-- representation of a SKIP. The live timer "primed" reps to the prescribed value;
-- if the athlete never touched it the prescribed number was logged as if achieved,
-- and a skip silently became a fabricated 0. That corrupts every downstream
-- analytic (volume, compliance, load).
--
-- THE MODEL (locked contract — iOS + web + DB byte-for-byte)
-- ---------------------------------------------------------
-- Per logged unit of work there are THREE honest states + a confidence flag:
--   done    : actual == prescribed
--   scaled  : actual != prescribed (athlete did do it, just different)
--   skipped : not done  → actual = NULL  (never a fabricated 0)
--   confirmed (bool): TRUE iff the athlete explicitly touched/confirmed the value;
--                     FALSE = assumed from the prescription (advanced past).
-- A real `0` is legal ONLY for open/AMRAP score-reps; a silent fabricated `0` is
-- the cardinal sin and must never be written.
--
-- WHAT
-- ----
-- segment_executions gains the prescribed/status/confirmation/scaling fields.
-- `reps_completed` STAYS = the ACTUAL completed reps (NULL when skipped) and
-- `weight_used_kg` STAYS = actual load — we are NOT renaming them (6 coach-
-- analytics readers depend on those exact columns). For per-set strength work a
-- new `set_executions` table holds the rich per-set detail (explicit columns, no
-- JSON), keyed to its parent segment and idempotently re-syncable.
--
-- ADDITIVE + idempotent: `add column if not exists` / `create table if not exists`
-- touch nothing existing; zero backfill. The migrate runner journals by filename
-- stem (0088_honest_work_logging).

begin;

-- Honest-logging fields on the segment aggregate. Each column's CHECK is inline
-- so it is created exactly once, together with the column (the `if not exists`
-- guard skips the whole clause when the column already exists → idempotent).
alter table segment_executions
  -- What the prescription called for (separate from the actual `reps_completed`).
  add column if not exists reps_prescribed integer,
  -- done | scaled | skipped — derived server-side when the client omits it.
  add column if not exists reps_status text
    check (reps_status in ('done', 'scaled', 'skipped')),
  -- TRUE iff the athlete explicitly confirmed the value; FALSE = assumed from
  -- the prescription (advanced past without acting).
  add column if not exists reps_confirmed boolean not null default false,
  -- Warmup/cooldown completion-only marker — EXCLUDED from volume/analytics.
  add column if not exists is_structural boolean not null default false,
  -- Metcon-family Rx/Scaled toggle for the whole block.
  add column if not exists rx_scaled text
    check (rx_scaled in ('rx', 'scaled')),
  -- Free-text "how it was scaled" note (optional).
  add column if not exists scaled_note text;

-- Per-set strength detail. One row per working set of a `.strength` segment;
-- the parent segment_executions row keeps the back-compat aggregate
-- (reps_completed = Σ set reps_actual, weight_used_kg = representative load).
-- Explicit columns (project rule: no JSON blobs for first-class data).
create table if not exists set_executions (
  id                   bigint generated always as identity primary key,
  segment_execution_id bigint not null references segment_executions(id) on delete cascade,
  set_index            integer not null check (set_index >= 1),
  reps_prescribed      integer,
  -- NULL only when the set was skipped — never a fabricated 0.
  reps_actual          integer,
  load_prescribed_kg   numeric(6, 2),
  load_actual_kg       numeric(6, 2),
  rpe                  numeric(3, 1) check (rpe >= 0 and rpe <= 10),
  rir                  numeric(3, 1) check (rir >= 0 and rir <= 10),
  status               text not null default 'done'
    check (status in ('done', 'scaled', 'skipped')),
  confirmed            boolean not null default false,
  tempo                text,
  rest_s               integer check (rest_s >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- One row per set per segment — the delete-then-insert re-sync target.
  unique (segment_execution_id, set_index)
);

-- Per-segment fetch of its sets (the SessionDetail reader joins on this FK).
create index if not exists set_executions_segment_execution_idx
  on set_executions (segment_execution_id);

comment on table set_executions is
  'Per-set strength detail for a segment_executions row (reps/load/RPE/RIR/tempo/rest, honest status + confirmation). The parent segment keeps the back-compat aggregate; per-set re-sync is delete-then-insert by segment_execution_id.';

commit;
