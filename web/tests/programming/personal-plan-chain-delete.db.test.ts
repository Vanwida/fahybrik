// Borrar un tramo de la cadena — lo pendiente desaparece, lo ejecutado se
// conserva (huérfano, en el historial), y el recibo + la plantilla siempre se
// retiran (misma regla que retirePersonalPlan). La diferencia con "Borrar"
// del panel suelto: si el borrado no dejó nada ejecutado huérfano, lo que
// viene detrás en la cadena se recoloca para cerrar el hueco; si dejó algo,
// el hueco se queda tal cual — mover encima chocaría con esa historia real.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import {
  addPersonalTramoToChain,
  deletePersonalTramoFromChain,
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

describeWithDb('deletePersonalTramoFromChain (DB real)', () => {
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

  /** Base(2sem) → Build(3sem) → Peak(2sem), encadenados sobre un ancla de biblioteca de 1 semana. */
  async function seedThreeTramoChain(fx: Fixture, workoutTemplateId: number) {
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
    const peak = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Peak', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(peak.month_template_id));
    return { base, build, peak };
  }

  test('borrar "Build" (nada ejecutado) recoloca "Peak" hacia atrás, sin hueco', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { base, build, peak } = await seedThreeTramoChain(fx, workoutTemplateId);

    const result = await deletePersonalTramoFromChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(build.month_template_id),
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });

    expect(result.preserved_sessions).toBe(0);
    expect(result.reflowed).toBe(true);
    expect(result.reflowed_tramos).toHaveLength(1);
    expect(result.reflowed_tramos[0]!.month_template_id).toBe(peak.month_template_id);
    // "Peak" ahora empieza justo donde "Build" empezaba (Build desapareció
    // entero, así que su hueco de 3 semanas lo cierra "Peak" moviéndose ahí).
    expect(result.reflowed_tramos[0]!.start_date).toBe(build.start_date);
    expect(result.reflowed_tramos[0]!.end_date).toBe(
      isoDateString(addDays(parseIsoDate(build.start_date), 2 * 7 - 1)),
    );

    // "Build" desapareció de verdad: recibo y plantilla fuera.
    const buildGone = await sql`
      select 1 from athlete_month_assignments where month_template_id = ${Number(build.month_template_id)}
    `;
    expect(buildGone).toHaveLength(0);
    const buildTplGone = await sql`
      select 1 from program_month_templates where id = ${Number(build.month_template_id)}
    `;
    expect(buildTplGone).toHaveLength(0);

    // "Base" no se ha tocado.
    const baseRow = await sql<Array<{ start_date: string }>>`
      select to_char(start_date, 'YYYY-MM-DD') as start_date
      from athlete_month_assignments where month_template_id = ${Number(base.month_template_id)}
    `;
    expect(baseRow[0]!.start_date).toBe(base.start_date);

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

  test('borrar "Build" CON una sesión ejecutada conserva el historial y deja el hueco (Peak no se mueve)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { build, peak } = await seedThreeTramoChain(fx, workoutTemplateId);

    const buildMicroIds = await microcycleIdsOf(Number(build.month_template_id));
    const executedId = await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: build.start_date,
      status: 'completed',
      microcycleId: buildMicroIds[0]!,
    });

    const result = await deletePersonalTramoFromChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(build.month_template_id),
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });

    expect(result.preserved_sessions).toBe(1);
    expect(result.reflowed).toBe(false);
    expect(result.reflowed_tramos).toHaveLength(0);

    // La sesión ejecutada sigue exactamente igual, huérfana de plan.
    const survivor = await sql<Array<{ status: string }>>`
      select status::text from workout_assignments where id = ${executedId}
    `;
    expect(survivor).toHaveLength(1);
    expect(survivor[0]!.status).toBe('completed');

    // "Peak" no se ha movido ni un día — el hueco se queda tal cual.
    const peakRow = await sql<Array<{ start_date: string }>>`
      select to_char(start_date, 'YYYY-MM-DD') as start_date
      from athlete_month_assignments where month_template_id = ${Number(peak.month_template_id)}
    `;
    expect(peakRow[0]!.start_date).toBe(peak.start_date);

    // El recibo de "Build" desapareció igualmente (regla de siempre).
    const buildGone = await sql`
      select 1 from athlete_month_assignments where month_template_id = ${Number(build.month_template_id)}
    `;
    expect(buildGone).toHaveLength(0);
  }, 30000);
});
