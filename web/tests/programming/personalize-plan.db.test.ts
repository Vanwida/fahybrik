// Personalizar plan (0164) — el camino PRINCIPAL a un plan personal: forkea el
// microciclo que el atleta YA tiene, desde la semana en curso hacia delante.
//
// EL RIESGO MÁS CARO (por eso el test explícito): si el plan personal apuntara a
// las semanas de la plantilla de biblioteca en vez de copiarlas, editar el plan
// de UN atleta cambiaría el microciclo de TODOS los que lo tienen asignado. Este
// archivo lo blinda: personaliza, MUTA una semana del fork, y comprueba que la
// plantilla de origen queda BYTE A BYTE intacta.
//
// DB real (Neon branch): TEST_DATABASE_URL. Se salta con aviso si no está.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { personalizePlanForAthlete } from '@/lib/dashboard/coach/personalize-plan';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { listMonthTemplates } from '@/lib/dashboard/coach/program-months';
import { saveCoachSequence, SaveSequenceError } from '@/lib/dashboard/coach/sequences';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('personalizePlanForAthlete (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('fork es copia profunda e independiente: editar el fork NUNCA toca la plantilla de origen', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión base' });

    // Biblioteca: 3 semanas, sesión los lunes/miércoles/viernes.
    const { monthId: sourceMonthId, weekIds: sourceWeekIds } = await makeMonthTemplate({
      fx,
      weekCount: 3,
      workoutDays: [1, 3, 5],
      workoutTemplateId,
    });
    const originalSlotsByWeek = new Map<number, unknown>();
    for (const id of sourceWeekIds) {
      const rows = await sql<{ slots_json: unknown }[]>`
        select slots_json from program_week_templates where id = ${id}
      `;
      originalSlotsByWeek.set(id, rows[0]!.slots_json);
    }

    // Asigna el mes empezando la semana PASADA, así "hoy" cae en la semana 2 de 3
    // (fromPosition=1, keepIds no vacío → recorta el recibo viejo, no lo cierra).
    const thisMonday = mondayOfWeek(new Date());
    const lastMonday = addDays(thisMonday, -7);
    const materialized = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(lastMonday),
      client: sql,
    });
    const oldAssignmentId = Number(materialized.month_assignment_id);

    // Simula que el atleta YA completó su lunes de esta semana (semana 2).
    const mondayThisWeek = isoDateString(thisMonday);
    const mondaySessionRows = await sql<{ id: string; template_id: string }[]>`
      select id::text, template_id::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = ${mondayThisWeek}::date
      limit 1
    `;
    expect(mondaySessionRows[0]).toBeDefined();
    const completedAssignmentId = Number(mondaySessionRows[0]!.id);
    const completedTemplateIdBefore = mondaySessionRows[0]!.template_id;
    await sql`update workout_assignments set status = 'completed' where id = ${completedAssignmentId}`;

    const wednesdayThisWeek = isoDateString(addDays(thisMonday, 2));
    const wedSessionRows = await sql<{ id: string; template_id: string }[]>`
      select id::text, template_id::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = ${wednesdayThisWeek}::date
      limit 1
    `;
    const scheduledAssignmentId = Number(wedSessionRows[0]!.id);
    const scheduledTemplateIdBefore = wedSessionRows[0]!.template_id;

    // ── Personalizar ──────────────────────────────────────────────────────
    const result = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(result.month_template_id), weekIds: [] });

    expect(result.week_count).toBe(2); // semanas 2 y 3
    expect(result.forked_from_week).toBe(2);
    expect(result.old_assignment).toBe('trimmed');
    expect(result.source_month_template_id).toBe(String(sourceMonthId));

    // El NUEVO mes es personal, con linaje hacia el de origen.
    const forkRows = await sql<{ athlete_id: string; personalized_from_id: string }[]>`
      select athlete_id::text, personalized_from_id::text from program_month_templates
      where id = ${Number(result.month_template_id)}
    `;
    expect(Number(forkRows[0]!.athlete_id)).toBe(fx.athleteId);
    expect(Number(forkRows[0]!.personalized_from_id)).toBe(sourceMonthId);

    // Las semanas del fork llevan athlete_id + contenido copiado.
    const forkWeekRows = await sql<{ id: string; position: number; athlete_id: string | null; slots_json: unknown }[]>`
      select w.id::text, mw.position, w.athlete_id::text as athlete_id, w.slots_json
      from program_month_weeks mw
      join program_week_templates w on w.id = mw.week_template_id
      where mw.month_template_id = ${Number(result.month_template_id)}
      order by mw.position
    `;
    for (const fw of forkWeekRows) {
      fx.monthTemplates[fx.monthTemplates.length - 1]!.weekIds.push(Number(fw.id));
    }
    expect(forkWeekRows).toHaveLength(2);
    expect(forkWeekRows.every((w) => Number(w.athlete_id) === fx.athleteId)).toBe(true);
    // Contenido copiado de las semanas de origen 2 y 3 (posiciones 1 y 2, 0-based).
    expect(JSON.stringify(forkWeekRows[0]!.slots_json)).toBe(
      JSON.stringify(originalSlotsByWeek.get(sourceWeekIds[1]!)),
    );

    // ── EL TEST QUE IMPORTA: mutar el fork nunca toca el origen ────────────
    const forkedWeek1Id = Number(forkWeekRows[0]!.id);
    await sql`
      update program_week_templates
      set slots_json = ${sql.json({ days: [] } as Parameters<typeof sql.json>[0])}
      where id = ${forkedWeek1Id}
    `;
    for (const id of sourceWeekIds) {
      const rows = await sql<{ slots_json: unknown; athlete_id: string | null }[]>`
        select slots_json, athlete_id::text as athlete_id from program_week_templates where id = ${id}
      `;
      expect(rows[0]!.athlete_id).toBeNull();
      expect(JSON.stringify(rows[0]!.slots_json)).toBe(JSON.stringify(originalSlotsByWeek.get(id)));
    }
    const sourceMonthRows = await sql<{ athlete_id: string | null }[]>`
      select athlete_id::text as athlete_id from program_month_templates where id = ${sourceMonthId}
    `;
    expect(sourceMonthRows[0]!.athlete_id).toBeNull();

    // ── El pasado no se reescribe: lo completado queda intacto; lo pendiente
    //    se reemplaza (nueva instancia clonada) ───────────────────────────
    const completedAfter = await sql<{ status: string; template_id: string }[]>`
      select status, template_id::text from workout_assignments where id = ${completedAssignmentId}
    `;
    expect(completedAfter[0]!.status).toBe('completed');
    expect(completedAfter[0]!.template_id).toBe(completedTemplateIdBefore);

    const scheduledAfter = await sql<{ status: string; template_id: string }[]>`
      select status, template_id::text from workout_assignments where id = ${scheduledAssignmentId}
    `;
    expect(scheduledAfter[0]!.status).toBe('scheduled');
    expect(scheduledAfter[0]!.template_id).not.toBe(scheduledTemplateIdBefore);

    // ── El recibo viejo se recorta, nunca se pisa la misma fecha dos veces ──
    const oldAssignmentAfter = await sql<{ end_date: string; microcycle_ids: string[] }[]>`
      select to_char(end_date, 'YYYY-MM-DD') as end_date, microcycle_ids
      from athlete_month_assignments where id = ${oldAssignmentId}
    `;
    expect(oldAssignmentAfter[0]!.microcycle_ids).toHaveLength(1);
    expect(oldAssignmentAfter[0]!.end_date).toBe(isoDateString(addDays(thisMonday, -1)));

    const newAssignmentRows = await sql<{ start_date: string; month_template_id: string }[]>`
      select to_char(start_date, 'YYYY-MM-DD') as start_date, month_template_id::text
      from athlete_month_assignments where id = ${Number(result.materialization.month_assignment_id)}
    `;
    expect(newAssignmentRows[0]!.start_date).toBe(mondayThisWeek);
    expect(Number(newAssignmentRows[0]!.month_template_id)).toBe(Number(result.month_template_id));

    // ── Nunca sale en Biblioteca / Secuencias: listMonthTemplates lo excluye,
    //    la plantilla de origen sigue listada ──────────────────────────────
    const libraryList = await listMonthTemplates({ coach_id: fx.coachId, client: sql });
    const libraryIds = libraryList.map((m) => Number(m.id));
    expect(libraryIds).not.toContain(Number(result.month_template_id));
    expect(libraryIds).toContain(sourceMonthId);

    // ── Secuencias (nivel×días): un plan personal nunca puede colarse en la
    //    matriz — saveCoachSequence lo rechaza aunque el coach lo intente ────
    const levelRows = await sql<{ id: string }[]>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${fx.coachId}, 'N1', 'Nivel 1', 1)
      returning id::text
    `;
    const levelId = Number(levelRows[0]!.id);
    await expect(
      saveCoachSequence(
        fx.coachId,
        {
          level_id: levelId,
          days_per_week: 3,
          end_policy: 'stop',
          progression_pct: null,
          progression_applies_to: null,
          items: [{ month_template_id: Number(result.month_template_id) }],
        },
        sql,
      ),
    ).rejects.toBeInstanceOf(SaveSequenceError);
    await sql`delete from program_sequences where coach_id = ${fx.coachId}`;
    await sql`delete from athlete_levels where id = ${levelId}`;
  }, 30000);

  test('fork desde la semana 1 CIERRA el recibo viejo (sin ventana negativa)', async () => {
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
    const materialized = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: sourceMonthId,
      start_date: isoDateString(thisMonday),
      client: sql,
    });
    const oldAssignmentId = Number(materialized.month_assignment_id);

    const result = await personalizePlanForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      client: sql,
    });
    fx.monthTemplates.push({ monthId: Number(result.month_template_id), weekIds: [] });
    const forkWeekRows = await sql<{ id: string }[]>`
      select week_template_id::text as id from program_month_weeks
      where month_template_id = ${Number(result.month_template_id)}
    `;
    fx.monthTemplates[fx.monthTemplates.length - 1]!.weekIds = forkWeekRows.map((r) => Number(r.id));

    expect(result.old_assignment).toBe('closed');
    expect(result.forked_from_week).toBe(1);

    const oldAssignmentAfter = await sql<Array<Record<string, unknown>>>`
      select 1 from athlete_month_assignments where id = ${oldAssignmentId}
    `;
    expect(oldAssignmentAfter).toHaveLength(0); // closed = deleted, not left dangling

    // La plantilla de origen sigue existiendo, intacta (solo se cerró el
    // RECIBO del atleta, nunca la plantilla de biblioteca).
    const sourceRows = await sql<{ id: string }[]>`
      select id::text from program_month_templates where id = ${sourceMonthId}
    `;
    expect(sourceRows).toHaveLength(1);
  }, 30000);

  test('rechaza personalizar cuando el atleta no tiene plan activo', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await expect(
      personalizePlanForAthlete({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql }),
    ).rejects.toMatchObject({ code: 'no_active_plan' });
  });
});
