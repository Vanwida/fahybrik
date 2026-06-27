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
// One import per athlete covers ALL of their passed targets at once (the history
// fetch returns everything; the reconcile inside importAllRaces adopts each
// matching pending row). Tolerant: one athlete's failure (hyresult 404 / network
// / parse) is recorded and never aborts the batch. Athletes with no slug can't
// be auto-imported — counted for observability, not acted on (they must run the
// by-name import once to record their slug).
// =============================================================================

export interface AutoImportResultsSummary {
  // Athletes with a passed target + a hyresult_slug → attempted.
  considered: number;
  succeeded: number;
  failed: number;
  // Athletes with a passed target but NO slug → can't auto-import (observability).
  skipped_no_slug: number;
  // Per-athlete failures (athlete_id + message; not PII) so Vercel logs the full
  // picture without a side table.
  errors: { athlete_id: number; message: string }[];
}

interface DueAthlete {
  athlete_id: number;
  slug: string;
}

// The "passed pending objective" predicate, shared by the due-list and the
// no-slug observability count so the two never drift: a planned/registered race
// with no result yet (a pure objective, not an imported row) whose real date is
// strictly in the past.
function passedPendingRacesExist(client: Sql) {
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
      order by athlete_id
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
    `,
  };
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

  const queries = passedPendingRacesExist(client);
  const [due, noSlugRows] = await Promise.all([queries.due, queries.noSlug]);

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
    }
  }

  return {
    considered: due.length,
    succeeded,
    failed,
    skipped_no_slug: noSlugRows[0]?.n ?? 0,
    errors,
  };
}
