-- 0020: Multi-block structure for template_segments.
--
-- Adds columns to allow a template's segments to be grouped into internal
-- blocks (e.g. warmup + main + finisher) instead of being flattened into a
-- single part on load. All legacy segments get `block_position = 0`, so
-- existing templates keep behaving atomically (1 part) without any backfill.
--
-- - block_position: 0-based group index inside the template. All segments
--   in the same group → 1 WeekDayPart. Default 0 preserves legacy behavior.
-- - block_format:   optional format override for the group. NULL → inherit
--   `templates.format`.
-- - block_title:    optional human label for the group. NULL → "Bloque N"
--   (or the template name for the first group).
--
-- The new index supports the loader's ordering
-- (group by block_position, then by position within the group).
--
-- Additive + `IF NOT EXISTS` → safe to re-run (no-op on second apply).

begin;

alter table template_segments
  add column if not exists block_position int not null default 0,
  add column if not exists block_format text,
  add column if not exists block_title text;

create index if not exists template_segments_block_idx
  on template_segments (template_id, block_position, position);

commit;
