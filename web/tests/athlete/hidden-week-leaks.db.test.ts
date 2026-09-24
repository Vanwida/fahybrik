/**
 * LO QUE EL COACH TIENE OCULTO NO SE ANUNCIA — contra base de datos REAL
 * (auditoría de la app del atleta, D-19).
 *
 * La puerta de visibilidad es una: una semana en borrador (`weekly_plans.status =
 * 'draft'`) no se ve. El Plan ya la aplicaba; la vista de ciclo anunciaba igual
 * «Simulacro el sábado 10» y la tarjeta de tests contaba «3/4 · falta remo 2K» con
 * tests de semanas retenidas. Aquí se fija:
 *   · el atleta no ve el hito ni el test PENDIENTE de una semana retenida;
 *   · lo que ya HIZO en una semana retenida sí lo ve (su trabajo es suyo);
 *   · el coach sigue viéndolo todo (ficha, Periodización).
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { resolvePlanPath } from '@/lib/plan/camino';
import { loadBatteryStatus } from '@/lib/coach/battery-status';

let session: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));
const { GET: batteryGet } = await import('@/app/api/athlete/test-battery/status/route');

// Tres semanas de un programa: la 1 visible, la 2 y la 3 retenidas por el coach.
const W1 = '2026-10-05';
const W2 = '2026-10-12';
const W3 = '2026-10-19';
const ON_DATE = new Date('2026-10-06T10:00:00Z');

describeWithDb('semanas ocultas: ni hitos ni tests pendientes a la vista del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };
    const simTpl = await makeTemplate({ fx, name: 'Simulacro completo', format: 'hyrox_sim' });
    const testTpl = await makeTemplate({ fx, name: 'Test remo 2K', format: 'test' });
    const test = await sql<Array<{ id: string }>>`
      insert into coach_calibration_tests (coach_id, slug, name) values (${fx.coachId}, ${`row2k-${Date.now()}`}, 'Remo 2K')
      returning id::text
    `;
    const testId = Number(test[0]!.id);
    const add = async (key: string, day: string, templateId: number, status: string, calibration: number | null) => {
      const rows = await sql<Array<{ id: string }>>`
        insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, calibration_test_id)
        values (${fx.athleteId}, ${day}::date, ${templateId}, 1, ${status}::assignment_status, ${calibration})
        returning id::text
      `;
      ids[key] = Number(rows[0]!.id);
    };
    await add('test_visible', '2026-10-07', testTpl, 'scheduled', testId); // semana 1, visible
    await add('test_held_done', '2026-10-13', testTpl, 'completed', testId); // semana 2, retenida, hecho
    await add('test_held_pending', '2026-10-20', testTpl, 'scheduled', testId); // semana 3, retenida
    await add('sim_visible', '2026-10-10', simTpl, 'scheduled', null); // semana 1
    await add('sim_held', '2026-10-24', simTpl, 'scheduled', null); // semana 3, retenida
    for (const week of [W2, W3]) {
      await sql`
        insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
        values (${fx.athleteId}, ${week}::date, 'draft', 'manual')
      `;
    }
    const month = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${fx.coachId}, 'Bloque con tests')
      returning id::text
    `;
    fx.monthTemplates.push({ monthId: Number(month[0]!.id), weekIds: [] });
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids, created_by_coach_id)
      values (${fx.athleteId}, ${Number(month[0]!.id)}, ${W1}::date, '2026-10-25'::date, ${[920001, 920002, 920003]}::bigint[], ${fx.coachId})
    `;
  }, 60_000);

  afterAll(async () => {
    session = null;
    await sql`delete from weekly_plans where athlete_id = ${fx.athleteId}`;
    await sql`delete from athlete_month_assignments where athlete_id = ${fx.athleteId}`;
    await sql`delete from workout_assignments where athlete_id = ${fx.athleteId}`;
    await sql`delete from coach_calibration_tests where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 60_000);

  test('la tarjeta de tests del atleta no cuenta el test pendiente de una semana retenida', async () => {
    const res = await batteryGet(new Request('http://localhost/api/athlete/test-battery/status', {
      headers: { authorization: 'Bearer test' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const seen = body.tests.map((t: { assignment_id: string }) => Number(t.assignment_id)).sort();
    expect(seen).toEqual([ids.test_visible, ids.test_held_done].sort());
    expect(body.total).toBe(2);
  });

  test('el coach sigue viendo los tres en la ficha', async () => {
    const status = await loadBatteryStatus(fx.athleteId, sql);
    expect(status.total).toBe(3);
  });

  test('la vista de ciclo del atleta no anuncia el simulacro de una semana retenida', async () => {
    const path = await resolvePlanPath({ athlete_id: fx.athleteId, on_date: ON_DATE, sql, visibleToAthlete: true });
    const events = path!.segments.flatMap((s) => s.events.map((e) => `${e.kind}:${e.date}`)).sort();
    expect(events).toEqual(['sim:2026-10-10', 'test:2026-10-07', 'test:2026-10-13']);
  });

  test('el camino del coach sí los enseña todos', async () => {
    const path = await resolvePlanPath({ athlete_id: fx.athleteId, on_date: ON_DATE, sql });
    const events = path!.segments.flatMap((s) => s.events.map((e) => `${e.kind}:${e.date}`)).sort();
    expect(events).toEqual([
      'sim:2026-10-10',
      'sim:2026-10-24',
      'test:2026-10-07',
      'test:2026-10-13',
      'test:2026-10-20',
    ]);
  });
});
