// Reordenar la cadena — intercambio con el vecino inmediato. La regla dura:
// ninguno de los dos implicados se mueve si cualquiera de los dos ya tiene una
// sesión ejecutada.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import {
  addPersonalTramoToChain,
  movePersonalTramoInChain,
  PersonalChainError,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import { coachActor } from '@/lib/audit/record-edit';

describeWithDb('movePersonalTramoInChain (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function trackForCleanup(fx: Fixture, monthId: number) {
    const rows = await sql<Array<{ id: string }>>`
      select week_template_id::text as id from program_month_weeks where month_template_id = ${monthId}
    `;
    fx.monthTemplates.push({ monthId, weekIds: rows.map((r) => Number(r.id)) });
  }

  /** Base + Build encadenados sobre un anclaje de biblioteca de 1 semana. */
  async function seedChain(fx: Fixture, workoutTemplateId: number) {
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    const thisMonday = mondayOfWeek(new Date());
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(thisMonday),
      client: sql,
    });
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));
    const build = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Build', week_count: 3 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(build.month_template_id));
    return { base, build };
  }

  async function firstMicrocycleId(monthTemplateId: number): Promise<number> {
    const rows = await sql<Array<{ microcycle_ids: string[] | null }>>`
      select microcycle_ids from athlete_month_assignments where month_template_id = ${monthTemplateId}
    `;
    return Number(rows[0]!.microcycle_ids![0]);
  }

  test('con una sesión ejecutada en "Base", el swap con "Build" se rechaza y nada se mueve', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { base, build } = await seedChain(fx, workoutTemplateId);

    const baseMicroId = await firstMicrocycleId(Number(base.month_template_id));
    await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: base.start_date,
      status: 'completed',
      microcycleId: baseMicroId,
    });

    let err: PersonalChainError | null = null;
    try {
      await movePersonalTramoInChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(base.month_template_id),
        payload: { direction: 'down' },
        actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
        client: sql,
      });
    } catch (e) {
      err = e as PersonalChainError;
    }
    expect(err).toBeInstanceOf(PersonalChainError);
    expect(err!.code).toBe('has_executed_sessions');
    expect(err!.message).toContain('Base');

    // Nada se movió: mismas fechas que antes del intento.
    const after = await sql<Array<{ month_template_id: string; start_date: string }>>`
      select month_template_id::text, to_char(start_date, 'YYYY-MM-DD') as start_date
      from athlete_month_assignments where athlete_id = ${fx.athleteId}
      order by start_date asc
    `;
    const baseRow = after.find((r) => r.month_template_id === base.month_template_id);
    const buildRow = after.find((r) => r.month_template_id === build.month_template_id);
    expect(baseRow!.start_date).toBe(base.start_date);
    expect(buildRow!.start_date).toBe(build.start_date);
  }, 30000);

  test('sin nada ejecutado, "Build" sube y se intercambia con "Base" — las fechas se recalculan', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { base, build } = await seedChain(fx, workoutTemplateId);

    const result = await movePersonalTramoInChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(build.month_template_id),
      payload: { direction: 'up' },
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });
    expect(result.moved).toHaveLength(2);

    const after = await sql<Array<{ month_template_id: string; start_date: string; end_date: string }>>`
      select month_template_id::text, to_char(start_date, 'YYYY-MM-DD') as start_date,
             to_char(end_date, 'YYYY-MM-DD') as end_date
      from athlete_month_assignments where athlete_id = ${fx.athleteId}
      order by start_date asc
    `;
    const buildRow = after.find((r) => r.month_template_id === build.month_template_id)!;
    const baseRow = after.find((r) => r.month_template_id === base.month_template_id)!;

    // "Build" (3 sem) ahora ocupa el sitio que tenía "Base" (empieza donde
    // empezaba Base); "Base" (2 sem) le sigue justo después, sin hueco.
    expect(buildRow.start_date).toBe(base.start_date);
    expect(buildRow.end_date).toBe(isoDateString(addDays(parseIsoDate(base.start_date), 3 * 7 - 1)));
    expect(baseRow.start_date).toBe(isoDateString(addDays(parseIsoDate(buildRow.end_date), 1)));
    // El hueco combinado no cambia: el final de "Base" tras el swap es el
    // mismo día que el final de "Build" antes del swap.
    expect(baseRow.end_date).toBe(build.end_date);

    // Y sigue sin haber ni un solo solape entre recibos del atleta.
    const overlaps = await sql<Array<{ n: string }>>`
      select count(*)::text as n
      from athlete_month_assignments a1
      where a1.athlete_id = ${fx.athleteId}
        and exists (
          select 1 from athlete_month_assignments a2
          where a2.athlete_id = a1.athlete_id and a2.id <> a1.id
            and daterange(a2.start_date, a2.end_date, '[]') && daterange(a1.start_date, a1.end_date, '[]')
        )
    `;
    expect(Number(overlaps[0]!.n)).toBe(0);
  }, 30000);

  test('mover el primero hacia arriba se rechaza — no hay vecino', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { base } = await seedChain(fx, workoutTemplateId);

    await expect(
      movePersonalTramoInChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(base.month_template_id),
        payload: { direction: 'up' },
        actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'no_neighbor' });
  }, 30000);
});
