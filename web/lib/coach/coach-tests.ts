import 'server-only';

// #34 — repositorio de la batería de tests de calibración DEL COACH (coach_calibration_tests
// + coach_test_results). Sustituye a la constante DEFAULT_CALIBRATION_BATTERY como fuente de verdad:
// el coach define qué tests existen, qué mide/calibra cada uno y CUÁNDO se programan. El
// scheduler, la API y el estado leen de aquí. La constante queda solo como set-semilla.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  StoreResultMeasure,
  StoreResultUnit,
  StoreResultDerives,
} from '@fahybrid/shared/schema/test-battery';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import { getTemplateDetail } from '@/lib/dashboard/coach/templates';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';

export interface CoachTestResult {
  id: string;
  slug: string;
  label: string;
  measure: StoreResultMeasure;
  unit: StoreResultUnit;
  derives: StoreResultDerives;
  modality: string | null;
  /** Optional result — does not gate the test's completion (#34). */
  optional: boolean;
  sort_order: number;
}

/** One scheduled occurrence of a test in the athlete's plan. A test can have several
 *  (re-tests in weeks 1, 6, 12…), hence a child collection rather than columns. */
export interface CoachTestSchedule {
  id: string;
  /** 0 = SEMANA CERO (los días antes de que arranque el plan); 1+ = semana N, 1-based. */
  week_offset: number;
  day_of_week: number;
  enabled: boolean;
  /** Días libres que esta pieza pide detrás. Solo lo usa la semana cero al colocar. */
  rest_days_after: number;
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
  enabled: boolean;
  sort_order: number;
  results: CoachTestResult[];
  schedules: CoachTestSchedule[];
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
  enabled: boolean;
  sort_order: number;
}

interface ResultRow extends CoachTestResult {
  test_id: string;
}

interface ScheduleRow extends CoachTestSchedule {
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
               template_id::text, enabled, sort_order
        from coach_calibration_tests
        where coach_id = ${cid} and archived_at is null and enabled = true
        order by sort_order asc, id asc`
    : await client<TestRow[]>`
        select id::text, coach_id::text, slug, name, protocol, format, primary_modality,
               template_id::text, enabled, sort_order
        from coach_calibration_tests
        where coach_id = ${cid} and archived_at is null
        order by sort_order asc, id asc`;
  if (testRows.length === 0) return [];

  const ids = testRows.map((t) => Number(t.id));
  const [resultRows, scheduleRows] = await Promise.all([
    client<ResultRow[]>`
      select id::text, test_id::text, slug, label,
             measure, unit, derives, modality, optional, sort_order
      from coach_test_results
      where test_id = any(${ids})
      order by sort_order asc, id asc`,
    client<ScheduleRow[]>`
      select id::text, test_id::text, week_offset, day_of_week, enabled, rest_days_after
      from coach_test_schedule
      where test_id = any(${ids})
      order by week_offset asc, day_of_week asc`,
  ]);

  const resultsByTest = new Map<string, CoachTestResult[]>();
  for (const r of resultRows) {
    const list = resultsByTest.get(r.test_id) ?? [];
    list.push({
      id: r.id,
      slug: r.slug,
      label: r.label,
      measure: r.measure,
      unit: r.unit,
      derives: r.derives,
      modality: r.modality,
      optional: r.optional,
      sort_order: r.sort_order,
    });
    resultsByTest.set(r.test_id, list);
  }

  const schedulesByTest = new Map<string, CoachTestSchedule[]>();
  for (const s of scheduleRows) {
    const list = schedulesByTest.get(s.test_id) ?? [];
    list.push({
      id: s.id,
      week_offset: s.week_offset,
      day_of_week: s.day_of_week,
      enabled: s.enabled,
      rest_days_after: s.rest_days_after,
    });
    schedulesByTest.set(s.test_id, list);
  }

  return testRows.map((t) => ({
    ...t,
    results: resultsByTest.get(t.id) ?? [],
    schedules: schedulesByTest.get(t.id) ?? [],
  }));
}

// #34/2026-08-08 — the test editor's CONTENT loader (docs/DECISIONS.md, "el editor
// de tests"): a test's CURRENT authored blocks, for the "Editar" panel to load
// back. Split out from `listCoachTests` on purpose — reading content needs an
// extra `template_segments` join that the list's other seven callers (scheduler,
// apply, restore-defaults, athlete detail, write-coach-test's getOne…) never need;
// bolting it onto the list would add a template read to every one of them.
//
// Reads via `getTemplateDetail` (the SAME loader the day/library editors use for a
// `templates` row) rather than `loadSessionEditorModel` (its client-model wrapper):
// that wrapper falls back to `legacyItemToPrescription` for a null/unparseable
// `prescription_json`, which is exactly wrong here. A test whose segments came from
// the GENERIC one-per-result fallback (`writeContentSegments`,
// calibration-content.ts) carries `prescription_json: NULL` ON PURPOSE — "Batería
// 1RM"/"HYROX half-sim" (FOCUS.md, 8-ago) are max-effort tests with no prescribed
// dose, never meant to be block-edited. Falling back to a derived dose would show
// the coach an invented prescription and, on Guardar, PERSIST it as if authored —
// the exact silent-corruption shape A3 (item-validity.ts) exists to prevent
// elsewhere. So: any item with no real prescription means "this test has no
// authored content yet" → []. Only when EVERY item carries a real Prescription
// (coach-authored via `writeAuthoredContentSegments`, or the #61 structured
// blueprint via `writeCalibrationContentSegments` — both always write one) are
// blocks returned.
export async function loadCoachTestContent(
  coach_id: number | bigint,
  template_id: number | bigint,
  client: Sql = defaultSql,
): Promise<EditorBlock[]> {
  const detail = await getTemplateDetail({ coach_id, template_id, client });
  if (!detail || detail.blocks.length === 0) return [];

  const hasUndosedItem = detail.blocks.some((b) =>
    b.items.some((it) => it.prescription_json == null),
  );
  if (hasUndosedItem) return [];

  // Circuito (template_blocks, docs/DECISIONS.md 2026-08-08): sin esto, reabrir
  // un test HYROX-style para editarlo perdería silenciosamente su rounds/pacing
  // en cuanto el coach le diera a Guardar — draftContentToInput solo manda lo
  // que el bloque trae. Mismo shape que assignment-detail.ts (AssignmentDetailCircuitBlock).
  const circuitRows = await client<
    Array<{
      block_position: number;
      rounds: number;
      pacing: string;
      work_seconds: number | null;
      rest_between_stations_seconds: number | null;
      rest_between_rounds_seconds: number | null;
    }>
  >`
    select block_position, rounds, pacing, work_seconds,
           rest_between_stations_seconds, rest_between_rounds_seconds
    from template_blocks
    where template_id = ${Number(template_id)}
  `;
  const circuitByPosition = new Map(
    circuitRows.map((r) => [
      r.block_position,
      {
        rounds: r.rounds,
        pacing:
          r.pacing === 'por_reloj'
            ? { kind: 'por_reloj' as const, work_seconds: r.work_seconds ?? 0 }
            : { kind: 'por_tarea' as const },
        ...(r.rest_between_stations_seconds != null
          ? { rest_between_stations_seconds: r.rest_between_stations_seconds }
          : {}),
        ...(r.rest_between_rounds_seconds != null
          ? { rest_between_rounds_seconds: r.rest_between_rounds_seconds }
          : {}),
      },
    ]),
  );

  return detail.blocks.map((b, i) => ({
    uid: `test-block-${b.block_position}`,
    title: b.block_title ?? `Bloque ${i + 1}`,
    format: b.block_format ?? detail.format,
    ...(circuitByPosition.has(b.block_position)
      ? { circuit: circuitByPosition.get(b.block_position) }
      : {}),
    items: b.items.map<EditorItem>((it) => ({
      uid: `test-item-${it.id}`,
      exercise_id: Number(it.exercise_id),
      exercise_name: it.exercise_name,
      exercise_modality: it.exercise_modality as Modality,
      notes: it.notes ?? undefined,
      // Guaranteed non-null by the hasUndosedItem check above.
      prescription: it.prescription_json!,
    })),
  }));
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
