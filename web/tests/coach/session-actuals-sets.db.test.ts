// `loadSegmentActuals` lee `set_executions` contra la base real: la forma de la
// ejecución 138 de producción (5×100 · 5×110 · 3×115 · 3×120 con RPE/RIR) llega
// serie a serie, con su volumen, y la serie de OTRO tramo no se cuela.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('session-actuals · series serie a serie (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  it('sirve las series de cada tramo con RPE/RIR y el volumen', async () => {
    const ex = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, source, recorded_via)
      values (null, ${fx.athleteId}, now(), 'manual', 'live')
      returning id::text
    `;
    const executionId = Number(ex[0]!.id);
    const segs = await sql<{ id: string; position: number }[]>`
      insert into segment_executions (execution_id, position, modality, weight_used_kg)
      values (${executionId}, 1, 'strength', 120), (${executionId}, 2, 'strength', 150)
      returning id::text, position
    `;
    const [squat, dead] = [segs.find((s) => s.position === 1)!.id, segs.find((s) => s.position === 2)!.id];
    await sql`
      insert into set_executions (segment_execution_id, set_index, reps_actual, load_actual_kg, rpe, rir, status)
      values
        (${squat}, 1, 5, 100, 7.0, 3, 'done'),
        (${squat}, 2, 5, 110, 7.5, 2, 'done'),
        (${squat}, 3, 3, 115, 8.0, 2, 'done'),
        (${squat}, 4, 3, 120, 8.5, 1, 'done'),
        (${dead}, 1, 5, 130, 7.0, 3, 'done'),
        (${dead}, 2, null, null, null, null, 'skipped')
    `;

    const actuals = await loadSegmentActuals(sql, executionId);

    expect(actuals.map((a) => a.position)).toEqual([1, 2]);
    expect(actuals[0]!.sets.map((s) => [s.reps, s.kg, s.rpe, s.rir])).toEqual([
      [5, 100, 7, 3],
      [5, 110, 7.5, 2],
      [3, 115, 8, 2],
      [3, 120, 8.5, 1],
    ]);
    expect(actuals[0]!.volume_kg).toBe(1755);
    expect(actuals[1]!.sets.map((s) => s.status)).toEqual(['done', 'skipped']);
    expect(actuals[1]!.volume_kg).toBe(650);
  });
});
