import 'server-only';

// #34 — repositorio de la batería de tests de calibración DEL COACH (coach_calibration_tests
// + coach_test_results). Sustituye a la constante FABRIK_WEEK1_BATTERY como fuente de verdad:
// el coach define qué tests existen, qué mide/calibra cada uno y CUÁNDO se programan. El
// scheduler, la API y el estado leen de aquí. La constante queda solo como set-semilla.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  StoreResultMeasure,
  StoreResultUnit,
  StoreResultDerives,
} from '@fahybrid/shared/schema/test-battery';

export interface CoachTestResult {
  id: string;
  slug: string;
  label: string;
  measure: StoreResultMeasure;
  unit: StoreResultUnit;
  derives: StoreResultDerives;
  modality: string | null;
  sort_order: number;
}

export interface CoachCalibrationTest {
  id: string;
  coach_id: string;
  slug: string;
  name: string;
  protocol: string | null;
  format: string;
  primary_modality: string | null;
  template_id: string | null;
  week_offset: number;
  day_of_week: number;
  enabled: boolean;
  sort_order: number;
  results: CoachTestResult[];
}

interface TestRow {
  id: string;
  coach_id: string;
  slug: string;
  name: string;
  protocol: string | null;
  format: string;
  primary_modality: string | null;
  template_id: string | null;
  week_offset: number;
  day_of_week: number;
  enabled: boolean;
  sort_order: number;
}

interface ResultRow extends CoachTestResult {
  test_id: string;
}

/** All of a coach's (non-archived) calibration tests, each with its results, ordered for
 *  display and scheduling. `onlyEnabled` narrows to the auto-scheduled set (the scheduler). */
export async function listCoachTests(
  coach_id: number | bigint,
  opts: { onlyEnabled?: boolean } = {},
  client: Sql = defaultSql,
): Promise<CoachCalibrationTest[]> {
  const cid = Number(coach_id);
  const testRows = opts.onlyEnabled
    ? await client<TestRow[]>`
        select id::text, coach_id::text, slug, name, protocol, format, primary_modality,
               template_id::text, week_offset, day_of_week, enabled, sort_order
        from coach_calibration_tests
        where coach_id = ${cid} and archived_at is null and enabled = true
        order by sort_order asc, id asc`
    : await client<TestRow[]>`
        select id::text, coach_id::text, slug, name, protocol, format, primary_modality,
               template_id::text, week_offset, day_of_week, enabled, sort_order
        from coach_calibration_tests
        where coach_id = ${cid} and archived_at is null
        order by sort_order asc, id asc`;
  if (testRows.length === 0) return [];

  const ids = testRows.map((t) => Number(t.id));
  const resultRows = await client<ResultRow[]>`
    select id::text, test_id::text, slug, label,
           measure, unit, derives, modality, sort_order
    from coach_test_results
    where test_id = any(${ids})
    order by sort_order asc, id asc
  `;
  const byTest = new Map<string, CoachTestResult[]>();
  for (const r of resultRows) {
    const list = byTest.get(r.test_id) ?? [];
    list.push({
      id: r.id,
      slug: r.slug,
      label: r.label,
      measure: r.measure,
      unit: r.unit,
      derives: r.derives,
      modality: r.modality,
      sort_order: r.sort_order,
    });
    byTest.set(r.test_id, list);
  }
  return testRows.map((t) => ({ ...t, results: byTest.get(t.id) ?? [] }));
}

/** Does this coach have ANY calibration test configured? Drives the empty state /
 *  "restaurar defaults" affordance and whether scheduling has anything to inject. */
export async function coachHasTests(
  coach_id: number | bigint,
  client: Sql = defaultSql,
): Promise<boolean> {
  const rows = await client<{ one: number }[]>`
    select 1 as one from coach_calibration_tests
    where coach_id = ${Number(coach_id)} and archived_at is null
    limit 1
  `;
  return rows.length > 0;
}
