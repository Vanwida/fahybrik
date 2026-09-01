// GET /api/athlete/running/tendencias (web/lib/athlete/running/tendencias.ts)
// contra una base real: zero-fill semanal y la ventana `prev` del mismo largo.
//
// WRITE, do NOT run here (TCP egress bloqueado); Alex/CI corre esta suite
// contra una rama de Neon de prueba (TEST_DATABASE_URL).

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { buildRunningTendencias } from '@/lib/athlete/running/tendencias';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const iso = (d: Date) => d.toISOString();

describeWithDb('buildRunningTendencias (real DB)', () => {
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

  async function athlete(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    cleanups.push(async () => {
      await sql`delete from segment_executions where execution_id in (
        select id from workout_executions where athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test('4 semanas: una sola sesión llena UN bucket, el resto sale a cero — y prev sale vacío sin datos', async () => {
    const fx = await athlete();
    const started = new Date('2026-05-05T07:00:00.000Z'); // dentro de las últimas 4 semanas de `now`
    const ended = new Date(started.getTime() + 30 * 60_000);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, recorded_via, elevation_gain_m
      ) values (
        null, ${fx.athleteId}, ${iso(started)}::timestamptz, ${iso(ended)}::timestamptz,
        1800, 'gps'::biometric_source, 'manual'::execution_recording_method, 40
      )
      returning id::text
    `;
    await sql`
      insert into segment_executions (
        execution_id, position, started_at, ended_at, modality, distance_meters, avg_pace_s_per_km, avg_hr, source,
        leg_index, leg_role, leg_phase
      ) values (
        ${exec[0]!.id}::bigint, 0, ${iso(started)}::timestamptz, ${iso(ended)}::timestamptz, 'run',
        6000, 300, 150, 'gps', 0, 'work', 'main'
      )
    `;

    const now = new Date('2026-05-18T12:00:00.000Z'); // 2 semanas después de la sesión
    const result = await buildRunningTendencias({ athlete_id: fx.athleteId, window: '4w', now, client: sql });

    expect(result.buckets.length).toBeGreaterThanOrEqual(4);
    const withKm = result.buckets.filter((b) => (b.km ?? 0) > 0);
    expect(withKm).toHaveLength(1);
    expect(withKm[0]!.km).toBeCloseTo(6, 1);
    expect(withKm[0]!.ritmo_medio_s_km).toBeCloseTo(300, 0);
    expect(withKm[0]!.fc_media).toBe(150);
    expect(withKm[0]!.desnivel_m).toBe(40);

    // Los buckets sin ninguna sesión son null, no cero-mentira, en las
    // métricas que no son sumas puras.
    const empty = result.buckets.find((b) => (b.km ?? 0) === 0)!;
    expect(empty.ritmo_medio_s_km).toBeNull();
    expect(empty.desnivel_m).toBeNull();

    // `prev` cubre las 4 semanas ANTERIORES a la ventana actual — sin
    // sesiones ahí, sale enteramente null.
    expect(result.prev).toEqual({
      km: null,
      seconds: null,
      ritmo_medio_s_km: null,
      fc_media: null,
      desnivel_m: null,
      vo2max: null,
      cadencia_spm: null,
    });
  });
});
