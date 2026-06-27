import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { importAllRaces } from '@/lib/hyrox/hyresult';

// =============================================================================
// AUTO-RESULT-ON-PASS (phase 2b of the unified race system).
//
// When a target/registered race's date has passed without a result, AND the
// athlete is linked to a hyresult profile (athletes.hyresult_slug, stored at the
// "¿eres tú?" confirm), re-pull their full hyresult history. importAllRaces is
// idempotent on (athlete_id, source_idp) AND reconciles each completed result
// against the athlete's pending objectives: the result that corresponds to the
// passed target ADOPTS that planned row in place (no duplicate), and any race
// the coach never tracked lands as a fresh `tune_up` row.
//
// GIVE-UP GUARD (migration 0081): an UNMATCHABLE target — the athlete never raced
// it, a DNS, a venue/format the importer can't reconcile — must NOT keep an
// athlete "due" forever (re-scraping their whole history every run). Two bounds:
//   * WINDOW   — only chase targets whose date passed within the last N weeks.
//   * ATTEMPTS — drop a target after MAX tries (auto_import_attempts, bumped each
//                run for the targets that stayed unmatched).
// Once a target is matched it gets a source_idp and stops being pending; once it
// crosses either bound it stops being due. No infinite re-scrape.
// =============================================================================

// Only chase a target whose date passed within this window. Older targets are
// almost certainly never going to resolve (a no-show, an off-platform race); they
// age out instead of being re-scraped forever.
export const AUTO_IMPORT_WINDOW_WEEKS = 8;

// Give up on a still-unmatched target after this many cron passes. Generous
// enough to cover a slow result-publication lag, bounded so a permanently
// unmatchable target stops costing a full-history scrape every day.
export const MAX_AUTO_IMPORT_ATTEMPTS = 4;

export interface AutoImportResultsSummary {
  // Athletes with an IN-BOUNDS passed target + a hyresult_slug → attempted.
  considered: number;
  succeeded: number;
  failed: number;
  // Athletes with a passed target but NO slug → can't auto-import (observability).
  skipped_no_slug: number;
  // Athletes whose passed targets are ALL bounded out (attempts >= MAX) — we
  // chased and gave up. Surfaced so a chronically-unmatchable target is visible,
  // never silently dropped.
  gave_up: number;
  // Per-athlete failures (athlete_id + message; not PII) so Vercel logs the full
  // picture without a side table.
  errors: { athlete_id: number; message: string }[];
}

interface DueAthlete {
  athlete_id: number;
  slug: string;
}

// The "passed pending objective" predicates, shared so the due-list and the
// observability counts never drift. A pending objective = a planned/registered
// race with no result yet (a pure objective, not an imported row) whose real date
// passed within the chase window. `due` additionally requires a slug AND
// attempts under the cap; `gaveUp` is the chased-but-capped set; `noSlug` is the
// can't-attempt set.
function passedPendingRaceQueries(client: Sql) {
  return {
    due: client<DueAthlete[]>`
      select distinct a.id::int as athlete_id, a.hyresult_slug as slug
      from athletes a
      join races r on r.athlete_id = a.id
      where a.hyresult_slug is not null
        and r.status in ('planned', 'registered')
        and r.result_time_seconds is null
        and r.source_idp is null
        and r.race_date is not null
        and r.race_date < current_date
        and r.race_date >= current_date - make_interval(weeks => ${AUTO_IMPORT_WINDOW_WEEKS})
        and r.auto_import_attempts < ${MAX_AUTO_IMPORT_ATTEMPTS}
      order by athlete_id
    `,
    gaveUp: client<{ n: number }[]>`
      select count(distinct a.id)::int as n
      from athletes a
      join races r on r.athlete_id = a.id
      where a.hyresult_slug is not null
        and r.status in ('planned', 'registered')
        and r.result_time_seconds is null
        and r.source_idp is null
        and r.race_date is not null
        and r.race_date < current_date
        and r.race_date >= current_date - make_interval(weeks => ${AUTO_IMPORT_WINDOW_WEEKS})
        and r.auto_import_attempts >= ${MAX_AUTO_IMPORT_ATTEMPTS}
    `,
    noSlug: client<{ n: number }[]>`
      select count(distinct a.id)::int as n
      from athletes a
      join races r on r.athlete_id = a.id
      where a.hyresult_slug is null
        and r.status in ('planned', 'registered')
        and r.result_time_seconds is null
        and r.source_idp is null
        and r.race_date is not null
        and r.race_date < current_date
        and r.race_date >= current_date - make_interval(weeks => ${AUTO_IMPORT_WINDOW_WEEKS})
    `,
  };
}

/**
 * Bump auto_import_attempts (+ stamp last_auto_import_at) on the athlete's still
 * UNMATCHED in-window passed targets, AFTER an import pass. The targets the
 * import adopted now carry a source_idp and are excluded — only the ones that
 * stayed unmatched accrue an attempt, so they eventually cross the cap and the
 * cron gives up. Runs whether the import succeeded or failed (a hard upstream
 * failure still counts as a try).
 */
async function recordAttempt(client: Sql, athleteId: number): Promise<void> {
  await client`
    update races
    set auto_import_attempts = auto_import_attempts + 1,
        last_auto_import_at = now()
    where athlete_id = ${athleteId}
      and status in ('planned', 'registered')
      and result_time_seconds is null
      and source_idp is null
      and race_date is not null
      and race_date < current_date
      and race_date >= current_date - make_interval(weeks => ${AUTO_IMPORT_WINDOW_WEEKS})
  `;
}

/** Default importer; injectable for tests so the batch logic runs without the
 *  network. */
type ImportRacesFn = typeof importAllRaces;

export async function runAutoImportResults(args?: {
  client?: Sql;
  importRaces?: ImportRacesFn;
}): Promise<AutoImportResultsSummary> {
  const client = args?.client ?? defaultSql;
  const importRaces = args?.importRaces ?? importAllRaces;

  const queries = passedPendingRaceQueries(client);
  const [due, gaveUpRows, noSlugRows] = await Promise.all([
    queries.due,
    queries.gaveUp,
    queries.noSlug,
  ]);

  let succeeded = 0;
  let failed = 0;
  const errors: { athlete_id: number; message: string }[] = [];

  for (const a of due) {
    try {
      // importAllRaces persists the slug (idempotent) AND reconciles each result
      // against the athlete's pending objectives — the adopt seam lives there.
      await importRaces({ athlete_id: a.athlete_id, slug: a.slug });
      succeeded++;
    } catch (err) {
      failed++;
      errors.push({
        athlete_id: a.athlete_id,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      // Count the try on whatever targets stayed unmatched — success or failure —
      // so a permanently unmatchable target crosses the cap and stops being due.
      await recordAttempt(client, a.athlete_id);
    }
  }

  return {
    considered: due.length,
    succeeded,
    failed,
    skipped_no_slug: noSlugRows[0]?.n ?? 0,
    gave_up: gaveUpRows[0]?.n ?? 0,
    errors,
  };
}
