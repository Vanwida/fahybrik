// El detalle de un entreno hecho, abierto por su EJECUCIÓN (GET
// /api/athlete/executions/[id]/detail): lo que no tiene asignación — una
// importación de Salud, un entreno guardado fuera del plan — se abre con sus
// tramos y sus series; lo que la tiene da lo mismo que abrirlo por la asignación;
// lo ajeno no existe.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadExecutionDetail } from '@/lib/athlete/execution-detail';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('detalle por ejecución (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let other: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id in (${fx.athleteId}, ${other.athleteId})`;
    await fx?.cleanup();
    await other?.cleanup();
    await closeTestSql();
  });

  it('sin asignación: la ejecución con sus tramos y series, assignment/workout nulos', async () => {
    const ex = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
                                      perceived_exertion, source, recorded_via, off_plan_reason, claimed_assignment_id)
      values (null, ${fx.athleteId}, '2026-05-15T17:00:00Z', '2026-05-15T17:40:00Z', 2400, 8, 'manual', 'live',
              'assignment_gone', 424242)
      returning id::text
    `;
    const executionId = ex[0]!.id;
    const seg = await sql<{ id: string }[]>`
      insert into segment_executions (execution_id, position, modality, started_at, ended_at)
      values (${executionId}, 0, 'strength', '2026-05-15T17:00:00Z', '2026-05-15T17:30:00Z')
      returning id::text
    `;
    await sql`
      insert into set_executions (segment_execution_id, set_index, reps_actual, load_actual_kg, rpe, status)
      values (${seg[0]!.id}, 1, 5, 100, 7, 'done'), (${seg[0]!.id}, 2, 5, 110, 8, 'done')
    `;

    const d = await loadExecutionDetail({ sql, athlete_id: BigInt(fx.athleteId), execution_id: BigInt(executionId) });

    expect(d).not.toBeNull();
    expect(d!.assignment).toBeNull();
    expect(d!.workout).toBeNull();
    expect(d!.execution_id).toBe(executionId);
    expect(d!.off_plan_reason).toBe('assignment_gone');
    expect(d!.execution).toMatchObject({
      execution_id: executionId,
      total_duration_seconds: 2400,
      perceived_exertion: 8,
      completeness: 'completed',
    });
    expect(d!.execution!.segments).toHaveLength(1);
    expect(d!.execution!.segments[0]!.sets.map((s) => [s.reps, s.kg])).toEqual([
      [5, 100],
      [5, 110],
    ]);
    expect(d!.execution!.segments[0]!.volume_kg).toBe(1050);
    expect(d!.run_compliance.tramos).toEqual([]);
  });

  it('con asignación: lo mismo que abrirlo por la asignación', async () => {
    const tpl = await makeTemplate({ fx, name: 'Fuerza' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: '2026-05-18', status: 'completed' });
    const ex = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, total_duration_seconds)
      values (${asg}, ${fx.athleteId}, '2026-05-18T08:00:00Z', 1800)
      returning id::text
    `;

    const byExecution = await loadExecutionDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      execution_id: BigInt(ex[0]!.id),
    });
    const byAssignment = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      assignment_id: BigInt(asg),
    });

    expect(byExecution).toEqual({ ...byAssignment, execution_id: ex[0]!.id, off_plan_reason: null });
  });

  it('la ejecución de otro atleta no existe para ti', async () => {
    const ex = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, total_duration_seconds, source, recorded_via)
      values (null, ${other.athleteId}, now(), 600, 'healthkit', 'imported')
      returning id::text
    `;
    const d = await loadExecutionDetail({ sql, athlete_id: BigInt(fx.athleteId), execution_id: BigInt(ex[0]!.id) });
    expect(d).toBeNull();
  });
});
