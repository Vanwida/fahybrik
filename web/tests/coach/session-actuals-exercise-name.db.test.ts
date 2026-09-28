// `loadSegmentActuals` sirve el NOMBRE del ejercicio de cada tramo: sin él, un
// tramo sin enlace al plan salía en iOS como «Fuerza»/«Correr» (la modalidad).
// Sale del ejercicio del tramo o, si no lo trae, del de su línea enlazada; con el
// nombre propio del coach del atleta si lo renombró. Null sin ejercicio.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('session-actuals · nombre del ejercicio por tramo (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await sql`delete from template_segments where template_id = any(${fx.templateIds}::bigint[])`;
    await sql`delete from coach_exercise_overrides where coach_id = ${fx.coachId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  it('tramo suelto con exercise_id, tramo enlazado, nombre del coach y tramo sin ejercicio', async () => {
    const sled = await makeExercise({ fx, name: 'Sled Push' });
    const squat = await makeExercise({ fx, name: 'Back Squat' });
    const lunge = await makeExercise({ fx, name: 'Sandbag Lunges' });
    // El coach renombró el squat: su nombre gana al del catálogo.
    await sql`
      insert into coach_exercise_overrides (coach_id, exercise_id, name)
      values (${fx.coachId}, ${squat}, 'Sentadilla trasera')
    `;
    const templateId = await makeTemplate({ fx, name: 'Fuerza A' });
    const line = await sql<{ id: string }[]>`
      insert into template_segments (template_id, position, block_position, exercise_id, params_json)
      values (${templateId}, 0, 0, ${lunge}, ${sql.json({})})
      returning id::text
    `;
    const ex = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, source, recorded_via)
      values (null, ${fx.athleteId}, now(), 'manual', 'live')
      returning id::text
    `;
    const executionId = Number(ex[0]!.id);
    await sql`
      insert into segment_executions (execution_id, position, modality, exercise_id, template_segment_id)
      values
        (${executionId}, 0, 'strength', ${sled}, null),
        (${executionId}, 1, 'strength', ${squat}, null),
        (${executionId}, 2, 'strength', null, ${Number(line[0]!.id)}),
        (${executionId}, 3, 'run', null, null)
    `;

    const actuals = await loadSegmentActuals(sql, executionId);

    expect(actuals.map((a) => [a.position, a.exercise_name])).toEqual([
      [0, 'Sled Push'],
      [1, 'Sentadilla trasera'],
      [2, 'Sandbag Lunges'],
      [3, null],
    ]);
  });
});
