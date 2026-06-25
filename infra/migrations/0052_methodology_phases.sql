-- 0052: METHODOLOGY PHASES — coach-agnostic periodization phases.
--
-- WHY
-- ---
-- Periodization phases were hardcoded as the global enum `atr_block_type`
-- ('ACC','TRANS','REAL') (0001_init §Enums, line 53) with labels/colors baked
-- into web/lib/dashboard/constants/atr-phases.ts. That assumed ONE coach with ONE
-- methodology (Pablo's ATR / Issurin block periodization). FAHYBRIK is going
-- multi-coach: a coach may run a 4-phase linear model, a 2-phase block, a
-- conjugate scheme, etc. Phases must be coach-defined DATA with an ARBITRARY
-- count, not a closed global enum.
--
-- AGNOSTIC AXIS (the design key)
-- ------------------------------
-- Label/code are FREE per coach (no global CHECK) so any naming works. But the
-- UI still needs a generic green->amber->red intensity ramp for ANY phase set.
-- We get that from `role` — a SMALL closed axis describing what the phase DOES
-- (volume | intensity | peak | recovery | maintenance). The resolver maps role
-- -> an existing design token. `color` is an optional explicit override.
--
-- ADDITIVE & NON-BREAKING (hard constraint)
-- -----------------------------------------
--   * The `atr_block_type` enum and `atr_blocks.type` column are KEPT as the
--     legacy/fallback. Nothing existing is dropped or altered in behavior.
--   * `atr_blocks.phase_id` is added NULLABLE. Pre-migration reads and the
--     resolver's fallback path (phase_id null OR coach has no phases) return the
--     current ATR labels/colors, so the running app + iOS + /hoy keep working.
--   * Seed + data-migrate are IDEMPOTENT (on conflict do nothing / guarded
--     update), safe to apply once or re-run.
--
-- NOTE: phase NAMES seeded here use Alex's assignment ground-truth
-- (Acumulación / Transformación / Realización) — these are now EDITABLE data,
-- not hardcoded strings. The legacy code-side labels (Intensificación / Tapering
-- in atr-phases.ts) remain the FALLBACK for any block still on the enum path.

begin;

-- =============================================================================
-- methodology_phases — per-coach, arbitrary-count periodization phases.
-- =============================================================================
create table if not exists methodology_phases (
  id              bigint generated always as identity primary key,
  coach_id        bigint not null references coaches(id) on delete cascade,
  -- Stable per-coach machine code (e.g. 'acc'). FREE string, no global enum.
  code            text not null,
  -- Athlete/coach-facing display name. FREE string (editable by the coach).
  label           text not null,
  -- AGNOSTIC intensity/color axis. Small closed set -> drives the generic
  -- green->amber->red ramp + AI semantics. The ONLY constrained dimension.
  role            text not null
                    check (role in ('volume','intensity','peak','recovery','maintenance')),
  -- Explicit color override (hex or css token). NULL -> derived from `role`.
  color           text,
  -- Default duration in microcycles (weeks). NULL = coach decides per use.
  default_weeks   int,
  -- Temporal order within the coach's macrocycle (0- or 1-indexed by coach).
  sequence_order  int not null,
  -- Deload/recovery week flag (orthogonal to role; a 'recovery' phase or a
  -- deload micro inside any phase).
  is_deload       boolean not null default false,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint methodology_phases_code_unique unique (coach_id, code),
  constraint methodology_phases_default_weeks_chk check (default_weeks is null or default_weeks >= 1)
);

create index if not exists methodology_phases_coach_seq_idx
  on methodology_phases (coach_id, sequence_order);

comment on table methodology_phases is
  '0052: per-coach periodization phases (arbitrary count). Replaces the hardcoded atr_block_type enum as the source of phase identity. label/code are FREE per coach; role is the agnostic closed axis (volume|intensity|peak|recovery|maintenance) that drives the generic color ramp + AI semantics.';
comment on column methodology_phases.role is
  'Agnostic intensity axis: volume->green, intensity->amber, peak->red, recovery->blue, maintenance->neutral. The only constrained dimension; everything else is coach data.';
comment on column methodology_phases.color is
  'Optional explicit color override (hex or css var). NULL => resolver derives from role.';

-- =============================================================================
-- atr_blocks.phase_id — link a block to a coach-defined phase (additive).
-- The legacy `type` (atr_block_type) column is KEPT as fallback. A block whose
-- phase_id is NULL falls back to `type` via the resolver, so nothing breaks.
-- =============================================================================
alter table atr_blocks
  add column if not exists phase_id bigint references methodology_phases(id) on delete set null;

create index if not exists atr_blocks_phase_idx on atr_blocks (phase_id);

comment on column atr_blocks.phase_id is
  '0052: FK to methodology_phases (coach-defined phase). NULL => fall back to legacy `type` enum (additive/non-breaking).';

-- =============================================================================
-- SEED — default ATR phase set for EVERY existing coach. Idempotent.
-- Names = Alex assignment ground-truth (Acumulación / Transformación /
-- Realización). Optional Deload (role 'recovery').
-- =============================================================================
insert into methodology_phases
  (coach_id, code, label, role, default_weeks, sequence_order, is_deload, description)
select c.id, p.code, p.label, p.role, p.default_weeks, p.sequence_order, p.is_deload, p.description
from coaches c
cross join (values
  ('acc',    'Acumulación',    'volume',    5, 1, false, 'Volumen alto, intensidad moderada. Construir base.'),
  ('trans',  'Transformación', 'intensity', 4, 2, false, 'Sube intensidad, baja volumen. Trabajo específico.'),
  ('real',   'Realización',    'peak',      3, 3, false, 'Descarga previa a competir. Afinar y recuperar.'),
  ('deload', 'Descarga',       'recovery',  1, 4, true,  'Semana de descarga: bajar carga para recuperar y supercompensar.')
) as p(code, label, role, default_weeks, sequence_order, is_deload, description)
on conflict (coach_id, code) do nothing;

-- =============================================================================
-- DATA-MIGRATE — point each existing atr_block at its coach's seeded phase that
-- matches the legacy enum value. Idempotent (only fills NULLs). ACC->acc,
-- TRANS->trans, REAL->real.
-- =============================================================================
update atr_blocks ab
set phase_id = mp.id,
    updated_at = now()
from atr_macrocycles m
join athletes a on a.id = m.athlete_id
join methodology_phases mp on mp.coach_id = a.coach_id
where ab.macrocycle_id = m.id
  and a.coach_id is not null
  and ab.phase_id is null
  and mp.code = case ab.type
                  when 'ACC'   then 'acc'
                  when 'TRANS' then 'trans'
                  when 'REAL'  then 'real'
                end;

commit;
