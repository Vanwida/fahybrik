// Composición real: guardar un entreno y recalcular cabecera DENTRO de
// una transacción ya abierta. Sin esta garantía, ingest + session-totals +
// assignment no pueden ir juntos (card 140).

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordWorkoutExecution } from '@/lib/sync/record-workout-execution';
import { ingestWorkoutTraces } from '@/lib/sync/ingest-workout-traces';
import { computeMeasuredHeader } from '@/lib/execution/measured-header';
import { computeSessionTotals } from '@/lib/execution/session-totals';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('escritores de sync dentro de una transacción ajena', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const executionIds: number[] = [];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterEach(async () => {
    for (const id of executionIds.splice(0)) {
      await sql`delete from workout_traces where execution_id = ${id}`;
      await sql`delete from segment_executions where execution_id = ${id}`;
      await sql`delete from workout_executions where id = ${id}`;
    }
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('recordWorkoutExecution + computeSessionTotals + computeMeasuredHeader caben en el mismo begin', async () => {
    const startedAtIso = '2026-08-24T06:00:00.000Z';
    const endedAtIso = '2026-08-24T06:40:00.000Z';
    const templateId = await makeTemplate({ fx, name: 'Rodaje tx' });
    const assignmentId = await makeAssignment({
      fx,
      templateId,
      scheduledForIso: '2026-08-24',
    });

    const outcome = await sql.begin(async (tx) => {
      const rec = await recordWorkoutExecution({
        athleteId: fx.athleteId,
        assignmentId,
        sql: tx,
        input: {
          started_at: startedAtIso,
          ended_at: endedAtIso,
          total_duration_seconds: 2400,
          completeness: 'full',
          segments: [
            {
              position: 0,
              modality: 'run',
              started_at: startedAtIso,
              ended_at: endedAtIso,
              distance_meters: 8000,
              avg_hr: 148,
              max_hr: 166,
            },
          ],
        },
      });
      if (!rec.ok) throw new Error(`record falló: ${rec.reason}`);
      const executionId = Number(rec.execution_id);
      executionIds.push(executionId);

      await ingestWorkoutTraces({
        athlete_id: fx.athleteId,
        client: tx,
        payload: {
          execution_id: executionId,
          traces: [
            {
              signal: 'hr',
              source: 'healthkit',
              started_at: startedAtIso,
              offsets_s: [0, 60, 120],
              values: [140, 150, 145],
            },
            {
              signal: 'altitude',
              source: 'gps',
              started_at: startedAtIso,
              offsets_s: [0, 40],
              values: [100, 104],
            },
          ],
        },
      });

      const totals = await computeSessionTotals({ execution_id: executionId, client: tx });
      const header = await computeMeasuredHeader({ execution_id: executionId, client: tx });
      return { executionId, rec, totals, header };
    });

    expect(outcome.rec.ok).toBe(true);
    expect(outcome.totals.written).toBe(true);
    expect(outcome.header.written).toBe(true);

    const asg = await sql<Array<{ status: string }>>`
      select status::text as status from workout_assignments where id = ${assignmentId}
    `;
    expect(asg[0]?.status).toBe('completed');
  });
});
