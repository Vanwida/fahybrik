// EL CAMINO: el nivel del tramo, sus hitos tipados, y qué pasa al acabar —
// contra base de datos REAL.
//
// Por qué no vale un mock: lo que se prueba es el JOIN contra `athlete_levels`
// (vía `program_month_templates.level_id`) y la agregación por día de
// `workout_assignments` (simulacro vs test de calibración) que ya hacía
// `cargarHitos` — un cliente falso devolvería lo que le pidas y no probaría el
// join ni la agregación, que es justo donde puede mentir.
//
// Fechas FIJAS (no "hoy"): el camino se resuelve con `on_date` explícito, así
// que el test es determinista sin depender de cuándo se ejecute.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { resolveEndPolicy, resolvePlanPath } from '@/lib/plan/camino';

// Tramo 1 «Base»: 4 semanas, lunes a domingo exactos.
const BASE_START = '2025-06-02';
const BASE_END = '2025-06-29';
// Tramo 2 «Específico»: 3 semanas, arranca el lunes siguiente al fin de Base.
const ESPECIFICO_START = '2025-06-30';
const ESPECIFICO_END = '2025-07-20';
// Hoy cae en la semana 2 de Base — no afecta a nivel/hitos, solo al cursor.
const ON_DATE = new Date('2025-06-11T12:00:00Z');
const SIM_DATE = '2025-06-16'; // dentro de Base
const TEST_DATE = '2025-07-07'; // dentro de Específico

describeWithDb('camino: nivel del tramo, hitos tipados y al_acabar (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let levelId = 0;
  const sequenceIds: number[] = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
    fx = await makeCoachAndAthlete(sql);
    const level = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label) values (${fx.coachId}, 'N3', 'Rendimiento')
      returning id::text
    `;
    levelId = Number(level[0]!.id);
  }, 60000);

  afterAll(async () => {
    // Orden FK-safe: la fila activa antes de la secuencia (cascade la cubriría,
    // pero se hace explícito — nada de fiarse de un cascade silencioso en una
    // rama compartida).
    await sql`delete from athlete_sequence_progress where athlete_id = ${fx.athleteId}`;
    if (sequenceIds.length > 0) {
      await sql`delete from program_sequences where id = any(${sequenceIds}::bigint[])`;
    }
    await sql`delete from coach_calibration_tests where coach_id = ${fx.coachId}`;
    await sql`delete from athlete_levels where id = ${levelId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 60000);

  it('el nivel del tramo sale de athlete_levels.label vía level_id; sin level_id, null', async () => {
    const conNivel = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, level_id)
      values (${fx.coachId}, 'Base', ${levelId})
      returning id::text
    `;
    const monthConNivel = Number(conNivel[0]!.id);
    fx.monthTemplates.push({ monthId: monthConNivel, weekIds: [] });

    const sinNivel = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${fx.coachId}, 'Específico')
      returning id::text
    `;
    const monthSinNivel = Number(sinNivel[0]!.id);
    fx.monthTemplates.push({ monthId: monthSinNivel, weekIds: [] });

    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids)
      values (${fx.athleteId}, ${monthConNivel}, ${BASE_START}::date, ${BASE_END}::date, ${[901, 902, 903, 904]}::bigint[])
    `;
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids)
      values (${fx.athleteId}, ${monthSinNivel}, ${ESPECIFICO_START}::date, ${ESPECIFICO_END}::date, ${[905, 906, 907]}::bigint[])
    `;

    const camino = await resolvePlanPath({ athlete_id: fx.athleteId, on_date: ON_DATE, sql });

    expect(camino).not.toBeNull();
    expect(camino!.segments.map((s) => s.title)).toEqual(['Base', 'Específico']);
    expect(camino!.segments[0]!.level).toBe('Rendimiento');
    // Sin level_id declarado — nunca se inventa un nivel por defecto.
    expect(camino!.segments[1]!.level).toBeNull();
    expect(camino!.current_position).toBe(0);
  }, 60000);

  it('los hitos de un tramo viajan tipados (sim / test), y son los MISMOS que colapsa `detail`', async () => {
    const simTemplate = await makeTemplate({ fx, name: 'Simulacro de mitad de bloque', format: 'hyrox_sim' });
    await sql`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${fx.athleteId}, ${SIM_DATE}::date, ${simTemplate}, 1, 'scheduled'::assignment_status)
    `;

    const testTemplate = await makeTemplate({ fx, name: 'Test 5K', format: 'test' });
    const testRow = await sql<Array<{ id: string }>>`
      insert into coach_calibration_tests (coach_id, slug, name, format, template_id)
      values (${fx.coachId}, 'test-5k-camino', 'Test 5K', 'test', ${testTemplate})
      returning id::text
    `;
    await sql`
      insert into workout_assignments (
        athlete_id, scheduled_for, template_id, template_version, status, calibration_test_id
      )
      values (
        ${fx.athleteId}, ${TEST_DATE}::date, ${testTemplate}, 1, 'scheduled'::assignment_status, ${Number(testRow[0]!.id)}
      )
    `;

    const camino = await resolvePlanPath({ athlete_id: fx.athleteId, on_date: ON_DATE, sql });
    const [base, especifico] = camino!.segments;

    expect(base!.events).toEqual([
      { kind: 'sim', title: 'Simulacro de mitad de bloque', date: SIM_DATE },
    ]);
    expect(base!.milestone).toBe(true);
    expect(base!.detail).toContain('Simulacro de mitad de bloque');

    expect(especifico!.events).toEqual([{ kind: 'test', title: 'Test 5K', date: TEST_DATE }]);
    expect(especifico!.milestone).toBe(true);
    expect(especifico!.detail).toContain('Test 5K');
  }, 60000);

  describe('resolveEndPolicy — program_sequences.end_policy verbatim', () => {
    it('sin secuencia activa, null (un plan personal no camina ninguna)', async () => {
      expect(await resolveEndPolicy({ athlete_id: fx.athleteId, sql })).toBeNull();
    });

    it('con secuencia activa, el end_policy VERBATIM — no se asume "repeat"', async () => {
      const seqRow = await sql<Array<{ id: string }>>`
        insert into program_sequences (coach_id, level_id, days_per_week, end_policy)
        values (${fx.coachId}, ${levelId}, 4, 'level_up')
        returning id::text
      `;
      const sequenceId = Number(seqRow[0]!.id);
      sequenceIds.push(sequenceId);
      await sql`
        insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, status)
        values (${fx.athleteId}, ${fx.coachId}, ${sequenceId}, 'active')
      `;

      expect(await resolveEndPolicy({ athlete_id: fx.athleteId, sql })).toBe('level_up');
    }, 60000);

    it('una fila NO activa (completed) no cuenta — vuelve a null', async () => {
      await sql`
        update athlete_sequence_progress set status = 'completed' where athlete_id = ${fx.athleteId}
      `;
      expect(await resolveEndPolicy({ athlete_id: fx.athleteId, sql })).toBeNull();
    });
  });
});
