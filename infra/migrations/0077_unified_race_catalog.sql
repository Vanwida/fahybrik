-- FAHYBRIK migration 0077: unified race system — additive schema.
--
-- Unifies the per-athlete `races` spine with the shared `events` catalog so ONE
-- model carries a competition FUTURE→PAST. This migration only ADDS columns; the
-- legacy duplicated tables (athlete_target_events, race_plans/results/debriefs)
-- are dropped in a SEPARATE later migration, AFTER the readers are repointed.
--
--   * races.event_id   — links a personal objective/result to the shared catalog
--                        row (nullable: manual/imported races may have no catalog
--                        match yet). ON DELETE SET NULL — deleting a catalog event
--                        never deletes the athlete's own race; it just unlinks.
--   * events.series / is_tentative / source / source_ref — the shared FUTURE
--                        catalog metadata the phase-2 scrapers fill. events already
--                        carries location/country/region/start_date/end_date/
--                        division_options[], so series×city×date×divisions needs NO
--                        third table. unique(series, source_ref) = scraper idempotency.
--   * athletes.hyresult_slug — the auto-import linchpin: phase 2 stores it at the
--                        "¿eres tú?" confirm so the result cron knows whose page to
--                        read. Added now so the column exists ahead of that work.

begin;

-- =============================================================================
-- races.event_id — personal race → shared catalog link
-- =============================================================================
alter table races
  add column if not exists event_id bigint references events(id) on delete set null;

create index if not exists races_event_id_idx
  on races (event_id) where event_id is not null;

-- =============================================================================
-- events — shared FUTURE catalog metadata (scraper-sourced rows)
-- =============================================================================
alter table events add column if not exists series text;
alter table events add column if not exists is_tentative boolean not null default false;
alter table events add column if not exists source text;
alter table events add column if not exists source_ref text;

-- Known HYROX-adjacent series + an 'other' escape (agnostic: a soft whitelist,
-- not a hardcoded enum — adding a series later is a one-line constraint bump).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_series_chk') then
    alter table events add constraint events_series_chk
      check (series is null or series in ('hyrox', 'deka', 'athx', 'deadly_dozen', 'other'));
  end if;
end $$;

-- One catalog row per (series, source_ref) — re-scraping the same source event is
-- an idempotent upsert, never a duplicate. Partial: rows without a source_ref
-- (manual events Pablo creates by hand) are unconstrained.
create unique index if not exists events_series_source_ref_unique
  on events (series, source_ref)
  where series is not null and source_ref is not null;

-- =============================================================================
-- athletes.hyresult_slug — auto-import linchpin (phase 2 writes it)
-- =============================================================================
alter table athletes add column if not exists hyresult_slug text;

create index if not exists athletes_hyresult_slug_idx
  on athletes (hyresult_slug) where hyresult_slug is not null;

commit;
