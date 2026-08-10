// Editar duración de un tramo de la cadena — alargar añade semanas vacías al
// final; acortar sólo puede quitar semanas SIN sesiones ejecutadas (se niega
// con el suelo real, nunca se limita en silencio). Cuando la duración cambia,
// lo que viene detrás en la cadena se recoloca.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import {
  addPersonalTramoToChain,
  updatePersonalTramoMeta,
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

describeWithDb('updatePersonalTramoMeta — duración (DB real)', () => {
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

  async function microcycleIdsOf(monthTemplateId: number): Promise<number[]> {
    const rows = await sql<Array<{ microcycle_ids: string[] | null }>>`
      select microcycle_ids from athlete_month_assignments where month_template_id = ${monthTemplateId}
    `;
    return (rows[0]?.microcycle_ids ?? []).map(Number);
  }

  test('acortar por debajo del suelo se niega con el nº exacto de semanas que bloquean', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
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

    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 3 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));
    const build = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Build', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(build.month_template_id));

    // Una sesión EJECUTADA en la ÚLTIMA semana de "Base" (semana 3, índice 2)
    // — el suelo real de "acortar" pasa a ser 2 semanas.
    const baseMicroIds = await microcycleIdsOf(Number(base.month_template_id));
    expect(baseMicroIds).toHaveLength(3);
    const thirdWeekMonday = addDays(parseIsoDate(base.start_date), 2 * 7);
    await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: isoDateString(thirdWeekMonday),
      status: 'completed',
      microcycleId: baseMicroIds[2]!,
    });

    // Pedir 1 semana (por debajo del suelo de 2) se rechaza.
    let err: PersonalChainError | null = null;
    try {
      await updatePersonalTramoMeta({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(base.month_template_id),
        payload: { week_count: 1 },
        actor,
        client: sql,
      });
    } catch (e) {
      err = e as PersonalChainError;
    }
    expect(err).toBeInstanceOf(PersonalChainError);
    expect(err!.code).toBe('shrink_blocked_by_history');
    expect(err!.message).toContain('2');

    // Nada cambió: "Base" sigue con sus 3 semanas y sus fechas originales.
    const stillThree = await microcycleIdsOf(Number(base.month_template_id));
    expect(stillThree).toHaveLength(3);
    const buildUnchanged = await sql<Array<{ start_date: string }>>`
      select to_char(start_date, 'YYYY-MM-DD') as start_date
      from athlete_month_assignments where month_template_id = ${Number(build.month_template_id)}
    `;
    expect(buildUnchanged[0]!.start_date).toBe(build.start_date);
  }, 30000);

  test('acortar hasta el suelo exacto funciona y recoloca lo que viene detrás', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
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

    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 3 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));
    const build = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Build', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(build.month_template_id));

    // Sin nada ejecutado — acortar "Base" de 3 a 2 semanas es libre.
    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { week_count: 2 },
      actor,
      client: sql,
    });
    expect(result.week_count).toBe(2);
    expect(result.end_date).toBe(isoDateString(addDays(parseIsoDate(base.start_date), 2 * 7 - 1)));
    expect(result.reflowed).toHaveLength(1);
    expect(result.reflowed[0]!.month_template_id).toBe(build.month_template_id);
    // "Build" se adelanta una semana entera (lo que "Base" acaba de perder).
    expect(result.reflowed[0]!.start_date).toBe(isoDateString(addDays(parseIsoDate(build.start_date), -7)));

    const baseMicroIds = await microcycleIdsOf(Number(base.month_template_id));
    expect(baseMicroIds).toHaveLength(2);

    // La cadena entera sigue sin solapes.
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

  test('alargar añade semanas vacías al final y empuja lo siguiente', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(mondayOfWeek(new Date())),
      client: sql,
    });

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
      payload: { name: 'Build', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(build.month_template_id));

    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { week_count: 4 },
      actor,
      client: sql,
    });
    expect(result.week_count).toBe(4);
    const baseMicroIds = await microcycleIdsOf(Number(base.month_template_id));
    expect(baseMicroIds).toHaveLength(4);
    expect(result.reflowed[0]!.start_date).toBe(isoDateString(addDays(parseIsoDate(build.start_date), 14)));
  }, 30000);

  test('alargar funciona aunque la PRIMERA semana del tramo ya tenga una sesión ejecutada — sólo se toca la punta', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(mondayOfWeek(new Date())),
      client: sql,
    });

    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));

    // Sesión EJECUTADA en la primera semana de "Base" — alargar el final NUNCA
    // debería bloquearse por esto: alargar no toca lo de atrás.
    const baseMicroIds = await microcycleIdsOf(Number(base.month_template_id));
    const executedId = await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: base.start_date,
      status: 'completed',
      microcycleId: baseMicroIds[0]!,
    });

    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { week_count: 5 },
      actor,
      client: sql,
    });
    expect(result.week_count).toBe(5);
    expect(result.start_date).toBe(base.start_date); // el inicio NUNCA se mueve al alargar.
    expect(result.end_date).toBe(isoDateString(addDays(parseIsoDate(base.start_date), 5 * 7 - 1)));

    // La sesión ejecutada de la semana 1 sigue exactamente igual — nunca se
    // borró ni se recreó su microciclo.
    const survivor = await sql<Array<{ status: string; microcycle_id: string }>>`
      select status::text, microcycle_id::text from workout_assignments where id = ${executedId}
    `;
    expect(survivor).toHaveLength(1);
    expect(survivor[0]!.status).toBe('completed');
    expect(Number(survivor[0]!.microcycle_id)).toBe(baseMicroIds[0]);

    const nowFive = await microcycleIdsOf(Number(base.month_template_id));
    expect(nowFive).toHaveLength(5);
    // Las 2 semanas originales siguen siendo los MISMOS microciclos (nunca
    // recreados); sólo se añadieron 3 nuevos al final.
    expect(nowFive.slice(0, 2)).toEqual(baseMicroIds);
  }, 30000);

  test('renombrar sin tocar semanas no dispara reflow ni mueve nada', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(mondayOfWeek(new Date())),
      client: sql,
    });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));

    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { name: 'Base sólida' },
      actor,
      client: sql,
    });
    expect(result.name).toBe('Base sólida');
    expect(result.week_count).toBe(2);
    expect(result.start_date).toBe(base.start_date);
    expect(result.reflowed).toHaveLength(0);
  }, 30000);
});
