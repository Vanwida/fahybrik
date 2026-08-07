import 'server-only';

// #34 — auto-programa la batería de calibración DEL COACH cuando se materializa el PRIMER
// plan del atleta. Data-driven: itera los tests que el coach tiene configurados y habilitados
// (coach_calibration_tests), NO una constante — el coach decide qué tests y CUÁNDO (semana +
// día por test). Cada test se inyecta como una workout_assignment normal (el coach puede
// moverla/quitarla), apuntando a un FORK per-atleta de su template y con calibration_test_id
// puesto (la FK que el badge is_test / el puente / battery-status leen). Idempotente y honesto:
// si el atleta ya tiene calibración, o el coach no tiene tests, no inyecta nada (la promesa
// día-1 degrada a "tu coach los programará" en vez de fabricar sesiones vacías).

import type { Sql } from '@/lib/db';
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { addDays, isoDateString, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { planZeroWeek, type ZeroWeekItem } from '@fahybrid/shared/domain/coach/zero-week';

/**
 * Insert ONE calibration-test session for the athlete, pointing at an already-cloned
 * per-athlete instance template. This is the SINGLE place the `workout_assignments`
 * shape of a test session is written — both the week-1 auto-scheduler (below) and the
 * ad-hoc "Probarme" start (POST /api/athlete/test-battery/start) route through it, so
 * the status/notes/calibration-FK invariants never drift. Returns the new assignment id.
 */
export async function insertCalibrationAssignment(params: {
  client: Sql;
  athlete_id: number;
  test_id: number;
  /** The per-athlete instance template id (already cloned by the caller). */
  template_id: number;
  template_version: number;
  /** ISO `YYYY-MM-DD` in the box timezone. */
  scheduled_for: string;
  /** The covering microcycle, or null for an ad-hoc (unplanned) session. */
  microcycle_id: number | null;
}): Promise<number> {
  const rows = await params.client<{ id: string }[]>`
    insert into workout_assignments (
      athlete_id, microcycle_id, scheduled_for, template_id, template_version,
      status, notes, calibration_test_id
    ) values (
      ${params.athlete_id}, ${params.microcycle_id}, ${params.scheduled_for}::date,
      ${params.template_id}, ${params.template_version}, 'scheduled', 'calibration', ${params.test_id}
    )
    returning id::text as id
  `;
  return Number(rows[0]!.id);
}

/**
 * Put ONE test in ONE athlete's plan on ONE day: fork the content per-athlete and write
 * the assignment. This is the shared core of the three ways a test ever reaches a plan —
 * the week-1 auto-scheduler, the athlete's own "Probarme", and the coach's "Aplicar" —
 * so the fork, the idempotency rule and the calibration FK live in a single place.
 *
 * Idempotent per (athlete, test, day): an existing not-yet-completed session is REUSED,
 * never duplicated. That is what makes a double click, a retry and a coach applying the
 * same test twice all harmless.
 */
export async function materializeTestForAthlete(params: {
  client: Sql;
  athlete_id: number;
  test: { id: string | number; template_id: string | number | null };
  /** ISO `YYYY-MM-DD` in the box timezone. */
  scheduled_for: string;
  /** The covering microcycle, or null for an ad-hoc (unplanned) session. */
  microcycle_id?: number | null;
}): Promise<{ ok: true; assignment_id: number; reused: boolean } | { ok: false; reason: 'test_not_ready' }> {
  const { client, athlete_id, scheduled_for } = params;
  const test_id = Number(params.test.id);
  // A test with no workout content yet cannot be scheduled — there is nothing to run.
  if (!params.test.template_id) return { ok: false, reason: 'test_not_ready' };

  const existing = await client<{ id: string }[]>`
    select id::text as id
    from workout_assignments
    where athlete_id = ${athlete_id}
      and calibration_test_id = ${test_id}
      and scheduled_for = ${scheduled_for}::date
      and status <> 'completed'
    order by id desc
    limit 1
  `;
  if (existing[0]) return { ok: true, assignment_id: Number(existing[0].id), reused: true };

  const clone = await cloneTemplateAsInstance({
    client,
    source_template_id: Number(params.test.template_id),
    athlete_id,
  });
  if (!clone) return { ok: false, reason: 'test_not_ready' };

  const assignment_id = await insertCalibrationAssignment({
    client,
    athlete_id,
    test_id,
    template_id: clone.template_id,
    template_version: clone.version,
    scheduled_for,
    microcycle_id: params.microcycle_id ?? null,
  });
  return { ok: true, assignment_id, reused: false };
}

export async function scheduleWeek1Calibration(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
  /** The Monday of the athlete's first plan week (the anchor for week_offset:1). */
  week1_monday: Date;
  /** The microcycle covering week 1 (later-week tests, week_offset>1, hang off no microcycle). */
  microcycle_id: string;
  /**
   * El día en que se asigna — el arranque de la ventana de la semana cero.
   * Inyectable para poder fijarlo en un test; por defecto, hoy.
   */
  assigned_on?: Date;
}): Promise<number> {
  const { client } = params;
  const athlete_id = Number(params.athlete_id);
  const coach_id = Number(params.coach_id);

  // Idempotency: never inject twice — skip if the athlete already has ANY calibration
  // session (an assignment carrying the calibration FK).
  const existing = await client<{ one: number }[]>`
    select 1 as one from workout_assignments
    where athlete_id = ${athlete_id} and calibration_test_id is not null
    limit 1
  `;
  if (existing.length > 0) return 0;

  // The coach's enabled calibration tests (data-driven). None → inject nothing (honest).
  const tests = await listCoachTests(coach_id, { onlyEnabled: true }, client);
  if (tests.length === 0) return 0;

  const week1MicrocycleId = Number(params.microcycle_id);

  // ── SEMANA CERO (week_offset 0) ────────────────────────────────────────────
  // Los días entre HOY y el lunes que arranca el plan. La ventana mide de 1 a 7
  // días según cuándo se asigne, así que no se puede colocar por (semana, día) a
  // ciegas como las semanas del plan: hay que repartir lo que quepa de verdad.
  // `planZeroWeek` (puro, testeado) decide; aquí solo se escribe.
  const zeroItems: Array<{ item: ZeroWeekItem; test: (typeof tests)[number] }> = [];
  for (const test of tests) {
    if (!test.template_id) continue;
    for (const occ of test.schedules) {
      if (!occ.enabled || occ.week_offset !== 0) continue;
      zeroItems.push({
        item: {
          id: occ.id,
          preferredDayOfWeek: occ.day_of_week,
          restDaysAfter: occ.rest_days_after,
        },
        test,
      });
    }
  }

  let injected = 0;

  if (zeroItems.length > 0) {
    const buffer = await zeroWeekBufferDays(client, coach_id);
    // Los días del atleta que ya tienen algo: nunca se pisan (puede tener
    // entrenos libres suyos, o una asignación anterior).
    const busy = await client<{ iso: string }[]>`
      select distinct scheduled_for::text as iso
      from workout_assignments
      where athlete_id = ${athlete_id}
        and scheduled_for < ${isoDateString(params.week1_monday)}::date
        and scheduled_for >= ${isoDateString(addDays(params.week1_monday, -7))}::date
    `;
    const plan = planZeroWeek({
      assignedOn: params.assigned_on ?? startOfDayUtc(new Date()),
      planStart: params.week1_monday,
      bufferDays: buffer,
      occupied: busy.map((b) => b.iso),
      items: zeroItems.map((z) => z.item),
    });

    for (const placement of plan.placed) {
      const entry = zeroItems.find((z) => z.item.id === placement.id);
      if (!entry) continue;
      const clone = await cloneTemplateAsInstance({
        client,
        source_template_id: Number(entry.test.template_id),
        athlete_id,
      });
      if (!clone) continue;
      await insertCalibrationAssignment({
        client,
        athlete_id,
        test_id: Number(entry.test.id),
        template_id: clone.template_id,
        template_version: clone.version,
        scheduled_for: placement.iso,
        // La semana cero NO es del microciclo: no periodiza, no progresa, no es
        // una semana del bloque. `microcycle_id` null, que es lo que el sistema
        // ya hace con lo que vive fuera del plan.
        microcycle_id: null,
      });
      injected += 1;
    }
  }

  // ── Semanas del plan (week_offset >= 1), como siempre ──────────────────────
  for (const test of tests) {
    // A test with no workout content yet cannot be scheduled (nothing to run).
    if (!test.template_id) continue;
    // The coach's enabled occurrences (a test can repeat — re-tests in weeks 1, 6, 12…).
    const occurrences = test.schedules.filter((s) => s.enabled && s.week_offset >= 1);
    if (occurrences.length === 0) continue;
    // One per-athlete fork of the content, reused across this test's occurrences.
    const clone = await cloneTemplateAsInstance({
      client,
      source_template_id: Number(test.template_id),
      athlete_id,
    });
    if (!clone) continue;
    for (const occ of occurrences) {
      // Coach-chosen schedule: week_offset (1-based) + day_of_week (1=Mon…7=Sun).
      const dayOffset = (occ.week_offset - 1) * 7 + (occ.day_of_week - 1);
      const scheduledFor = isoDateString(addDays(params.week1_monday, dayOffset));
      // Only week-1 occurrences hang off the passed microcycle; later weeks aren't covered.
      const microcycleId = occ.week_offset === 1 ? week1MicrocycleId : null;
      await insertCalibrationAssignment({
        client,
        athlete_id,
        test_id: Number(test.id),
        template_id: clone.template_id,
        template_version: clone.version,
        scheduled_for: scheduledFor,
        microcycle_id: microcycleId,
      });
      injected += 1;
    }
  }
  return injected;
}

/** El margen de la semana cero que eligió el coach (método, no constante). */
async function zeroWeekBufferDays(client: Sql, coach_id: number): Promise<number> {
  const rows = await client<{ days: number }[]>`
    select zero_week_buffer_days as days from coaches where id = ${coach_id} limit 1
  `;
  return rows[0]?.days ?? 1;
}
