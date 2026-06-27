// Race-catalog scraper — the DB write primitives.
//
// `upsertCatalogEvents` writes a source's normalized events into the shared
// `events` catalog, keyed by (series, source_ref) (migration 0077). It is
// IDEMPOTENT: re-scraping the same event updates the same row, never duplicates.
// `markMissesForSource` ages out rows a source stopped listing, WITHOUT deleting
// them. Both primitives NEVER touch a coach-verified row.

import type { Sql, TransactionClient } from '@/lib/db';
import type { CatalogEvent, CatalogSeries } from './types';
import { catalogSlug, regionForCountry, seriesToEventType } from './normalize';

type Client = Sql | TransactionClient;

/**
 * Upsert one source's events into `events`. Returns the number of rows actually
 * written (inserts + updates) — rows locked by `verified_by_coach_id` are
 * skipped and NOT counted.
 *
 * On INSERT we set is_visible_to_athletes = false (Pablo curates which scraped
 * events athletes see) and the deterministic slug. On CONFLICT we refresh the
 * scraped facts but deliberately do NOT overwrite: slug, is_visible_to_athletes,
 * division (headline), or created_by_coach_id — those are coach-owned. The
 * `where events.verified_by_user_id is null` clause makes a coach/admin-verified
 * row a no-op on conflict (skipped, no error) — the override contract reserved by
 * migration 0079_events_verified_by.
 *
 * `runStartedAt` is the single per-run timestamp stamped onto last_seen_at so the
 * miss-sweep can tell "seen this run" from "missing this run" with no clock skew.
 */
export async function upsertCatalogEvents(
  series: CatalogSeries,
  events: CatalogEvent[],
  runStartedAt: Date,
  client: Client,
): Promise<number> {
  let written = 0;

  for (const ev of events) {
    if (ev.series !== series) continue; // adapter/source mismatch guard
    const slug = catalogSlug(series, ev.source_ref);
    const type = seriesToEventType(series);
    const region = ev.region ?? regionForCountry(ev.country);

    const rows = await client<{ id: string }[]>`
      insert into events (
        slug, name, type, location, country, region,
        start_date, end_date, division_options, source_url,
        series, source, source_ref, is_tentative,
        is_visible_to_athletes, last_seen_at, miss_count, updated_at
      ) values (
        ${slug}, ${ev.name}, ${type}, ${ev.city}, ${ev.country}, ${region},
        ${ev.start_date}, ${ev.end_date}, ${ev.division_options}, ${ev.source_url},
        ${series}, ${series}, ${ev.source_ref}, ${ev.is_tentative},
        false, ${runStartedAt}, 0, now()
      )
      on conflict (series, source_ref)
        where series is not null and source_ref is not null
      do update set
        name             = excluded.name,
        type             = excluded.type,
        location         = excluded.location,
        country          = excluded.country,
        region           = excluded.region,
        start_date       = excluded.start_date,
        end_date         = excluded.end_date,
        division_options = excluded.division_options,
        source_url       = excluded.source_url,
        source           = excluded.source,
        is_tentative     = excluded.is_tentative,
        last_seen_at     = excluded.last_seen_at,
        miss_count       = 0,
        updated_at       = now()
      where events.verified_by_user_id is null
      returning id::text as id
    `;
    if (rows.length > 0) written += 1;
  }

  return written;
}

/**
 * Increment miss_count for this series' scraped rows that were NOT seen in the
 * current run (last_seen_at older than runStartedAt, or never set). Verified
 * rows are skipped. Rows are NEVER deleted here — a row that reappears later has
 * its miss_count reset to 0 by the upsert above. Returns the number of rows aged.
 *
 * CALL THIS ONLY for a source whose run SUCCEEDED with results — never after a
 * transport/parse failure, or a transient outage would wrongly age the catalog.
 */
export async function markMissesForSource(
  series: CatalogSeries,
  runStartedAt: Date,
  client: Client,
): Promise<number> {
  const rows = await client<{ id: string }[]>`
    update events set
      miss_count = miss_count + 1,
      updated_at = now()
    where series = ${series}
      and source is not null
      and verified_by_user_id is null
      and (last_seen_at is null or last_seen_at < ${runStartedAt})
    returning id::text as id
  `;
  return rows.length;
}
