-- 0063: AGNOSTIC level_id + phase_id on microciclo templates (month + week).
--
-- WHY
-- ---
-- The microciclo subsystem (`program_month_templates` / `program_week_templates`)
-- is the lone holdout still keying LEVEL on the legacy `program_level` enum
-- (beginner/intermediate/pro/elite) and PHASE on the ATR `atr_block_type` enum
-- (ACC/TRANS/REAL). Every other surface already moved to the per-coach AGNOSTIC
-- catalogs:
--   * 0052  atr_blocks.phase_id            -> methodology_phases
--   * 0057  blocks.min_level_id / athletes.level_id -> athlete_levels
--   * 0059  program_sequence slot phase_id -> methodology_phases (optional)
-- This extends the SAME established pattern to the microciclo templates so a
-- microciclo created from scratch carries the coach's REAL level + optional
-- phase (coach DATA, never a hardcoded ATR/level list).
--
-- ADDITIVE & NON-BREAKING
-- -----------------------
--   * Both columns are NULLABLE FKs — existing rows keep level_id/phase_id NULL
--     and continue to display via the legacy enum fallback (resolver pattern).
--   * The legacy `level` (NOT NULL) and `atr_block_hint` columns are UNTOUCHED,
--     so the editor / duplicate / list / assign paths keep working unchanged.
--   * `on delete set null`: removing a level/phase from the catalog degrades the
--     microciclo to the enum fallback, never orphans it.

begin;

alter table program_month_templates
  add column if not exists level_id bigint references athlete_levels(id) on delete set null,
  add column if not exists phase_id bigint references methodology_phases(id) on delete set null;

alter table program_week_templates
  add column if not exists level_id bigint references athlete_levels(id) on delete set null,
  add column if not exists phase_id bigint references methodology_phases(id) on delete set null;

create index if not exists program_month_templates_level_idx on program_month_templates (level_id);
create index if not exists program_week_templates_level_idx  on program_week_templates  (level_id);

commit;
