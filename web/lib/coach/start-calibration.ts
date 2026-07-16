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
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import { insertCalibrationAssignment } from '@/lib/coach/schedule-calibration';
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
  }));

  const scheduled_for = isoDateString(startOfDayInBox(params.now ?? new Date()));

  // Idempotency: reuse today's not-yet-completed session for this test, so a double
  // tap doesn't stack duplicate sessions.
  const existing = await client<{ id: string; scheduled_for: string }[]>`
    select id::text as id, scheduled_for::text as scheduled_for
    from workout_assignments
    where athlete_id = ${athlete_id}
      and calibration_test_id = ${Number(test.id)}
      and scheduled_for = ${scheduled_for}::date
      and status <> 'completed'
    order by id desc
    limit 1
  `;
  if (existing[0]) {
    return {
      ok: true,
      data: {
        assignment_id: Number(existing[0].id),
        scheduled_for: existing[0].scheduled_for,
        store_results,
        reused: true,
      },
    };
  }

  // Fork the test content per-athlete + point an assignment at it with the
  // calibration FK. No microcycle — it's an ad-hoc session.
  const clone = await cloneTemplateAsInstance({
    client,
    source_template_id: Number(test.template_id),
    athlete_id,
  });
  if (!clone) return { ok: false, error: 'test_not_ready' };

  const assignment_id = await insertCalibrationAssignment({
    client,
    athlete_id,
    test_id: Number(test.id),
    template_id: clone.template_id,
    template_version: clone.version,
    scheduled_for,
    microcycle_id: null,
  });

  return { ok: true, data: { assignment_id, scheduled_for, store_results, reused: false } };
}
