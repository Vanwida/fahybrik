import 'server-only';

// #34 — week-1 calibration battery STATUS (the coach ficha indicator: "3/4 ·
// falta remo 2K"). The only net-new coach surface — the RESULTS themselves already
// render in Rendimiento (#32). "completed" = the RESULT was captured (the expected
// benchmark exists), NOT merely that the session ran — so an executed test whose
// number was never entered honestly reads as "resultado pendiente" (stress-test
// case 11).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export interface CalibrationTestStatus {
  calibration_slug: string;
  label: string;
  assignment_id: string;
  scheduled_for: string;
  session_status: string; // scheduled | completed | partial | missed | skipped
  /** All expected benchmarks present ⇒ the calibration landed. */
  result_captured: boolean;
  /** The session ran but the number was never entered — the actionable nudge. */
  result_pending: boolean;
}

export interface BatteryStatus {
  total: number;
  completed: number;
  tests: CalibrationTestStatus[];
}

export async function loadBatteryStatus(
  athlete_id: number,
  client: Sql = defaultSql,
): Promise<BatteryStatus> {
  const rows = await client<
    {
      assignment_id: string;
      scheduled_for: string;
      status: string;
      calibration: string;
      label: string;
      expected_slugs: string[];
    }[]
  >`
    select wa.id::text as assignment_id,
           wa.scheduled_for::text as scheduled_for,
           wa.status::text as status,
           cct.slug as calibration,
           cct.name as label,
           coalesce(
             array_agg(ctr.slug) filter (where ctr.slug is not null),
             '{}'
           ) as expected_slugs
    from workout_assignments wa
    join coach_calibration_tests cct on cct.id = wa.calibration_test_id
    left join coach_test_results ctr on ctr.test_id = cct.id
    where wa.athlete_id = ${athlete_id}
      and wa.calibration_test_id is not null
    group by wa.id, wa.scheduled_for, wa.status, cct.slug, cct.name
    order by wa.scheduled_for asc
  `;
  if (rows.length === 0) return { total: 0, completed: 0, tests: [] };

  // The athlete's REAL-test benchmark slugs (coach_test / athlete_test only — the
  // self-declared/onboarding ones don't count as a captured calibration).
  const benchRows = await client<{ exercise_slug: string }[]>`
    select distinct exercise_slug from athlete_benchmarks
    where athlete_id = ${athlete_id} and notes in ('coach_test', 'athlete_test')
  `;
  const have = new Set(benchRows.map((r) => r.exercise_slug));

  const executed = new Set(['completed', 'partial']);
  const tests: CalibrationTestStatus[] = rows.map((r) => {
    const expected = r.expected_slugs ?? [];
    const result_captured = expected.length > 0 && expected.every((s) => have.has(s));
    return {
      calibration_slug: r.calibration ?? '',
      label: r.label,
      assignment_id: r.assignment_id,
      scheduled_for: r.scheduled_for,
      session_status: r.status,
      result_captured,
      result_pending: !result_captured && executed.has(r.status),
    };
  });

  return {
    total: tests.length,
    completed: tests.filter((t) => t.result_captured).length,
    tests,
  };
}
