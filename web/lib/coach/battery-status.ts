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
  /** The captured value(s) pre-formatted for the card ("22:14", "140 kg",
   *  "140 kg · 180 kg · 100 kg" for a multi-result battery). Null until captured. */
  result_label: string | null;
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
      // Each expected result's slug + how it's measured + whether it's optional,
      // ordered — drives both the captured check (only REQUIRED gate completion) and
      // the formatted result_label.
      expected_specs: Array<{ slug: string; measure: string; optional: boolean }>;
    }[]
  >`
    select wa.id::text as assignment_id,
           wa.scheduled_for::text as scheduled_for,
           wa.status::text as status,
           cct.slug as calibration,
           cct.name as label,
           coalesce(
             jsonb_agg(jsonb_build_object('slug', ctr.slug, 'measure', ctr.measure, 'optional', ctr.optional)
                       order by ctr.sort_order, ctr.id) filter (where ctr.slug is not null),
             '[]'::jsonb
           ) as expected_specs
    from workout_assignments wa
    join coach_calibration_tests cct on cct.id = wa.calibration_test_id
    left join coach_test_results ctr on ctr.test_id = cct.id
    where wa.athlete_id = ${athlete_id}
      and wa.calibration_test_id is not null
    group by wa.id, wa.scheduled_for, wa.status, cct.slug, cct.name
    order by wa.scheduled_for asc
  `;
  if (rows.length === 0) return { total: 0, completed: 0, tests: [] };

  // The athlete's REAL-test benchmarks (coach_test / athlete_test only — the
  // self-declared/onboarding ones don't count as a captured calibration), latest
  // value per slug so the card shows the most recent number.
  const benchRows = await client<{ exercise_slug: string; value: number }[]>`
    select distinct on (exercise_slug) exercise_slug, value::float8 as value
    from athlete_benchmarks
    where athlete_id = ${athlete_id} and source in ('coach_test', 'athlete_test')
    order by exercise_slug, recorded_at desc
  `;
  const valueBySlug = new Map(benchRows.map((r) => [r.exercise_slug, r.value]));

  const executed = new Set(['completed', 'partial']);
  const tests: CalibrationTestStatus[] = rows.map((r) => {
    const specs = r.expected_specs ?? [];
    // Completion is gated ONLY by the REQUIRED results — an optional result (e.g. HRR
    // the app auto-measures) never blocks "completado".
    const required = specs.filter((s) => !s.optional);
    const result_captured = required.length > 0 && required.every((s) => valueBySlug.has(s.slug));
    return {
      calibration_slug: r.calibration ?? '',
      label: r.label,
      assignment_id: r.assignment_id,
      scheduled_for: r.scheduled_for,
      session_status: r.status,
      result_captured,
      result_pending: !result_captured && executed.has(r.status),
      // Pre-formatted captured value(s), joined for a multi-result battery. Shown once
      // the required results are in; a captured OPTIONAL result rides along, a missing
      // one is simply omitted (it never blocked completion).
      result_label: result_captured
        ? specs
            .filter((s) => valueBySlug.has(s.slug))
            .map((s) => formatCapturedValue(s.measure, valueBySlug.get(s.slug)!))
            .join(' · ')
        : null,
    };
  });

  return {
    total: tests.length,
    completed: tests.filter((t) => t.result_captured).length,
    tests,
  };
}

// Format a captured benchmark value for the card, by how it's measured. Time is a
// clock (m:ss, or h:mm:ss past an hour); the rest are the number + a short unit.
// Numbers drop a trailing ".0" (integers read clean). The stored value's unit
// always matches the measure (the bridge writes seconds for time, kg for load).
function formatCapturedValue(measure: string, value: number): string {
  if (measure === 'time') {
    const total = Math.max(0, Math.round(value));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  const n = Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
  switch (measure) {
    case 'load':
      return `${n} kg`;
    case 'distance':
      return `${n} m`;
    case 'calories':
      return `${n} cal`;
    case 'hrr':
      return `${n} bpm`;
    default: // reps
      return n;
  }
}
