// Volver a la periodización (0166) — la inversa de personalizar: reactiva la
// secuencia (nivel×días) donde el atleta se quedó y retira el plan personal.

import { afterAll, expect, test } from 'vitest';
import { isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { personalizePlanForAthlete } from '@/lib/dashboard/coach/personalize-plan';
import { assignSequenceToAthlete } from '@/lib/dashboard/coach/assign-sequence';
import { saveCoachSequence } from '@/lib/dashboard/coach/sequences';
import {
  RevertPersonalPlanError,
  canRevertToSequence,
  revertPersonalPlanForAthlete,
} from '@/lib/dashboard/coach/revert-personal-plan';
import { createPersonalMonthTemplateFromScratch } from '@/lib/dashboard/coach/personal-plans';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('revertPersonalPlanForAthlete (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('reactiva la secuencia donde el atleta se quedó y retira el plan personal (sin tocar el cursor de progreso)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });
    const { monthId: sourceMonthId } = await makeMonthTemplate({
      fx,
      weekCount: 2,
      workoutDays: [1],
      workoutTemplateId,
    });

    const levelRows = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${fx.coachId}, 'N1', 'Nivel 1', 1)
      returning id::text
    `;
    const levelId = Number(levelRows[0]!.id);
    await sql`
      update athletes set level_id = ${levelId}, training_days_per_week = 3 where id = ${fx.athleteId}
    `;

    await saveCoachSequence(
      fx.coachId,
      {
        level_id: levelId,
        days_per_week: 3,
        end_policy: 'stop',
        progression_pct: null,
        progression_applies_to: null,
        items: [{ month_template_id: sourceMonthId }],
      },
      sql,
    );

    const thisMonday = isoDateString(mondayOfWeek(new Date()));
    const assigned = await assignSequenceToAthlete(fx.athleteId, fx.coachId, thisMonday, sql);
    expect(assigned.already_enrolled).toBe(false);

    // Sin plan personal todavía → nada a lo que volver.
    expect(await canRevertToSequence({ athlete_id: fx.athleteId, client: sql })).toBe(false);

    const personalized = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(personalized.month_template_id), weekIds: [] });
    expect(personalized.sequence_detached).toBe(true);

    const progressBefore = await sql<Array<{ status: string; current_position: number }>>`
      select status::text, current_position from athlete_sequence_progress where athlete_id = ${fx.athleteId}
    `;
    expect(progressBefore[0]!.status).toBe('detached');
    expect(progressBefore[0]!.current_position).toBe(1);

    expect(await canRevertToSequence({ athlete_id: fx.athleteId, client: sql })).toBe(true);

    const reverted = await revertPersonalPlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      client: sql,
    });
    expect(reverted.materialized_month_template_id).toBe(sourceMonthId);
    expect(reverted.position).toBe(1);

    // El cursor vuelve a 'active' — MISMA posición, no se reinicia.
    const progressAfter = await sql<Array<{ status: string; current_position: number }>>`
      select status::text, current_position from athlete_sequence_progress where athlete_id = ${fx.athleteId}
    `;
    expect(progressAfter[0]!.status).toBe('active');
    expect(progressAfter[0]!.current_position).toBe(1);

    // El atleta está de vuelta en la plantilla de BIBLIOTECA, no en una personal.
    const current = await getCurrentMicrociclo({ athlete_id: fx.athleteId, client: sql });
    expect(current).not.toBeNull();
    expect(current!.template_athlete_id).toBeNull();
    expect(Number(current!.month_template_id)).toBe(sourceMonthId);

    // El plan personal (recibo + plantilla) se ha retirado.
    const personalTemplateId = Number(personalized.month_template_id);
    const templateRows = await sql`select 1 from program_month_templates where id = ${personalTemplateId}`;
    expect(templateRows).toHaveLength(0);
    const receiptRows = await sql`
      select 1 from athlete_month_assignments where month_template_id = ${personalTemplateId}
    `;
    expect(receiptRows).toHaveLength(0);

    // Y no hay dos recibos solapados a la vez (0166) — exactamente uno.
    const allReceipts = await sql`select 1 from athlete_month_assignments where athlete_id = ${fx.athleteId}`;
    expect(allReceipts).toHaveLength(1);

    // saveCoachSequence/athlete_levels no son propiedad de la fixture genérica
    // (mismo patrón de limpieza manual que personalize-plan.db.test.ts) —
    // program_sequence_items referencia sourceMonthId, así que tiene que
    // desaparecer ANTES de que fx.cleanup() intente borrar ese month template.
    await sql`delete from program_sequences where coach_id = ${fx.coachId}`;
    await sql`delete from athlete_levels where id = ${levelId}`;
  }, 30000);

  test('un plan personal creado DESDE CERO no tiene secuencia a la que volver — rechaza con no_sequence_to_resume', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);

    const created = await createPersonalMonthTemplateFromScratch({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Plan desde cero', week_count: 1 },
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(created.id), weekIds: created.weeks.map((w) => Number(w.id)) });

    // Nunca activado (ningún assign-month) → no hay plan "actual" que revertir.
    await expect(
      revertPersonalPlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql }),
    ).rejects.toMatchObject({ code: 'not_personal' });
  });

  test('rechaza volver cuando el atleta no tiene ningún plan personal activo', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await expect(
      revertPersonalPlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql }),
    ).rejects.toBeInstanceOf(RevertPersonalPlanError);
  });
});
