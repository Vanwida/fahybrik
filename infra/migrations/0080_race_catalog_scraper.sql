-- FAHYBRIK migration 0080: race-catalog scraper support (phase 2a).
--
-- Phase 1 (0077) gave `events` the catalog metadata (series / source / source_ref
-- + unique(series, source_ref)); 0079_events_verified_by added verified_by_user_id
-- (the human-curation lock the scraper must honour). This migration adds the
-- remaining columns the weekly scraper cron needs to run SAFELY and HONESTLY,
-- plus a per-run journal so a broken scraper is visible, never silent.
--
--   * events.start_date → NULLABLE. A venue announced without a confirmed date
--     ("DATE COMING SOON") is stored honestly with start_date = NULL +
--     is_tentative = true. We NEVER invent a placeholder date (the project's
--     no-fabrication rule). 0001 made it NOT NULL when the only writer was Pablo
--     creating dated events by hand; the scraper changes that premise. This is a
--     pure constraint RELAXATION — existing dated rows are untouched, and the one
--     athlete-facing reader (race-calendar) filters undated rows out via
--     coalesce(end_date, start_date) >= today.
--
--   * events.last_seen_at / miss_count → scraper freshness. Every successful
--     upsert stamps last_seen_at and resets miss_count = 0. After a SUCCESSFUL
--     run for a source, rows of that source NOT seen this run get miss_count += 1
--     (they are NOT deleted — a transient source outage must never wipe the
--     catalog). A row is "stale" once miss_count crosses the app-level threshold
--     (lib/races/calendar/sync.ts STALE_AFTER_MISSES); staleness is derived from
--     miss_count, not a second flag (one source of truth).
--
--   * catalog_sync_runs → one row per (source, run): ok/failed, counts, error.
--     The cron writes it so scraper health is queryable history, not just logs —
--     a zero-result or failed source surfaces here AND in the error sink.
--
-- The coach/admin override lock the scraper honours (verified_by_user_id) is NOT
-- re-added here — it already exists from 0079_events_verified_by. The upsert
-- guards its UPDATE branch with `where events.verified_by_user_id is null`.
--
-- All additive / constraint-relaxing. Idempotent (if not exists / drop-if). The
-- migrate runner wraps the file in one transaction.

begin;

-- =============================================================================
-- events: honest-null dates + scraper freshness
-- =============================================================================
alter table events alter column start_date drop not null;

alter table events add column if not exists last_seen_at timestamptz;
alter table events add column if not exists miss_count int not null default 0;

-- The per-source miss sweep filters by source; index it.
create index if not exists events_source_idx
  on events (source) where source is not null;

-- =============================================================================
-- catalog_sync_runs: per-source run journal (scraper observability)
-- =============================================================================
create table if not exists catalog_sync_runs (
  id              bigserial primary key,
  -- Adapter identity: the source key ('hyrox' | 'deka' | 'athx' | 'deadly_dozen')
  -- and the series it feeds (same set; kept distinct for forward flexibility).
  source          text not null,
  series          text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  -- false = the adapter threw (transport/parse) OR returned zero events. Either
  -- way the run is flagged so a broken scraper surfaces.
  ok              boolean not null,
  events_found    int not null default 0,
  events_upserted int not null default 0,
  -- Error message when ok = false (transport/parse failure, or "0 results").
  error           text,
  created_at      timestamptz not null default now()
);

-- "Latest run per source" + "recent failures" reads.
create index if not exists catalog_sync_runs_source_idx
  on catalog_sync_runs (source, started_at desc);
create index if not exists catalog_sync_runs_failures_idx
  on catalog_sync_runs (started_at desc) where ok = false;

commit;
