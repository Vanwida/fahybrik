// Prueba el CABLEADO de la card 126: que `recordWorkoutExecution` (el guardado
// de un entreno en vivo) y `ingestWorkoutTraces` (la llegada de una traza)
// disparan `computeSessionTotals` de verdad, no solo que la función pura
// calcule bien — eso ya está cubierto en tests/execution/session-totals.db.test.ts.
// Sigue el mismo patrón que tests/sync/workout-execution.db.test.ts.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordWorkoutExecution } from '@/lib/sync/record-workout-execution';
import { ingestWorkoutTraces } from '@/lib/sync/ingest-workout-traces';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

interface TotalsRow {
  avg_hr: number | null;
  max_hr: number | null;
  total_distance_m: string | null;
  total_calories: string | null;
}

describeWithDb('session totals wiring (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function seed(): Promise<{ fx: Fixture; assignmentId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'Rodaje + tirón' });
    const assignmentId = await makeAssignment({
      fx,
      templateId: tpl,
      scheduledForIso: new Date().toISOString().slice(0, 10),
    });
    return { fx, assignmentId };
  }

  const readTotals = (executionId: number) => sql<TotalsRow[]>`
    select avg_hr, max_hr, total_distance_m::text, total_calories::text
    from workout_executions where id = ${executionId}
  `;

  test('recordWorkoutExecution deja los totales calculados en workout_executions', async () => {
    const { fx, assignmentId } = await seed();

    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: {
        perceived_exertion: 8,
        segments: [
          { position: 0, modality: 'run', duration_seconds: 1200, avg_hr: 145, max_hr: 160, distance_meters: 3000 },
        ],
      },
      sql,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await readTotals(Number(res.execution_id));
    expect(row!.avg_hr).toBe(145);
    expect(row!.max_hr).toBe(160);
    expect(Number(row!.total_distance_m)).toBe(3000);
  });

  test('reenviar el mismo entreno no duplica ni cambia los totales', async () => {
    const { fx, assignmentId } = await seed();
    const input = {
      perceived_exertion: 8,
      segments: [
        { position: 0, modality: 'row', duration_seconds: 600, avg_hr: 130, max_hr: 140, distance_meters: 1500, calories: 90 },
      ],
    };

    const first = await recordWorkoutExecution({ athleteId: fx.athleteId, assignmentId, input, sql });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await recordWorkoutExecution({ athleteId: fx.athleteId, assignmentId, input, sql });
    expect(second.ok).toBe(true);

    const [row] = await readTotals(Number(first.execution_id));
    expect(row!.avg_hr).toBe(130);
    expect(Number(row!.total_distance_m)).toBe(1500); // no 3000
    expect(Number(row!.total_calories)).toBe(90); // no 180
  });

  test('una traza de pulso que llega DESPUÉS del guardado sustituye la FC calculada desde los tramos', async () => {
    const { fx, assignmentId } = await seed();

    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: {
        perceived_exertion: 8,
        started_at: '2026-08-20T06:00:00.000Z',
        segments: [
          {
            position: 0,
            modality: 'run',
            started_at: '2026-08-20T06:00:00.000Z',
            ended_at: '2026-08-20T06:20:00.000Z',
            avg_hr: 120,
            max_hr: 130,
          },
        ],
      },
      sql,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const beforeTrace = await readTotals(Number(res.execution_id));
    expect(beforeTrace[0]!.avg_hr).toBe(120); // del tramo, de momento

    const traceResult = await ingestWorkoutTraces({
      athlete_id: fx.athleteId,
      payload: {
        execution_id: Number(res.execution_id),
        traces: [
          {
            signal: 'hr',
            source: 'healthkit',
            started_at: '2026-08-20T06:00:00.000Z',
            offsets_s: [0, 10, 20],
            values: [150, 160, 170],
          },
        ],
      },
      client: sql,
    });
    expect(traceResult.ok).toBe(true);

    const afterTrace = await readTotals(Number(res.execution_id));
    expect(afterTrace[0]!.avg_hr).toBe(160); // ahora sale de la traza
    expect(afterTrace[0]!.max_hr).toBe(170);
  });
});
