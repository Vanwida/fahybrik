/**
 * «SEMANA N DE M» ES LA MISMA EN LA APP Y EN EL PANEL — contra base de datos REAL
 * (auditoría de la app del atleta, D-08 / F-07).
 *
 * Quien entra en un grupo a mitad de programa recibe un recibo más corto que el
 * programa. El panel cuenta la semana en el PROGRAMA («semana 3 de 4»,
 * `programPosition`); la app la contaba en el recibo («semana 1 de 2»). Aquí se
 * fija que la cabecera del Plan (`buildAthleteMacroSummary`), la vista de ciclo
 * (`resolvePlanPath`) y la ficha del coach (`loadPlanFacts`) dicen lo mismo.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { buildAthleteMacroSummary } from '@fahybrid/shared/domain/coach/macro-progress';
import { resolvePlanPath } from '@/lib/plan/camino';
import { loadPlanFacts } from '@/lib/dashboard/athletes/plan-facts';

// El programa del grupo: 4 semanas. El atleta entra el lunes de la semana 3.
const JOIN_MONDAY = '2026-09-14';
const RECEIPT_END = '2026-09-27'; // 2 semanas: la 3 y la 4 del programa
const ON_DATE = new Date('2026-09-16T10:00:00Z'); // miércoles de su primera semana

describeWithDb('semana N de M: app = panel para quien entra a mitad de programa (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let programName = '';

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const tpl = await makeTemplate({ fx, name: 'Sesión del grupo' });
    const { monthId } = await makeMonthTemplate({ fx, weekCount: 4, workoutDays: [1, 3], workoutTemplateId: tpl });
    programName = `Acumulación ${Date.now()}`;
    await sql`update program_month_templates set name = ${programName} where id = ${monthId}`;
    await sql`
      insert into athlete_month_assignments
        (athlete_id, month_template_id, start_date, end_date, microcycle_ids, created_by_coach_id)
      values (${fx.athleteId}, ${monthId}, ${JOIN_MONDAY}::date, ${RECEIPT_END}::date,
              ${[910001, 910002]}::bigint[], ${fx.coachId})
    `;
  }, 60_000);

  afterAll(async () => {
    await sql`delete from athlete_month_assignments where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 60_000);

  test('la cabecera del Plan dice «semana 3 de 4», como el panel', async () => {
    const summary = await buildAthleteMacroSummary({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    expect(summary.week_label).toBe(`${programName} · semana 3 de 4`);

    const [facts] = await loadPlanFacts({ coach_id: fx.coachId, athlete_ids: [fx.athleteId], now: ON_DATE, client: sql });
    expect(facts!.current_program).toMatchObject({ week: 3, weeks: 4 });
  });

  test('la vista de ciclo pinta el tramo de hoy con la misma cuenta', async () => {
    const path = await resolvePlanPath({ athlete_id: fx.athleteId, on_date: ON_DATE, sql });
    expect(path).not.toBeNull();
    const current = path!.segments[path!.current_position!]!;
    expect(current.title).toBe(programName);
    expect(current.current_week).toBe(3);
    expect(current.week_count).toBe(4);
    expect(current.weeks_label).toBe('S1-S4');
    // Las fechas siguen siendo las que entrena: su recibo.
    expect(current.start_date).toBe(JOIN_MONDAY);
    expect(current.end_date).toBe(RECEIPT_END);
    expect(path!.total_weeks).toBe(4);
  });

  test('la semana siguiente avanza igual en los dos lados', async () => {
    const next = new Date('2026-09-23T10:00:00Z');
    const summary = await buildAthleteMacroSummary({ athlete_id: fx.athleteId, on_date: next, client: sql });
    expect(summary.week_label).toBe(`${programName} · semana 4 de 4`);
    const [facts] = await loadPlanFacts({ coach_id: fx.coachId, athlete_ids: [fx.athleteId], now: next, client: sql });
    expect(facts!.current_program).toMatchObject({ week: 4, weeks: 4 });
    const path = await resolvePlanPath({ athlete_id: fx.athleteId, on_date: next, sql });
    expect(path!.segments[path!.current_position!]!.current_week).toBe(4);
  });
});
