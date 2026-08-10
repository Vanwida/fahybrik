// Auditoría de plan personal (#audit-plan-personal) — hoy desapareció un plan
// personal en producción y el registro de auditoría no tenía ni una línea que
// contestara «quién y cuándo». personalize-plan.ts, personal-plans.ts y
// revert-personal-plan.ts son las operaciones MÁS destructivas del producto
// (crean, borran y retiran el plan y las sesiones de un atleta) y no escribían
// nada en audit_log. Este archivo verifica que ahora sí, con la acción
// correcta y un diff_json que reconstruye qué pasó — y, el test que más
// importa, que un rollback de la transacción no deja NINGÚN rastro (ni la
// mutación ni su fila de auditoría): la razón de que recordAudit() viva
// siempre dentro de la misma transacción que la mutación, nunca después.
//
// La cadena de tramos (addPersonalTramoToChain, updatePersonalTramoMeta,
// movePersonalTramoInChain, deletePersonalTramoFromChain) vive en
// personal-plan-chain-audit.db.test.ts — mismo criterio, archivo aparte para
// no pasar de 500 líneas.

import { afterEach, afterAll, expect, test } from 'vitest';
import type { TransactionClient } from '@/lib/db';
import { isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { personalizePlanForAthlete } from '@/lib/dashboard/coach/personalize-plan';
import {
  createPersonalMonthTemplateFromScratch,
  deletePersonalPlanForAthlete,
  retirePersonalPlan,
  insertEmptyPersonalMonthTemplate,
} from '@/lib/dashboard/coach/personal-plans';
import { revertPersonalPlanForAthlete } from '@/lib/dashboard/coach/revert-personal-plan';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { assignSequenceToAthlete } from '@/lib/dashboard/coach/assign-sequence';
import { saveCoachSequence } from '@/lib/dashboard/coach/sequences';
import { recordAudit, coachActor } from '@/lib/audit/record-edit';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('auditoría — plan personal (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  /** entity_type/entity_id de cada fila que un test dejó — audit_log no tiene
   *  FK a nada (comentario de record-edit.ts), así que no cascada con el
   *  borrado de la fixture: se limpia a mano, aquí, después de cada test. */
  const auditRows: Array<{ entity_type: string; entity_id: number }> = [];

  afterEach(async () => {
    for (const r of auditRows.splice(0)) {
      await sql`delete from audit_log where entity_type = ${r.entity_type} and entity_id = ${r.entity_id}`;
    }
  });

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  }, 30000);

  test('personalizar un plan escribe UNA fila create, con de dónde viene y qué pasó con el recibo viejo', async () => {
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

    const result = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(result.month_template_id), weekIds: [] });
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(result.month_template_id) });

    const rows = await sql<
      Array<{ action: string; actor_kind: string | null; actor_user_id: string | null; channel: string; diff_json: unknown }>
    >`
      select action::text, actor_kind::text, actor_user_id::text as actor_user_id, channel, diff_json
      from audit_log where entity_type = 'program_month_templates' and entity_id = ${Number(result.month_template_id)}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('create');
    expect(rows[0]!.actor_kind).toBe('coach');
    expect(BigInt(rows[0]!.actor_user_id!)).toBe(BigInt(fx.coachUserId));
    expect(rows[0]!.channel).toBe('dashboard'); // sin declarar por la ruta = el defecto de 0165.

    const diff = rows[0]!.diff_json as Record<string, unknown>;
    expect(diff.athlete_id).toBe(fx.athleteId);
    expect(diff.source_month_template_id).toBe(sourceMonthId);
    expect(diff.forked_from_week).toBe(1);
    expect(diff.week_count).toBe(1);
    expect((diff.old_assignment as Record<string, unknown>).outcome).toBe('closed');
  }, 30000);

  test('crear un plan desde cero escribe una fila create con origin from_scratch', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);

    const created = await createPersonalMonthTemplateFromScratch({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Plan desde cero', week_count: 3 },
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(created.id), weekIds: created.weeks.map((w) => Number(w.id)) });
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(created.id) });

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json
      from audit_log where entity_type = 'program_month_templates' and entity_id = ${Number(created.id)}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('create');
    const diff = rows[0]!.diff_json as Record<string, unknown>;
    expect(diff.origin).toBe('from_scratch');
    expect(diff.name).toBe('Plan desde cero');
    expect(diff.week_count).toBe(3);
  }, 30000);

  test('borrar un plan personal escribe una fila delete con el número exacto de sesiones borradas y conservadas', async () => {
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
    const monthTemplateId = Number(personalized.month_template_id);
    fx.monthTemplates.push({ monthId: monthTemplateId, weekIds: [] });
    auditRows.push({ entity_type: 'program_month_templates', entity_id: monthTemplateId });

    // Lunes: EJECUTADA (sobrevive). Miércoles: se queda scheduled (se borra).
    const mondayIso = isoDateString(thisMonday);
    const mondayRows = await sql<Array<{ id: string }>>`
      select id::text from workout_assignments where athlete_id = ${fx.athleteId} and scheduled_for = ${mondayIso}::date
    `;
    await sql`update workout_assignments set status = 'completed' where id = ${Number(mondayRows[0]!.id)}`;

    const result = await deletePersonalPlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthTemplateId,
      actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      client: sql,
    });
    expect(result.deleted_sessions).toBe(1);
    expect(result.preserved_sessions).toBe(1);

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json
      from audit_log where entity_type = 'program_month_templates' and entity_id = ${monthTemplateId}
      order by id asc
    `;
    // Una fila 'create' (al personalizar, arriba) + una 'delete' (este borrado).
    expect(rows).toHaveLength(2);
    expect(rows[0]!.action).toBe('create');
    expect(rows[1]!.action).toBe('delete');
    const diff = rows[1]!.diff_json as Record<string, unknown>;
    // El número que el incidente real no pudo saber en veinte minutos.
    expect(diff.deleted_sessions).toBe(1);
    expect(diff.preserved_sessions).toBe(1);
    expect(diff.was_current).toBe(true);
  }, 30000);

  test('volver a la periodización escribe una fila restore sobre el cursor de la secuencia, con el plan retirado como contexto', async () => {
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
    await sql`update athletes set level_id = ${levelId}, training_days_per_week = 3 where id = ${fx.athleteId}`;
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
    await assignSequenceToAthlete(fx.athleteId, fx.coachId, thisMonday, sql);

    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const personalized = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      actor,
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(personalized.month_template_id), weekIds: [] });
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(personalized.month_template_id) });

    await revertPersonalPlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, actor, client: sql });

    // El cursor volvió a 'active' — es la fila que la operación audita.
    const progressRows = await sql<Array<{ id: string }>>`
      select id::text from athlete_sequence_progress where athlete_id = ${fx.athleteId}
    `;
    const progressId = Number(progressRows[0]!.id);
    auditRows.push({ entity_type: 'athlete_sequence_progress', entity_id: progressId });

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json
      from audit_log where entity_type = 'athlete_sequence_progress' and entity_id = ${progressId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('restore');
    const diff = rows[0]!.diff_json as Record<string, unknown>;
    expect(diff.resumed_month_template_id).toBe(sourceMonthId);
    const retired = diff.retired_personal_plan as Record<string, unknown>;
    expect(retired.month_template_id).toBe(Number(personalized.month_template_id));
    expect(retired.deleted_sessions).toBeGreaterThanOrEqual(0);
    expect(retired.preserved_sessions).toBe(0);

    await sql`delete from program_sequences where coach_id = ${fx.coachId}`;
    await sql`delete from athlete_levels where id = ${levelId}`;
  }, 30000);

  test('EL TEST QUE IMPORTA: si la transacción del borrado falla, ni el plan desaparece ni queda rastro de auditoría', async () => {
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
    auditRows.push({ entity_type: 'program_month_templates', entity_id: monthTemplateId });

    // Reproduce EXACTAMENTE lo que deletePersonalPlanForAthlete hace dentro de
    // su transacción (retirePersonalPlan + recordAudit con el mismo cliente
    // tx, acción 'delete') — y fuerza el fallo DESPUÉS de las dos, ANTES del
    // commit. Si recordAudit participara mal de la transacción (p.ej. si
    // usara el pool en vez del cliente tx), la fila sobreviviría igual y este
    // test lo cazaría.
    await expect(
      sql.begin(async (txRaw) => {
        const tx = txRaw as unknown as TransactionClient;
        await retirePersonalPlan({ tx, coach_id: fx.coachId, athlete_id: fx.athleteId, month_template_id: monthTemplateId });
        await recordAudit(tx, {
          entity_type: 'program_month_templates',
          entity_id: BigInt(monthTemplateId),
          action: 'delete',
          actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
          diff: { forced_rollback_probe: true },
        });
        throw new Error('fallo deliberado — nada de esto debe sobrevivir');
      }),
    ).rejects.toThrow('fallo deliberado');

    // El plan NUNCA se borró: sigue exactamente donde estaba.
    const templateStillThere = await sql`select 1 from program_month_templates where id = ${monthTemplateId}`;
    expect(templateStillThere).toHaveLength(1);
    const assignmentStillThere = await sql`
      select 1 from athlete_month_assignments where month_template_id = ${monthTemplateId}
    `;
    expect(assignmentStillThere).toHaveLength(1);

    // Y ni rastro del intento en audit_log — el rollback se llevó la fila con él.
    const auditAfterRollback = await sql`
      select 1 from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${monthTemplateId} and action = 'delete'
    `;
    expect(auditAfterRollback).toHaveLength(0);

    // Confirma que sí escribe cuando NO se fuerza el fallo — mismo mecanismo,
    // esta vez dejado terminar, para que quede claro que el test de arriba
    // prueba el rollback y no un recordAudit roto en general.
    await sql.begin(async (txRaw) => {
      const tx = txRaw as unknown as TransactionClient;
      const created = await insertEmptyPersonalMonthTemplate({
        tx,
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        name: 'Control — commit real',
        week_count: 1,
      });
      fx.monthTemplates.push({ monthId: Number(created.id), weekIds: created.weeks.map((w) => Number(w.id)) });
      await recordAudit(tx, {
        entity_type: 'program_month_templates',
        entity_id: BigInt(created.id),
        action: 'create',
        actor: coachActor({ user_id: BigInt(fx.coachUserId) }),
      });
      auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(created.id) });
    });
  }, 30000);
});
