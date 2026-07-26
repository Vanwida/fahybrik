import 'server-only';

// #34 — the athlete-initiated "Probarme" start (core, DB-testable). Materializes an
// AD-HOC calibration-test session TODAY for the athlete from their coach's enabled
// test (by slug). The rest of the loop is untouched: the created assignment carries
// calibration_test_id, so execution → capture → the ejecución→benchmark bridge all
// already work. Idempotent per day: a not-yet-completed session for the same test
// today is reused, never duplicated. The HTTP route (POST /api/athlete/test-battery/
// start) is a thin wrapper mapping the error union to status codes.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { materializeTestForAthlete } from '@/lib/coach/schedule-calibration';
import { startOfDayInBox, isoDateString } from '@fahybrid/shared/domain/dates';

export type StartTestError = 'no_coach' | 'test_not_found' | 'test_not_ready';

/** One result the started session must capture — same shape as assignment-detail's
 *  store_results, so iOS renders the identical capture inputs. */
export interface StartTestStoreResult {
  slug: string;
  label: string;
  measure: string;
  unit: string;
  derives: string;
  modality: string | null;
  /** Optional result (#34): iOS may auto-fill or skip it; never blocks finishing. */
  optional: boolean;
}

export interface StartTestResult {
  assignment_id: number;
  /** ISO `YYYY-MM-DD` (box timezone). */
  scheduled_for: string;
  store_results: StartTestStoreResult[];
  /** True when today's existing session was returned instead of a new one. */
  reused: boolean;
}

export async function startCalibrationTest(params: {
  athlete_id: number;
  slug: string;
  client?: Sql;
  /** Injectable clock for deterministic tests; defaults to now. */
  now?: Date;
}): Promise<{ ok: true; data: StartTestResult } | { ok: false; error: StartTestError }> {
  const client = params.client ?? defaultSql;
  const { athlete_id, slug } = params;

  // The battery is the COACH's content — resolve the athlete's owning coach (the
  // athlete session deliberately carries no coach_id).
  const coachRows = await client<{ coach_id: string | null }[]>`
    select coach_id::text as coach_id from athletes where id = ${athlete_id} limit 1
  `;
  const coach_id = coachRows[0]?.coach_id ? Number(coachRows[0].coach_id) : null;
  if (!coach_id) return { ok: false, error: 'no_coach' };

  // The coach's ENABLED test for this slug, with runnable content.
  const tests = await listCoachTests(coach_id, { onlyEnabled: true }, client);
  const test = tests.find((t) => t.slug === slug);
  if (!test) return { ok: false, error: 'test_not_found' };
  if (!test.template_id) return { ok: false, error: 'test_not_ready' };

  const store_results: StartTestStoreResult[] = test.results.map((r) => ({
    slug: r.slug,
    label: r.label,
    measure: r.measure,
    unit: r.unit,
    derives: r.derives,
    modality: r.modality,
    optional: r.optional,
  }));

  const scheduled_for = isoDateString(startOfDayInBox(params.now ?? new Date()));

  // The fork + the per-day idempotency + the calibration FK all live in one shared
  // place, so this path and the coach's "Aplicar" can never drift apart.
  const placed = await materializeTestForAthlete({
    client,
    athlete_id,
    test,
    scheduled_for,
    microcycle_id: null, // ad-hoc: no microcycle covers it
  });
  if (!placed.ok) return { ok: false, error: 'test_not_ready' };

  return {
    ok: true,
    data: { assignment_id: placed.assignment_id, scheduled_for, store_results, reused: placed.reused },
  };
}
