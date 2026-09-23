// DESHACER EL ALTA retira también los tests de calibración que el primer plan
// inyectó. Con el primer plan, el motor programa la batería del coach
// (`scheduleWeek1Calibration`) también FUERA de la ventana del programa — la
// semana cero antes del lunes y los re-tests posteriores al final —, y esas
// sesiones son del lote: si no se apuntan, «Deshacer» deja tests sueltos en un
// atleta que ya no tiene plan. DB real.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { commitIntake, undoIntake } from '@/lib/coach/intake';
import type { IntakeCommitInput } from '@/lib/coach/intake-schema';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeTemplate } from '../utils/db-fixtures';
import { makeClub, makeProgram, mondayPlus, type Club } from '../plan-delivery/fixtures';

const payload = (program_id: number, start_date: string): IntakeCommitInput => ({
  target_event_id: null,
  level: 2,
  baseline_tests: [],
  welcome: { send: false, body: null },
  acknowledged_warnings: [],
  notes: null,
  plan: { kind: 'program', program_id, start_date },
  plan_mode: 'shared',
});

const plusDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describeWithDb('alta · deshacer retira la calibración del primer plan (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  let program: number;
  let nextMonday: string;

  beforeAll(async () => {
    club = await makeClub(sql, 1);
    // Programa de 2 semanas: el re-test de la semana 4 cae FUERA de su ventana.
    program = await makeProgram(club, 2, 'Base');
    const testTemplate = await makeTemplate({ fx: club.fx, name: 'Test 5K' });
    const t = await sql<Array<{ id: string }>>`
      insert into coach_calibration_tests (coach_id, slug, name, format, template_id)
      values (${club.coachId}, 'test-5k-undo', 'Test 5K', 'test', ${testTemplate})
      returning id::text`;
    const testId = Number(t[0]!.id);
    await sql`
      insert into coach_test_schedule (test_id, week_offset, day_of_week)
      values (${testId}, 1, 2), (${testId}, 4, 2)`;
    const d = await sql<Array<{ d: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD') as d`;
    nextMonday = mondayPlus(d[0]!.d, 1);
    await sql`update athletes set onboarded_at = now() - interval '1 day', lifecycle_status = 'activo'
              where id = any(${club.athleteIds}::bigint[])`;
  });

  afterAll(async () => {
    await sql`delete from workout_assignments where athlete_id = any(${club.athleteIds}::bigint[])`;
    await sql`delete from coach_calibration_tests where coach_id = ${club.coachId}`;
    await club.cleanup();
    await closeTestSql();
  }, 120000);

  test('el primer plan trae sus tests (dentro y fuera de la ventana) y deshacer los quita todos', async () => {
    const athlete = club.athleteIds[0]!;
    await commitIntake({
      athlete_id: athlete,
      coach_id: club.coachId,
      coach_user_id: club.fx.coachUserId,
      payload: payload(program, nextMonday),
      client: sql,
    });

    const tests = await sql<Array<{ day: string }>>`
      select to_char(scheduled_for, 'YYYY-MM-DD') as day from workout_assignments
      where athlete_id = ${athlete} and calibration_test_id is not null order by scheduled_for`;
    // Semana 1 (dentro) y semana 4 (fuera: el programa acaba en la 2).
    expect(tests.map((x) => x.day)).toEqual([plusDays(nextMonday, 1), plusDays(nextMonday, 3 * 7 + 1)]);

    await undoIntake({ athlete_id: athlete, coach_id: club.coachId, coach_user_id: club.fx.coachUserId, client: sql });

    const left = await sql<Array<{ n: number }>>`
      select count(*)::int as n from workout_assignments where athlete_id = ${athlete}`;
    expect(left[0]!.n).toBe(0);
    // Y las copias de su contenido que ya nadie usa, fuera también.
    const clones = await sql<Array<{ n: number }>>`
      select count(*)::int as n from templates where instance_athlete_id = ${athlete}`;
    expect(clones[0]!.n).toBe(0);
  }, 120000);
});
