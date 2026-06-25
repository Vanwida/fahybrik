-- 0054: HYROX result import — additive columns on `races`.
--
-- WHY
-- ---
-- An imported HYROX official result is a FACTUAL race record that is PER-ATHLETE
-- and may have NO coach race_plan. The existing `race_results` table (0008)
-- requires a NOT NULL `race_plan_id` FK — it models "the result of a race the
-- coach planned", not "I pasted my official HYROX result". So `race_results` is
-- the wrong home as-is.
--
-- The per-athlete `races` table (0046) already owns the competition identity:
-- athlete_id, result_time_seconds, division, format, event_type, race_date,
-- location, age_group, status. An imported result is just a FULLER `races` row —
-- the official splits/ranks/percentile that the athlete couldn't enter by hand.
-- So we EXTEND `races` additively. One home for "an athlete's races", no split
-- across two tables.
--
-- WHAT (all additive — nullable columns + indexes, never touches existing data)
-- ----
--   * run_splits_json       — 8 ints (seconds), run 1..8 in order. [] when manual.
--   * station_splits_json   — 8 objects {index, seconds, rank} where `index` is
--                             the canonical 16-element station_index (2,4,…,16,
--                             see shared race-plan STATION_INDEX_STATION) so it
--                             reconciles with race_plan station_pacing/actuals.
--                             `seconds`/`rank` null when the source had no value.
--   * roxzone_seconds       — total transition (roxzone) time.
--   * run_total_seconds     — sum of the 8 runs (HYROX "Running" total).
--   * best_run_lap_seconds  — fastest single 1km run lap.
--   * overall_rank          — placing in the gender field (M/W).
--   * age_group_rank        — placing within the athlete's age group.
--   * field_size            — size of the gender field, for percentile.
--   * nationality           — IOC 3-letter code (e.g. IRL).
--   * bib                   — start number.
--   * source                — provenance enum-ish text ('hyrox_import' | 'manual').
--   * source_idp/_event/_season/_url — the HYROX result identifiers, so a
--                             re-import can dedupe and refresh in place.
--   * imported_at           — when the import ran.
--
-- DEDUPE: a partial unique index on (athlete_id, source_idp) where source_idp is
-- not null. The same athlete pasting the same HYROX detail link twice updates
-- the existing row instead of creating a duplicate. Manual races (source_idp
-- null) are unaffected.
--
-- Note: `age_group`, `division`, `result_time_seconds`, `race_date`, `location`,
-- `name`, `event_type`, `format` already exist on `races` (0046) and are
-- populated by the importer — they are NOT re-declared here.
--
-- Idempotent: every column `add column if not exists`; index `if not exists`.
-- The migrate runner journals by filename stem (0054_race_hyrox_import).

begin;

alter table races
  add column if not exists run_splits_json      jsonb,
  add column if not exists station_splits_json  jsonb,
  add column if not exists roxzone_seconds       int,
  add column if not exists run_total_seconds     int,
  add column if not exists best_run_lap_seconds  int,
  add column if not exists overall_rank          int,
  add column if not exists age_group_rank        int,
  add column if not exists field_size            int,
  add column if not exists nationality           text,
  add column if not exists bib                   text,
  add column if not exists source                text not null default 'manual',
  add column if not exists source_idp            text,
  add column if not exists source_event          text,
  add column if not exists source_season         text,
  add column if not exists source_url            text,
  add column if not exists imported_at           timestamptz;

-- Defensive bounds. All nullable, so the check passes for manual rows (null) and
-- only constrains imported values. Times in seconds; ranks/field 1-based.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'races_roxzone_chk') then
    alter table races add constraint races_roxzone_chk
      check (roxzone_seconds is null or roxzone_seconds between 0 and 7200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_run_total_chk') then
    alter table races add constraint races_run_total_chk
      check (run_total_seconds is null or run_total_seconds between 0 and 14400);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_best_lap_chk') then
    alter table races add constraint races_best_lap_chk
      check (best_run_lap_seconds is null or best_run_lap_seconds between 0 and 3600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_overall_rank_chk') then
    alter table races add constraint races_overall_rank_chk
      check (overall_rank is null or overall_rank > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_ag_rank_chk') then
    alter table races add constraint races_ag_rank_chk
      check (age_group_rank is null or age_group_rank > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_field_size_chk') then
    alter table races add constraint races_field_size_chk
      check (field_size is null or field_size > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_source_chk') then
    alter table races add constraint races_source_chk
      check (source in ('manual', 'hyrox_import'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'races_nationality_chk') then
    alter table races add constraint races_nationality_chk
      check (nationality is null or length(nationality) between 1 and 8);
  end if;
end
$$;

-- DEDUPE: one imported result per (athlete, HYROX idp). Re-importing the same
-- link upserts. Manual races (source_idp null) excluded from the constraint.
create unique index if not exists races_athlete_source_idp_unique_idx
  on races (athlete_id, source_idp)
  where source_idp is not null;

commit;
