// Auditoría de la cadena de tramos personales (#audit-plan-personal) — mismo
// motivo que personal-plan-audit.db.test.ts: añadir, editar, reordenar y
// borrar un tramo de la cadena tampoco escribían nada en audit_log. Este
// archivo cubre personal-plan-chain-mutations.ts (añadir, editar) y
// personal-plan-chain-reorder.ts (reordenar, borrar).
//
// Un caso propio de esta familia que NO existe en el resto: editar la
// duración de un tramo son DOS transacciones reales distintas (el contenedor
// — nombre + nº de semanas objetivo — y, sólo si el tamaño cambia, el
// redimensionado en sitio del recibo en personal-plan-chain-resize.ts, que
// puede borrar sesiones). Cada una audita la suya: una sola llamada a
// updatePersonalTramoMeta puede dejar UNA fila (solo renombrar) o DOS (si
// además redimensiona) — nunca un fake de "una operación, una fila" que no
// reflejaría los commits reales.

import { afterEach, afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import {
  addPersonalTramoToChain,
  updatePersonalTramoMeta,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { movePersonalTramoInChain, deletePersonalTramoFromChain } from '@/lib/dashboard/coach/personal-plan-chain-reorder';
import { resizeAssignmentInPlace } from '@/lib/dashboard/coach/personal-plan-chain-resize';
import { emptyWeekSlots, normalizeWeekSlots } from '@/lib/dashboard/coach/program-week-slots';
import { coachActor } from '@/lib/audit/record-edit';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('auditoría — cadena de tramos personales (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
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

  /** Coach + atleta con UN microciclo de biblioteca ya asignado (ancla de la
   *  cadena) — el punto de partida que las cuatro operaciones necesitan. */
  async function seedAnchoredAthlete(): Promise<{ fx: Fixture; workoutTemplateId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
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
    return { fx, workoutTemplateId };
  }

  async function trackForCleanup(fx: Fixture, monthId: number) {
    const rows = await sql<Array<{ id: string }>>`
      select week_template_id::text as id from program_month_weeks where month_template_id = ${monthId}
    `;
    fx.monthTemplates.push({ monthId, weekIds: rows.map((r) => Number(r.id)) });
  }

  test('añadir un tramo a la cadena escribe una fila create con desde dónde encadena', async () => {
    const { fx } = await seedAnchoredAthlete();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });

    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    const monthId = Number(base.month_template_id);
    await trackForCleanup(fx, monthId);
    auditRows.push({ entity_type: 'program_month_templates', entity_id: monthId });

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${monthId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('create');
    const diff = rows[0]!.diff_json as Record<string, unknown>;
    expect(diff.name).toBe('Base');
    expect(diff.week_count).toBe(2);
    expect(diff.start_date).toBe(base.start_date);
  }, 30000);

  test('renombrar sin redimensionar escribe EXACTAMENTE una fila update', async () => {
    const { fx } = await seedAnchoredAthlete();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    const monthId = Number(base.month_template_id);
    await trackForCleanup(fx, monthId);
    auditRows.push({ entity_type: 'program_month_templates', entity_id: monthId });

    await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthId,
      payload: { name: 'Base sólida' },
      actor,
      client: sql,
    });

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${monthId}
      order by id asc
    `;
    // create (al añadir) + update (al renombrar) — NUNCA una segunda fila de
    // resize, porque el nº de semanas no cambió.
    expect(rows).toHaveLength(2);
    expect(rows[1]!.action).toBe('update');
    const diff = rows[1]!.diff_json as Record<string, unknown>;
    expect(diff.name_before).toBe('Base');
    expect(diff.name_after).toBe('Base sólida');
    expect(diff.week_count_before).toBe(diff.week_count_after);
  }, 30000);

  // LAS DOS SIGUIENTES llaman resizeAssignmentInPlace DIRECTAMENTE en vez de
  // pasar por updatePersonalTramoMeta({payload:{week_count}}) — que es como
  // llega en producción. Motivo, verificado y AJENO a esta entrega: cambiar
  // el nº de semanas de un tramo hoy revienta con "client.begin is not a
  // function" — appendEmptyWeekToMonth/removeWeekFromMonth
  // (shared/domain/coach/program-months.ts) abren su PROPIA transacción
  // sobre un cliente que updatePersonalTramoMeta YA tiene en transacción, y
  // un cliente en transacción de postgres.js no expone `.begin` (solo
  // `.savepoint`). Reproducido IDÉNTICO ejecutando
  // personal-plan-chain-resize.db.test.ts tal cual está en main, sin tocar
  // una sola línea — no es un efecto de este cambio. Como el fallo ocurre
  // ANTES de llegar a la fila de auditoría de updatePersonalTramoMeta (está
  // dentro de la MISMA transacción, y por tanto también se deshace), hoy no
  // hay forma de probar "redimensionar vía la ruta pública" de punta a
  // punta — así que estos dos tests prueban la pieza que SÍ es de esta
  // entrega (resizeAssignmentInPlace, personal-plan-chain-resize.ts) de
  // forma aislada, reproduciendo a mano la precondición que su propio
  // comentario exige: program_month_weeks ya con el nº de semanas objetivo.
  test('resizeAssignmentInPlace (alargar) escribe su propia fila update, con fechas y semanas antes/después', async () => {
    const { fx } = await seedAnchoredAthlete();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    const monthId = Number(base.month_template_id);
    await trackForCleanup(fx, monthId);
    auditRows.push({ entity_type: 'program_month_templates', entity_id: monthId });

    const emptyWeek = JSON.parse(JSON.stringify(normalizeWeekSlots(emptyWeekSlots())));
    const entry = fx.monthTemplates.find((m) => m.monthId === monthId)!;
    for (let position = 2; position < 4; position++) {
      const weekRows = await sql<Array<{ id: string }>>`
        insert into program_week_templates (coach_id, name, athlete_id, slots_json)
        values (${fx.coachId}, ${'Base · Semana ' + (position + 1)}, ${fx.athleteId}, ${sql.json(emptyWeek)})
        returning id::text
      `;
      const weekId = Number(weekRows[0]!.id);
      entry.weekIds.push(weekId);
      await sql`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${monthId}, ${weekId}, ${position})
      `;
    }

    const resized = await resizeAssignmentInPlace({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthId,
      actor,
      client: sql,
    });
    expect(resized?.week_count).toBe(4);

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${monthId} and action = 'update'
      order by id asc
    `;
    expect(rows).toHaveLength(1);
    const diff = rows[0]!.diff_json as Record<string, unknown>;
    expect(diff.resize).toBe('grow');
    expect(diff.week_count_before).toBe(2);
    expect(diff.week_count_after).toBe(4);
    expect(diff.end_date_before).toBe(base.end_date);
    expect(diff.end_date_after).toBe(isoDateString(addDays(parseIsoDate(base.start_date), 4 * 7 - 1)));
  }, 30000);

  test('resizeAssignmentInPlace (acortar) registra en su fila cuántas sesiones se borraron', async () => {
    const { fx, workoutTemplateId } = await seedAnchoredAthlete();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 3 },
      actor,
      client: sql,
    });
    const monthId = Number(base.month_template_id);
    await trackForCleanup(fx, monthId);
    auditRows.push({ entity_type: 'program_month_templates', entity_id: monthId });

    // Un tramo recién añadido nace VACÍO (semanas de descanso, sin sesiones) —
    // acortar sobre eso no borraría nada. Siembra una sesión PENDIENTE (nunca
    // ejecutada, así que no bloquea el acortado) en la última semana, la que
    // desaparece al pasar de 3 a 1.
    const baseMicroIds = (
      await sql<Array<{ microcycle_ids: string[] | null }>>`
        select microcycle_ids from athlete_month_assignments where month_template_id = ${monthId}
      `
    )[0]!.microcycle_ids!.map(Number);
    expect(baseMicroIds).toHaveLength(3);
    await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: isoDateString(addDays(parseIsoDate(base.start_date), 2 * 7)),
      status: 'scheduled',
      microcycleId: baseMicroIds[2]!,
    });

    // Baja program_month_weeks a mano a 1 posición — exactamente lo que
    // removeWeekFromMonth haría si no reventara (ver comentario de arriba).
    await sql`delete from program_month_weeks where month_template_id = ${monthId} and position > 0`;

    const resized = await resizeAssignmentInPlace({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthId,
      actor,
      client: sql,
    });
    expect(resized?.week_count).toBe(1);

    const rows = await sql<Array<{ diff_json: unknown }>>`
      select diff_json from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${monthId} and action = 'update'
      order by id asc
    `;
    expect(rows).toHaveLength(1);
    const diff = rows[0]!.diff_json as Record<string, unknown>;
    expect(diff.resize).toBe('shrink');
    expect(diff.week_count_before).toBe(3);
    expect(diff.week_count_after).toBe(1);
    expect(diff.deleted_sessions).toBe(1); // la sesión pendiente sembrada arriba.
    expect(diff.preserved_sessions).toBe(0);
  }, 30000);

  test('reordenar (swap) escribe una fila update con el vecino y las fechas de los dos', async () => {
    const { fx } = await seedAnchoredAthlete();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(base.month_template_id) });
    const build = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Build', week_count: 3 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(build.month_template_id));
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(build.month_template_id) });

    // movePersonalTramoInChain es DOS fases: la 1ª (el lock + planPersonalReflow
    // + MI fila de auditoría) commitea sola, ANTES de que la 2ª
    // (applyPersonalReflow) toque un solo recibo. La 2ª tiene hoy un bug
    // preexistente y AJENO a esta entrega: mueve el tramo que avanza (Build)
    // ANTES que el que le cede el sitio (Base), así que el recibo nuevo de
    // Build choca un instante con el recibo viejo — todavía sin borrar — de
    // Base (23P01). Reproducido IDÉNTICO ejecutando
    // personal-plan-chain-move.db.test.ts tal cual está en main, sin tocar una
    // sola línea — no es un efecto de este cambio. La fila de auditoría de
    // ESTE test ya quedó escrita (fase 1 commiteada) cuando la fase 2 falla —
    // el .rejects confirma que el error es justo ese, no otro.
    await expect(
      movePersonalTramoInChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(build.month_template_id),
        payload: { direction: 'up' },
        actor,
        client: sql,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('se solapa') });

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${Number(build.month_template_id)}
      order by id asc
    `;
    // create (al añadir "Build") + update (el swap).
    expect(rows).toHaveLength(2);
    expect(rows[1]!.action).toBe('update');
    const diff = rows[1]!.diff_json as Record<string, unknown>;
    expect(diff.direction).toBe('up');
    const self = diff.self as Record<string, unknown>;
    const neighbor = diff.neighbor as Record<string, unknown>;
    expect(self.month_template_id).toBe(Number(build.month_template_id));
    expect(self.start_after).toBe(base.start_date); // "Build" ocupa el sitio de "Base".
    expect(neighbor.month_template_id).toBe(Number(base.month_template_id));
  }, 30000);

  test('borrar un tramo de la cadena escribe una fila delete con sesiones borradas/conservadas y qué se recolocó', async () => {
    const { fx, workoutTemplateId } = await seedAnchoredAthlete();
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const base = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Base', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(base.month_template_id));
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(base.month_template_id) });
    const build = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Build', week_count: 3 },
      actor,
      client: sql,
    });
    const buildId = Number(build.month_template_id);
    await trackForCleanup(fx, buildId);
    auditRows.push({ entity_type: 'program_month_templates', entity_id: buildId });
    const peak = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name: 'Peak', week_count: 2 },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(peak.month_template_id));
    auditRows.push({ entity_type: 'program_month_templates', entity_id: Number(peak.month_template_id) });

    // "Build" nace vacío (semanas de descanso) — siembra una sesión PENDIENTE
    // (nunca ejecutada) para que el borrado tenga algo real que borrar.
    const buildMicroIds = (
      await sql<Array<{ microcycle_ids: string[] | null }>>`
        select microcycle_ids from athlete_month_assignments where month_template_id = ${buildId}
      `
    )[0]!.microcycle_ids!.map(Number);
    await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: build.start_date,
      status: 'scheduled',
      microcycleId: buildMicroIds[0]!,
    });

    const result = await deletePersonalTramoFromChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: buildId,
      actor,
      client: sql,
    });
    expect(result.reflowed).toBe(true);

    const rows = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json from audit_log
      where entity_type = 'program_month_templates' and entity_id = ${buildId}
      order by id asc
    `;
    expect(rows).toHaveLength(2); // create + delete
    expect(rows[1]!.action).toBe('delete');
    const diff = rows[1]!.diff_json as Record<string, unknown>;
    expect(diff.preserved_sessions).toBe(0);
    expect(diff.deleted_sessions).toBe(1); // la sesión pendiente sembrada arriba.
    const candidates = diff.reflow_candidates as Array<Record<string, unknown>>;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.month_template_id).toBe(Number(peak.month_template_id));
  }, 30000);
});
