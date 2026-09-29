/**
 * Un tramo de carrera SIN distancia en el historial no puede tumbar el guardado.
 *
 * Caso real (29-sep-2026, atleta 64, `device_events`: queue_failed code=500): un
 * entreno de Salud dejó un tramo `run` con 0 m y 168 s. La detección de récords
 * (`running-prs.ts`) calculaba el ritmo `duración / (metros / 1000)` sobre TODO el
 * historial del atleta, así que ese único tramo hacía saltar «division by zero»
 * (Postgres 22012) en CADA guardado posterior: el POST devolvía 500 y la cola de la
 * app conservaba el entreno para siempre.
 *
 * Aquí se fija: el tramo sin distancia no cuenta como esfuerzo (no tiene ritmo) y
 * el guardado, sea sobre el plan o fuera de él, sigue devolviendo 2xx.
 */

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { detectExecutionRunningPRs } from '@/lib/sync/running-prs';
import { detectPrs } from '@/lib/sync/record-workout-execution';

let session: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));

const { POST } = await import('@/app/api/sync/workout-execution/route');

function request(body: unknown): Request {
  return new Request('http://localhost/api/sync/workout-execution', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describeWithDb('tramo de carrera sin distancia en el historial (real DB)', () => {
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

  /** Un entreno importado de Salud con un único tramo `run` de 0 m y 168 s, sin ritmo. */
  async function seedZeroDistanceRun(fx: Fixture): Promise<number> {
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
      values (null, ${fx.athleteId}, '2026-08-07T16:10:19Z'::timestamptz, '2026-08-07T16:13:07Z'::timestamptz, 'healthkit')
      returning id::text
    `;
    const executionId = Number(exec[0]!.id);
    await sql`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, distance_meters, source)
      values (${executionId}, 0, '2026-08-07T16:10:19Z'::timestamptz, '2026-08-07T16:13:07Z'::timestamptz, 'run', 0, 'healthkit')
    `;
    return executionId;
  }

  test('la detección de récords no revienta y no cuenta el tramo sin distancia', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const executionId = await seedZeroDistanceRun(fx);

    const prs = await detectExecutionRunningPRs({ sql, athleteId: fx.athleteId, executionId });
    expect(prs).toEqual([]);
  });

  test('POST /api/sync/workout-execution sigue guardando (2xx) con ese tramo en el historial', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await seedZeroDistanceRun(fx);
    session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };

    const res = await POST(
      request({
        started_at: '2026-09-29T07:00:00Z',
        ended_at: '2026-09-29T07:30:00Z',
        total_duration_seconds: 1800,
        perceived_exertion: 6,
        completeness: 'full',
        segments: [{ position: 0, modality: 'run', duration_seconds: 1800, distance_meters: 5000, source: 'gps' }],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { saved?: boolean; execution_id?: string } } & { saved?: boolean };
    expect(json.data?.saved ?? json.saved).toBe(true);

    const rows = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_executions
      where athlete_id = ${fx.athleteId} and started_at = '2026-09-29T07:00:00Z'::timestamptz
    `;
    expect(rows[0]!.n).toBe('1');
  }, 60000);

  test('un fallo en la detección de récords (best-effort) no aborta la transacción del guardado', async () => {
    // Un atleta fuera de rango de bigint hace fallar la consulta de récords con un
    // error de Postgres real. Dentro de `sql.begin`, ese error dejaba la transacción
    // abortada y el `.catch` no servía: el guardado entero acababa en 500.
    const after = await sql.begin(async (tx) => {
      const prs = await detectPrs(tx, 1e30, 1);
      expect(prs).toEqual([]);
      const rows = await tx<Array<{ ok: number }>>`select 1 as ok`;
      return rows[0]!.ok;
    });
    expect(after).toBe(1);
  }, 60000);
});
