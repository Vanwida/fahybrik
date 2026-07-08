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
import { addDays, isoDateString } from '@fahybrid/shared/domain/dates';

export async function scheduleWeek1Calibration(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
  /** The Monday of the athlete's first plan week (the anchor for week_offset:1). */
  week1_monday: Date;
  /** The microcycle covering week 1 (later-week tests, week_offset>1, hang off no microcycle). */
  microcycle_id: string;
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
  let injected = 0;
  for (const test of tests) {
    // A test with no workout content yet cannot be scheduled (nothing to run).
    if (!test.template_id) continue;
    const clone = await cloneTemplateAsInstance({
      client,
      source_template_id: Number(test.template_id),
      athlete_id,
    });
    if (!clone) continue;
    // Coach-chosen schedule: week_offset (1-based) + day_of_week (1=Mon…7=Sun).
    const dayOffset = (test.week_offset - 1) * 7 + (test.day_of_week - 1);
    const scheduledFor = isoDateString(addDays(params.week1_monday, dayOffset));
    // Only week-1 tests hang off the passed microcycle; later weeks aren't covered by it.
    const microcycleId = test.week_offset === 1 ? week1MicrocycleId : null;
    await client`
      insert into workout_assignments (
        athlete_id, microcycle_id, scheduled_for, template_id, template_version,
        status, notes, calibration_test_id
      ) values (
        ${athlete_id}, ${microcycleId}, ${scheduledFor}::date,
        ${clone.template_id}, ${clone.version}, 'scheduled', 'calibration', ${Number(test.id)}
      )
    `;
    injected += 1;
  }
  return injected;
}
