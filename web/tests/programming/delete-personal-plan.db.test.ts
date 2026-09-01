// Borrar un plan personal (0166) — la regla dura: una sesión ya EJECUTADA
// (status completed, o con una workout_executions real) nunca se borra. El
// resto (pendiente) sí, y el recibo + la plantilla del plan siempre se
// retiran, haya o no historial superviviente.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { personalizePlanForAthlete } from '@/lib/dashboard/coach/personalize-plan';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import {
  deletePersonalPlanForAthlete,
  ProgramMonthError,
} from '@/lib/dashboard/coach/personal-plans';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { coachActor } from '@/lib/audit/record-edit';

describeWithDb('deletePersonalPlanForAthlete (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('una sesión completada sobrevive al borrado; la pendiente se elimina; el recibo y la plantilla siempre se retiran', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1, 3],
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

    const personalized = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(personalized.month_template_id), weekIds: [] });
    const monthTemplateId = Number(personalized.month_template_id);

    const mondayIso = isoDateString(thisMonday);
    const wedIso = isoDateString(addDays(thisMonday, 2));
    const mondayRows = await sql<Array<{ id: string }>>`
      select id::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = ${mondayIso}::date
    `;
    const wedRows = await sql<Array<{ id: string }>>`
      select id::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = ${wedIso}::date
    `;
    expect(mondayRows[0]).toBeDefined();
    expect(wedRows[0]).toBeDefined();
    const completedId = Number(mondayRows[0]!.id);
    const pendingId = Number(wedRows[0]!.id);

    // Monday: EJECUTADA de verdad (status + fila de ejecución real — la regla
    // mira ambas señales, no solo el status). Wednesday: se queda `scheduled`.
    await sql`update workout_assignments set status = 'completed' where id = ${completedId}`;
    await sql`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, perceived_exertion)
      values (${completedId}, ${fx.athleteId}, now(), now(), 7)
    `;

    const microcycleRows = await sql<Array<{ microcycle_id: string }>>`
      select microcycle_id::text from workout_assignments where id = ${completedId}
    `;
    const microcycleId = Number(microcycleRows[0]!.microcycle_id);

    const result = await deletePersonalPlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthTemplateId,
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });

    expect(result.deleted_sessions).toBe(1); // wednesday, pendiente
    expect(result.preserved_sessions).toBe(1); // monday, ejecutada
    expect(result.was_current).toBe(true);
    expect(result.deleted_microcycles).toBe(0); // el microciclo sobrevive (tiene la completada)

    // La completada sigue intacta, tal cual estaba.
    const survivor = await sql<Array<{ status: string }>>`
      select status::text from workout_assignments where id = ${completedId}
    `;
    expect(survivor).toHaveLength(1);
    expect(survivor[0]!.status).toBe('completed');

    // La pendiente ha desaparecido de verdad.
    const gone = await sql`select 1 from workout_assignments where id = ${pendingId}`;
    expect(gone).toHaveLength(0);

    // El microciclo que la alberga sigue en pie — todavía tiene la completada.
    const microStill = await sql`select 1 from microcycles where id = ${microcycleId}`;
    expect(microStill).toHaveLength(1);

    // El recibo y la plantilla del plan personal se han ido, aunque quede
    // historial huérfano colgando de ellos.
    const receiptRows = await sql`
      select 1 from athlete_month_assignments where month_template_id = ${monthTemplateId}
    `;
    expect(receiptRows).toHaveLength(0);
    const templateRows = await sql`select 1 from program_month_templates where id = ${monthTemplateId}`;
    expect(templateRows).toHaveLength(0);

    // Segundo borrado del mismo plan: ya no existe → 404 honesto, no un 500.
    await expect(
      deletePersonalPlanForAthlete({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: monthTemplateId,
        actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
        client: sql,
      }),
    ).rejects.toBeInstanceOf(ProgramMonthError);
  }, 30000);

  test('un plan personal SIN ninguna sesión ejecutada se borra por completo, microciclos incluidos', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
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
    const personalized = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });
    const monthTemplateId = Number(personalized.month_template_id);
    fx.monthTemplates.push({ monthId: monthTemplateId, weekIds: [] });

    const result = await deletePersonalPlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthTemplateId,
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });

    expect(result.preserved_sessions).toBe(0);
    expect(result.deleted_sessions).toBeGreaterThan(0);
    expect(result.deleted_microcycles).toBeGreaterThan(0);

    const anyLeft = await sql`
      select 1 from workout_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(anyLeft).toHaveLength(0);
  }, 30000);
});
