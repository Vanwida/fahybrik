// Race-catalog scraper — the weekly sync orchestrator.
//
// Runs every registered adapter with Promise.allSettled so ONE failing source
// can never abort the others. Per source: fetch → upsert (in a transaction) →
// age out rows it stopped listing (only on a SUCCESSFUL run) → journal the run
// in catalog_sync_runs. A failed or empty source is recorded (ok=false) AND sent
// to the error sink, so a broken scraper is visible, never silent.
//
// IDEMPOTENT end-to-end: re-running upserts the same rows by (series, source_ref);
// a transient source outage ages NOTHING (the miss-sweep is gated on success).

import { sql as defaultSql, type Sql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';
import { CATALOG_SOURCES } from './registry';
import type { CatalogSource } from './types';
import { markMissesForSource, upsertCatalogEvents } from './upsert';

// A scraped row is "stale" once it has been missing for this many consecutive
// successful runs. Staleness is DERIVED from miss_count (no second flag) so
// there is one source of truth; readers use isCatalogRowStale().
export const STALE_AFTER_MISSES = 3;
export function isCatalogRowStale(missCount: number): boolean {
  return missCount >= STALE_AFTER_MISSES;
}

const SYNC_ROUTE = 'cron/sync-race-calendar';

export interface SourceRunResult {
  source: string;
  series: string;
  ok: boolean;
  events_found: number;
  events_upserted: number;
  events_aged: number;
  error: string | null;
  duration_ms: number;
}

export interface SyncResult {
  run_started_at: string;
  total_sources: number;
  ok_sources: number;
  failed_sources: number;
  total_upserted: number;
  results: SourceRunResult[];
}

async function journalRun(
  client: Sql,
  row: {
    source: string;
    series: string;
    started_at: Date;
    finished_at: Date;
    ok: boolean;
    events_found: number;
    events_upserted: number;
    error: string | null;
  },
): Promise<void> {
  try {
    await client`
      insert into catalog_sync_runs (
        source, series, started_at, finished_at,
        ok, events_found, events_upserted, error
      ) values (
        ${row.source}, ${row.series}, ${row.started_at}, ${row.finished_at},
        ${row.ok}, ${row.events_found}, ${row.events_upserted}, ${row.error}
      )
    `;
  } catch (err) {
    // Journalling is best-effort — never let it mask the real run result.
    captureRouteError(err, {
      route: `${SYNC_ROUTE}.journal`,
      meta: { source: row.source },
    });
  }
}

async function runSource(
  source: CatalogSource,
  runStartedAt: Date,
  client: Sql,
): Promise<SourceRunResult> {
  const startedAt = new Date();
  try {
    const events = await source.fetchEvents();

    // Upsert atomically per source: a mid-source DB error rolls back only this
    // source's writes (and the run is marked failed below).
    const upserted = await client.begin((tx) =>
      upsertCatalogEvents(source.series, events, runStartedAt, tx),
    );

    // A reachable-but-empty source is suspicious (likely a markup change), so we
    // treat 0 results as NOT ok — and crucially we do NOT age existing rows.
    const ok = events.length > 0;
    const eventsAged = ok
      ? await markMissesForSource(source.series, runStartedAt, client)
      : 0;

    const finishedAt = new Date();
    const error = ok ? null : 'Source returned 0 events';
    await journalRun(client, {
      source: source.series,
      series: source.series,
      started_at: startedAt,
      finished_at: finishedAt,
      ok,
      events_found: events.length,
      events_upserted: upserted,
      error,
    });
    if (!ok) {
      captureRouteError(new Error(`${source.label} returned 0 events`), {
        route: SYNC_ROUTE,
        meta: { source: source.series },
      });
    }

    return {
      source: source.series,
      series: source.series,
      ok,
      events_found: events.length,
      events_upserted: upserted,
      events_aged: eventsAged,
      error,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    };
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);
    await journalRun(client, {
      source: source.series,
      series: source.series,
      started_at: startedAt,
      finished_at: finishedAt,
      ok: false,
      events_found: 0,
      events_upserted: 0,
      error: message,
    });
    captureRouteError(err, {
      route: SYNC_ROUTE,
      meta: { source: source.series },
    });
    return {
      source: source.series,
      series: source.series,
      ok: false,
      events_found: 0,
      events_upserted: 0,
      events_aged: 0,
      error: message,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    };
  }
}

/** Run every adapter, upsert into the catalog, journal each run. Never throws. */
export async function syncRaceCalendar(
  client: Sql = defaultSql,
): Promise<SyncResult> {
  const runStartedAt = new Date();

  const settled = await Promise.allSettled(
    CATALOG_SOURCES.map((source) => runSource(source, runStartedAt, client)),
  );

  const results: SourceRunResult[] = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') return outcome.value;
    // runSource catches internally, so this is a defensive fallback only.
    const source = CATALOG_SOURCES[i];
    return {
      source: source?.series ?? 'unknown',
      series: source?.series ?? 'unknown',
      ok: false,
      events_found: 0,
      events_upserted: 0,
      events_aged: 0,
      error: String(outcome.reason),
      duration_ms: 0,
    };
  });

  const okSources = results.filter((r) => r.ok).length;
  return {
    run_started_at: runStartedAt.toISOString(),
    total_sources: results.length,
    ok_sources: okSources,
    failed_sources: results.length - okSources,
    total_upserted: results.reduce((acc, r) => acc + r.events_upserted, 0),
    results,
  };
}
