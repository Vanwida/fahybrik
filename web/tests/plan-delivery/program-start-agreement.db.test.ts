// «Dónde está y cuándo empieza» un atleta: la página del grupo y el roster leen
// LA MISMA regla (programPosition) y dicen lo mismo (informe C: «empieza 21
// sept» en el grupo, «empieza el 28 sept · Sin plan» en Atletas, del mismo
// atleta). Y quien empieza la semana que viene no es «Sin plan».

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeProgram, mondayPlus, type Club } from './fixtures';
import { createGroup, getGroup } from '@/lib/coach/groups';
import { loadRoster } from '@/lib/dashboard/athletes/roster';
import { loadHoy } from '@/lib/dashboard/hoy/load-hoy';
import { boxToday } from '@/lib/coach/week-publishing';

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describeWithDb('posición en el programa: grupo = roster', () => {
  const sql = getTestSql();
  let club: Club;
  let groupId = 0;
  const today = boxToday();
  const thisMonday = mondayPlus(today, 0);
  const nextMonday = mondayPlus(today, 1);

  beforeAll(async () => {
    club = await makeClub(sql, 3);
    await sql`update athletes set onboarded_at = now() - interval '30 days', intake_completed_at = now() - interval '29 days'
              where id = any(${club.athleteIds}::bigint[])`;
    const A = await makeProgram(club, 4, 'Acumulación');
    const g = await createGroup(club.coachId, { name: 'Mañanas', end_policy: 'stop', programs: [{ program_id: String(A) }] }, sql);
    groupId = Number(g.id);
    const [early, late, none] = club.athleteIds;
    // late: entra en la semana 2 de un programa de 4 y empieza el lunes que viene.
    // early: entró en la semana 2 y va por ella esta semana.
    for (const [id, start] of [
      [late!, nextMonday],
      [early!, thisMonday],
    ] as const) {
      await sql`insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date)
                values (${id}, ${A}, ${start}::date, ${plusDays(start, 20)}::date)`;
      await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
                values (${id}, ${start}::date, ${club.templateId}, 1, 'scheduled', 'coach')`;
      await sql`insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, current_position, status)
                values (${id}, ${club.coachId}, ${groupId}, 1, 'active')`;
    }
    // none: entrenó un entreno suelto del coach hace dos semanas y nada más.
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
              values (${none!}, ${plusDays(thisMonday, -10)}::date, ${club.templateId}, 1, 'completed', 'coach')`;
  });

  afterAll(async () => {
    await club.cleanup();
    await closeTestSql();
  });

  test('empieza el mismo día en el grupo y en Atletas, y no es «Sin plan»', async () => {
    const [detail, rows] = await Promise.all([getGroup(club.coachId, groupId, sql), loadRoster({ coach_id: club.coachId, client: sql })]);
    const late = String(club.athleteIds[1]);
    const member = detail!.members.find((m) => m.athlete_id === late)!;
    const row = rows.find((r) => r.athlete_id === late)!;
    expect(member).toMatchObject({ program_start: nextMonday, week: null });
    expect(row).toMatchObject({ week_visibility: 'empieza', next_start: nextMonday });
    expect(row.status.key).not.toBe('sin_plan');
  });

  test('va por la misma semana del programa en los dos sitios («semana 2 de 4»)', async () => {
    const [detail, rows] = await Promise.all([getGroup(club.coachId, groupId, sql), loadRoster({ coach_id: club.coachId, client: sql })]);
    const early = String(club.athleteIds[0]);
    const member = detail!.members.find((m) => m.athlete_id === early)!;
    const row = rows.find((r) => r.athlete_id === early)!;
    expect(member).toMatchObject({ program_start: thisMonday, week: 2 });
    expect(row.program).toMatchObject({ week: 2, weeks: 4 });
  });

  test('«Sin plan» es una sola definición: el grupo de Hoy y el chip de Atletas', async () => {
    const [rows, hoy] = await Promise.all([loadRoster({ coach_id: club.coachId, client: sql }), loadHoy({ coach_id: club.coachId, client: sql })]);
    const sinPlan = rows.filter((r) => r.week_visibility === 'sin_plan').map((r) => r.athlete_id).sort();
    const group = hoy.systemic.find((g) => g.kind === 'no_program');
    expect(sinPlan).toEqual([String(club.athleteIds[2])]);
    expect([...(group?.athlete_ids ?? [])].sort()).toEqual(sinPlan);
    // Entrenó con el coach: no «nunca ha tenido», se le acabó.
    expect(group!.detail).toBe('1 con el programa terminado');
  });
});
