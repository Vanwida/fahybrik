// Una importación de Apple Salud, una fila (0276). El iPhone reenvía el lote antes
// de tener la respuesta del primero; las dos peticiones pasaban el «¿ya existe?»
// antes de que ninguna escribiera y nacían dos sesiones idénticas a milisegundos
// (atleta 64: 2690/2691, 2693/2694…). Ahora la llave única de 0276 las para y la
// que pierde la carrera devuelve la fila que ya existe.

import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import { materializeHealthkitWorkout } from '@/lib/sync/materialize-healthkit-workout';
import type { HKWorkoutDTO } from '@/lib/sync/schema';
import { closeTestSql, describeWithDb, getTestDbUrl, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

/** Peticiones simultáneas de verdad: el cliente de tests es de UNA conexión. */
const PARALLEL_CONNECTIONS = 5;

function workout(ref: string, startIso: string): HKWorkoutDTO {
  const start = Date.parse(startIso);
  return {
    source_workout_id: ref,
    workout_activity_type: 37, // running
    started_at: new Date(start).toISOString(),
    ended_at: new Date(start + 30 * 60_000).toISOString(),
    duration_seconds: 1800,
    total_distance_meters: 6000,
    total_energy_burned_kcal: 400,
    avg_heart_rate_bpm: 150,
    max_heart_rate_bpm: 170,
    lap_markers: [],
    source: 'healthkit',
  };
}

describeWithDb('importación de Salud idempotente por (atleta, fuente, ref) (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let pool: ReturnType<typeof postgres>;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    pool = postgres(getTestDbUrl()!, {
      ssl: 'require',
      max: PARALLEL_CONNECTIONS,
      prepare: false,
      types: { bigint: postgres.BigInt },
    });
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await pool?.end();
    await fx?.cleanup();
    await closeTestSql();
  });

  it('el mismo entreno enviado a la vez N veces deja UNA fila y todos contestan su id', async () => {
    const w = workout(`HK-IDEM-${Date.now()}`, '2026-05-14T07:00:00Z');
    const results = await Promise.all(
      Array.from({ length: PARALLEL_CONNECTIONS }, () =>
        materializeHealthkitWorkout({
          sql: pool as unknown as Sql,
          athlete_id: BigInt(fx.athleteId),
          workout: w,
          computeZones: false,
        }),
      ),
    );

    const rows = await sql<{ id: string }[]>`
      select id::text from workout_executions
      where athlete_id = ${fx.athleteId} and source_workout_ref = ${w.source_workout_id}
    `;
    expect(rows).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'inserted')).toHaveLength(1);
    // Ninguna contesta «saltado» ni se queda sin id: todas señalan la misma fila.
    expect(new Set(results.map((r) => r.execution_id))).toEqual(new Set([rows[0]!.id]));
    const segs = await sql<{ n: number }[]>`
      select count(*)::int as n from segment_executions where execution_id = ${rows[0]!.id}::bigint
    `;
    expect(segs[0]!.n).toBe(1);
  });

  it('la base rechaza una segunda importación sin asignación con la misma llave', async () => {
    const ref = `HK-UQ-${Date.now()}`;
    const insert = () => sql`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source, source_workout_ref, recorded_via)
      values (null, ${fx.athleteId}, '2026-05-15T07:00:00Z', '2026-05-15T07:30:00Z', 'healthkit', ${ref}, 'imported')
    `;
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: '23505' });
  });
});
