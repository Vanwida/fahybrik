-- 0064_drop_phase_entity_and_legacy_level.sql
--
-- WHY:
--   The periodization "phase" ENTITY is removed entirely. A microciclo's identity
--   is now just NAME + level (athlete_levels FK, level_id) + nº weeks. The ORDER of
--   microciclos within a sequence IS the periodization — there is no phase catalog,
--   no phase_id, no role/color axis.
--
--   This migration:
--     - drops phase_id from every table that referenced the phase entity
--     - drops the methodology_phases table (the phase catalog)
--     - purges the legacy program_level enum and its `level` columns on the
--       program_*_templates tables (superseded by level_id -> athlete_levels)
--     - purges the legacy atr_block_hint columns (the dead phase-hint shim)
--
--   KEPT (out of scope — separate future task; deleting breaks the live iOS
--   ATR-macrocycle serving endpoint): tables atr_blocks, atr_macrocycles,
--   microcycles and the enum atr_block_type. atr_blocks.type STAYS.
--
-- Idempotent: every statement uses IF EXISTS.

begin;

-- 1. Drop phase_id from the phase-entity consumers ----------------------------
alter table atr_blocks                 drop column if exists phase_id;
alter table program_month_templates    drop column if exists phase_id;
alter table program_week_templates     drop column if exists phase_id;
alter table program_sequence_items     drop column if exists phase_id;

-- 2. Drop the phase catalog ---------------------------------------------------
drop table if exists methodology_phases;

-- 3. Purge legacy atr_block_hint columns --------------------------------------
alter table blocks                     drop column if exists atr_block_hint;
alter table program_month_templates    drop column if exists atr_block_hint;
alter table program_week_templates     drop column if exists atr_block_hint;

-- 4. Purge legacy program_level enum + its `level` columns --------------------
--    (program_level is used ONLY by these 3 template tables' `level` columns;
--     level_id -> athlete_levels is the replacement)
alter table program_week_templates       drop column if exists level;
alter table program_month_templates      drop column if exists level;
alter table program_macrocycle_templates drop column if exists level;
drop type if exists program_level;

commit;
