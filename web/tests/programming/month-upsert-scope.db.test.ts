// upsertMonthTemplate valida el dueño de CADA week_template_id del cliente
// (obra 0 multi-coach, patrón de sequences.saveSequence): un id de otro club
// no puede montarse dentro de un microciclo — 404 y CERO filas escritas.
//
// DB real (Neon branch): lo que se prueba ES el SQL del guard. Se salta con
// aviso cuando no hay TEST_DATABASE_URL.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { upsertMonthTemplate, getMonthTemplate, ProgramMonthError } from '@/lib/dashboard/coach/program-months';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('upsertMonthTemplate — semanas del propio club (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const monthIds: number[] = [];
  const weekIds: number[] = [];
  let clubA: Fixture;
  let clubB: Fixture;
  let weekA1 = 0;
  let weekA2 = 0;
  let weekB = 0;

  async function seedWeek(fx: Fixture, name: string): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into program_week_templates (coach_id, name, slots_json)
      values (${fx.coachId}, ${name}, ${sql.json({ days: [] })})
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    weekIds.push(id);
    return id;
  }

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);
    weekA1 = await seedWeek(clubA, 'A semana 1');
    weekA2 = await seedWeek(clubA, 'A semana 2');
    weekB = await seedWeek(clubB, 'B semana 1');
  });

  afterAll(async () => {
    if (monthIds.length) {
      await sql`delete from program_month_weeks where month_template_id in ${sql(monthIds)}`;
      await sql`delete from program_month_templates where id in ${sql(monthIds)}`;
    }
    if (weekIds.length) await sql`delete from program_week_templates where id in ${sql(weekIds)}`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('caso propio: crear y reordenar con SUS semanas funciona byte a byte', async () => {
    const monthId = await upsertMonthTemplate({
      coach_id: clubA.coachId,
      payload: { name: 'Mes A', week_template_ids: [weekA1, weekA2] },
      client: sql,
    });
    monthIds.push(Number(monthId));

    const loaded = await getMonthTemplate({ coach_id: clubA.coachId, id: Number(monthId), client: sql });
    expect(loaded?.weeks.map((w) => Number(w.week_template_id))).toEqual([weekA1, weekA2]);
  });

  test('cross-club: un week id de B dentro del payload → 404 y NADA escrito', async () => {
    await expect(
      upsertMonthTemplate({
        coach_id: clubA.coachId,
        payload: { name: 'Mes con semana robada', week_template_ids: [weekA1, weekB] },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await upsertMonthTemplate({
      coach_id: clubA.coachId,
      payload: { name: 'x', week_template_ids: [weekB] },
      client: sql,
    }).catch((err) => expect(err).toBeInstanceOf(ProgramMonthError));

    // Cero meses nuevos del club A con ese nombre, cero junctions hacia weekB.
    const months = await sql<{ n: number }[]>`
      select count(*)::int as n from program_month_templates
      where coach_id = ${clubA.coachId} and name = 'Mes con semana robada'
    `;
    expect(months[0]!.n).toBe(0);
    const junctions = await sql<{ n: number }[]>`
      select count(*)::int as n from program_month_weeks where week_template_id = ${weekB}
    `;
    expect(junctions[0]!.n).toBe(0);
  });

  test('cross-club en UPDATE: el mes existente queda intacto (el guard corre antes del delete)', async () => {
    const monthId = monthIds[0]!;
    await expect(
      upsertMonthTemplate({
        coach_id: clubA.coachId,
        id: monthId,
        payload: { name: 'Mes A v2', week_template_ids: [weekB] },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    // Ni el nombre ni la junction del mes cambiaron.
    const loaded = await getMonthTemplate({ coach_id: clubA.coachId, id: monthId, client: sql });
    expect(loaded?.name).toBe('Mes A');
    expect(loaded?.weeks.map((w) => Number(w.week_template_id))).toEqual([weekA1, weekA2]);
  });
});
