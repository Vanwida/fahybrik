/**
 * EL PRIMER PLAN DE UN ATLETA NUEVO EMPIEZA EN LA SEMANA DEL CLUB — contra base de
 * datos REAL.
 *
 * La propuesta de primer programa del alta (`proposeFirstMonthForIntake`, la que
 * sirve `GET /api/coach/intake/[athlete_id]` y usa «proponer el siguiente bloque»)
 * sugiere empezar el lunes de «esta semana» cuando el atleta aún no tiene plan. Es
 * una decisión del COACH sobre el plan: «esta semana» es la del club
 * (`coaches.timezone`; DECISIONS 2026-09-23, «Qué día es en cada sitio»), no la de
 * Madrid (`mondayOfWeekInBox`).
 *
 * Los instantes, elegidos para que el día del club no sea ni el de Madrid ni el UTC:
 *   · lunes 21 sept 03:30 UTC — en Madrid y en UTC ya es lunes 21; en el club de
 *     Ciudad de México aún es el domingo 20: su semana es la del lunes 14;
 *   · domingo 20 sept 13:30 UTC — en Madrid y en UTC sigue siendo domingo 20 (semana
 *     del 14); en el club de Auckland ya es el lunes 21.
 *
 * El reloj: la propuesta lee `new Date()`; se congela SOLO `Date`. Cada caso borra lo
 * suyo (el nivel cae con el coach).
 */

import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { proposeFirstMonthForIntake } from '@/lib/coach/intake-month-proposal';
import { proposeFirstMonthForIntake as proposeFromDashboard } from '@/lib/dashboard/coach/intake-month-proposal';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('propuesta del primer programa: «esta semana» es la del club (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.useRealTimers();
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  /** Un club en `tz` con un nivel, un programa de biblioteca de ese nivel y un
   *  atleta sin ningún plan todavía. */
  async function clubIn(tz: string): Promise<{ fx: Fixture; levelId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await sql`update coaches set timezone = ${tz} where id = ${fx.coachId}`;
    const [level] = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label) values (${fx.coachId}, 'N1', 'Nivel 1') returning id::text
    `;
    const levelId = Number(level!.id);
    const [month] = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, level_id)
      values (${fx.coachId}, 'Mes 1 · Base', ${levelId})
      returning id::text
    `;
    fx.monthTemplates.push({ monthId: Number(month!.id), weekIds: [] });
    return { fx, levelId };
  }

  async function startAt(instant: string, fx: Fixture, levelId: number): Promise<string[]> {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(instant) });
    try {
      const params = { coach_id: fx.coachId, athlete_id: fx.athleteId, level_id: levelId, client: sql };
      const [intake, dashboard] = await Promise.all([
        proposeFirstMonthForIntake(params),
        proposeFromDashboard(params),
      ]);
      return [intake!.suggested_start_date, dashboard!.suggested_start_date];
    } finally {
      vi.useRealTimers();
    }
  }

  it('club en México, domingo 20 por la noche: empieza el lunes 14, no el 21 de Madrid', async () => {
    const { fx, levelId } = await clubIn('America/Mexico_City');
    expect(await startAt('2026-09-21T03:30:00Z', fx, levelId)).toEqual(['2026-09-14', '2026-09-14']);
  });

  it('club en Auckland, lunes 21 de madrugada: empieza el lunes 21, no el 14 de Madrid', async () => {
    const { fx, levelId } = await clubIn('Pacific/Auckland');
    expect(await startAt('2026-09-20T13:30:00Z', fx, levelId)).toEqual(['2026-09-21', '2026-09-21']);
  });

  it('con un plan anterior, empieza el lunes siguiente a su fin, sea cual sea el día', async () => {
    const { fx, levelId } = await clubIn('America/Mexico_City');
    const [month] = await sql<Array<{ id: string }>>`
      select id::text from program_month_templates where coach_id = ${fx.coachId} limit 1
    `;
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, created_by_coach_id)
      values (${fx.athleteId}, ${Number(month!.id)}, '2026-09-07', '2026-10-04', ${fx.coachId})
    `;
    expect(await startAt('2026-09-21T03:30:00Z', fx, levelId)).toEqual(['2026-10-05', '2026-10-05']);
  });
});
