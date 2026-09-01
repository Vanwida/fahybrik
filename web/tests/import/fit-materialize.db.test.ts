// El materializador del importador FIT (#import-fit, docs/DECISIONS.md
// 2026-08-13 «El histórico rico entra por FICHERO FIT») contra una base real:
// dedupe exacto, el reemplazo del blob plano de Apple Salud, la sesión viva
// que SIEMPRE gana, los tramos por lap con sus splits, la ruta y el pulso.
//
// WRITE, do NOT run here (TCP egress is blocked); Alex/CI corre esta suite
// contra una rama de Neon de prueba (TEST_DATABASE_URL) — mismo patrón que
// `tests/sync/route-persistence.db.test.ts`.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { materializeFitActivity } from '@/lib/import/fit/materialize';
import type { CanonicalActivity, CanonicalLap } from '@/lib/import/fit/canonical';
import { polylinePointCount, encodePolyline } from '@/lib/sync/polyline';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const iso = (d: Date) => d.toISOString();

/** Una actividad canónica mínima, con overrides por test. */
function activity(overrides: Partial<CanonicalActivity> & { source_ref: string }): CanonicalActivity {
  const started_at = overrides.started_at ?? new Date('2026-03-01T07:00:00.000Z');
  const ended_at = overrides.ended_at ?? new Date(started_at.getTime() + 30 * 60_000);
  return {
    source: 'fit_import',
    modality: 'run',
    started_at,
    ended_at,
    duration_s: null,
    distance_m: null,
    avg_hr: null,
    max_hr: null,
    calories_kcal: null,
    elevation_gain_m: null,
    elevation_loss_m: null,
    laps: [],
    hr_samples: [],
    route: [],
    ...overrides,
  };
}

function lap(overrides: Partial<CanonicalLap> & { started_at: Date; ended_at: Date }): CanonicalLap {
  return {
    distance_m: null,
    duration_s: null,
    avg_hr: null,
    max_hr: null,
    avg_pace_s_per_km: null,
    run_cadence_spm: null,
    elevation_gain_m: null,
    role: 'work',
    ...overrides,
  };
}

describeWithDb('materializador del importador FIT (real DB)', () => {
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
    // El materializador escribe sin assignment: limpieza explícita de lo que
    // `fx.cleanup()` no conoce (no cuelga de ningún assignment/template).
    cleanups.push(async () => {
      await sql`delete from segment_zone_seconds where segment_execution_id in (
        select se.id from segment_executions se
        join workout_executions we on we.id = se.execution_id
        where we.athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from workout_routes where execution_id in (
        select id from workout_executions where athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from segment_executions where execution_id in (
        select id from workout_executions where athlete_id = ${fx.athleteId}
      )`;
      await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      await sql`delete from biometric_streams where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test('inserta con laps: tramos por posición, splits reales, y el hueco de leg_role queda documentado', async () => {
    const fx = await athlete();
    const started_at = new Date('2026-03-02T06:00:00.000Z');
    const l1 = lap({
      started_at,
      ended_at: new Date(started_at.getTime() + 5 * 60_000),
      distance_m: 1000,
      duration_s: 300,
      avg_hr: 150,
      max_hr: 160,
      role: 'work',
    });
    const l2Start = new Date(started_at.getTime() + 5 * 60_000);
    const l2 = lap({
      started_at: l2Start,
      ended_at: new Date(l2Start.getTime() + 2 * 60_000),
      distance_m: 300,
      duration_s: 120,
      avg_hr: 120,
      role: 'recovery',
    });
    const ended_at = new Date(l2.ended_at.getTime());

    const act = activity({
      source_ref: 'fit:garmin-test:1',
      started_at,
      ended_at,
      laps: [l1, l2],
    });

    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('inserted');
    expect(res.execution_id).not.toBeNull();

    const segs = await sql<
      Array<{
        position: number;
        distance_meters: string | null;
        avg_hr: number | null;
        avg_pace_s_per_km: string | null;
        leg_role: string | null;
        source: string | null;
      }>
    >`
      select position, distance_meters::text, avg_hr, avg_pace_s_per_km::text, leg_role, source
      from segment_executions
      where execution_id = ${res.execution_id}::bigint
      order by position
    `;
    expect(segs).toHaveLength(2);
    // Splits reales, en orden de posición — el lap 1 (1 km en 5 min) y el
    // lap 2 (300 m de trote) no se han mezclado en un promedio.
    expect(segs[0]!.position).toBe(0);
    expect(Number(segs[0]!.distance_meters)).toBeCloseTo(1000, 0);
    expect(segs[0]!.avg_hr).toBe(150);
    // pace derivado: 300 s / 1 km = 300 s/km
    expect(Number(segs[0]!.avg_pace_s_per_km)).toBeCloseTo(300, 0);
    expect(segs[1]!.position).toBe(1);
    expect(Number(segs[1]!.distance_meters)).toBeCloseTo(300, 0);
    // Procedencia: 'garmin' (friction #1 del materializador — no 'fit_import',
    // que no cabe en el enum de `workout_executions.source`; aquí se mantiene
    // el mismo vocabulario por consistencia con las tres columnas).
    expect(segs[0]!.source).toBe('garmin');
    // FRICCIÓN DOCUMENTADA (ver cabecera de materialize.ts, punto 4): el
    // CHECK de la 0146 exige leg_index+leg_role+leg_phase juntos o ninguno, y
    // el contrato canónico no lleva fase (warmup/main/cooldown) — así que
    // NINGÚN lap, ni siquiera el de rol 'recovery', puede llevar leg_role
    // todavía. Este assert es un trip-wire: si alguien lo arregla algún día
    // (separando leg_role del trío, o dándole fase al parser), este test
    // debe actualizarse para exigir 'recovery' en el segundo tramo.
    expect(segs[0]!.leg_role).toBeNull();
    expect(segs[1]!.leg_role).toBeNull();
  });

  test('sin laps: nace UN tramo resumen, como el espejo de HealthKit', async () => {
    const fx = await athlete();
    const act = activity({
      source_ref: 'fit:garmin-test:2',
      distance_m: 8000,
      duration_s: 2400,
      avg_hr: 145,
      calories_kcal: 500,
    });
    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('inserted');

    const segs = await sql<Array<{ position: number; distance_meters: string | null }>>`
      select position, distance_meters::text from segment_executions
      where execution_id = ${res.execution_id}::bigint
    `;
    expect(segs).toHaveLength(1);
    expect(segs[0]!.position).toBe(0);
    expect(Number(segs[0]!.distance_meters)).toBeCloseTo(8000, 0);
  });

  test('reenviar el MISMO fichero es idempotente: exists, sin fila nueva', async () => {
    const fx = await athlete();
    const act = activity({ source_ref: 'fit:garmin-test:3', distance_m: 5000, duration_s: 1500 });
    const first = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(first.outcome).toBe('inserted');

    const second = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(second.outcome).toBe('exists');
    expect(second.execution_id).toBe(first.execution_id);

    const count = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_executions
      where athlete_id = ${fx.athleteId} and source_workout_ref = ${act.source_ref}
    `;
    expect(Number(count[0]!.n)).toBe(1);
  });

  test('supersede: el blob plano de Apple Salud se reemplaza por la rica — queda UNA ejecución', async () => {
    const fx = await athlete();
    const started_at = new Date('2026-03-05T06:00:00.000Z');
    const ended_at = new Date(started_at.getTime() + 40 * 60_000);

    // El blob plano: exactamente lo que escribe materialize-healthkit-workout.ts
    // (sin assignment, recorded_via='imported', un único tramo).
    const flat = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, source_workout_ref, recorded_via
      ) values (
        null, ${fx.athleteId}, ${iso(started_at)}::timestamptz, ${iso(ended_at)}::timestamptz,
        2400, 'healthkit', 'HK-FLAT-1', 'imported'::execution_recording_method
      )
      returning id::text
    `;
    const flatId = flat[0]!.id;
    await sql`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality, distance_meters, source)
      values (${flatId}::bigint, 0, ${iso(started_at)}::timestamptz, ${iso(ended_at)}::timestamptz, 'run', 7000, 'healthkit')
    `;

    const act = activity({
      source_ref: 'fit:garmin-test:4',
      started_at,
      ended_at,
      laps: [
        lap({ started_at, ended_at: new Date(started_at.getTime() + 20 * 60_000), distance_m: 3500, duration_s: 1200 }),
        lap({
          started_at: new Date(started_at.getTime() + 20 * 60_000),
          ended_at,
          distance_m: 3500,
          duration_s: 1200,
        }),
      ],
    });
    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('superseded');
    expect(res.execution_id).not.toBe(flatId);

    // La plana ya no existe (cascade se llevó su tramo con ella).
    const gone = await sql<Array<{ id: string }>>`select id::text from workout_executions where id = ${flatId}::bigint`;
    expect(gone).toHaveLength(0);
    const orphanSegs = await sql<Array<{ id: string }>>`select id::text from segment_executions where execution_id = ${flatId}::bigint`;
    expect(orphanSegs).toHaveLength(0);

    // Solo queda la rica, con sus DOS tramos por lap (no el resumen plano).
    const all = await sql<Array<{ id: string }>>`
      select id::text from workout_executions
      where athlete_id = ${fx.athleteId}
        and started_at <= ${iso(ended_at)}::timestamptz
        and ended_at >= ${iso(started_at)}::timestamptz
    `;
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(res.execution_id);
    const richSegs = await sql<Array<{ id: string }>>`
      select id::text from segment_executions where execution_id = ${res.execution_id}::bigint
    `;
    expect(richSegs).toHaveLength(2);
  });

  test('skipped_live: una sesión asignada/en vivo SIEMPRE gana — el FIT no la toca', async () => {
    const fx = await athlete();
    const started_at = new Date('2026-03-06T06:00:00.000Z');
    const ended_at = new Date(started_at.getTime() + 30 * 60_000);

    const live = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
        source, source_workout_ref, recorded_via
      ) values (
        null, ${fx.athleteId}, ${iso(started_at)}::timestamptz, ${iso(ended_at)}::timestamptz,
        1800, 'concept2', 'LIVE-1', 'live'::execution_recording_method
      )
      returning id::text
    `;
    const liveId = live[0]!.id;

    const act = activity({ source_ref: 'fit:garmin-test:5', started_at, ended_at, distance_m: 5000 });
    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('skipped_live');
    expect(res.execution_id).toBeNull();

    // La sesión viva sigue intacta y sigue siendo la única en esa ventana.
    const still = await sql<Array<{ id: string; source: string | null }>>`
      select id::text, source::text as source from workout_executions where id = ${liveId}::bigint
    `;
    expect(still).toHaveLength(1);
    expect(still[0]!.source).toBe('concept2');
    const dup = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_executions where athlete_id = ${fx.athleteId} and source_workout_ref = ${act.source_ref}
    `;
    expect(Number(dup[0]!.n)).toBe(0);
  });

  test('ruta: el polyline se escribe y se lee tal cual, igual formato que record-workout-execution.ts', async () => {
    const fx = await athlete();
    const started_at = new Date('2026-03-07T06:00:00.000Z');
    const route = [
      { at: started_at, lat: 41.3874, lon: 2.1686 },
      { at: new Date(started_at.getTime() + 60_000), lat: 41.3880, lon: 2.1690 },
      { at: new Date(started_at.getTime() + 120_000), lat: 41.3890, lon: 2.1700 },
    ];
    const act = activity({
      source_ref: 'fit:garmin-test:6',
      started_at,
      ended_at: new Date(started_at.getTime() + 3 * 60_000),
      route,
    });
    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('inserted');

    const rows = await sql<Array<{ polyline: string; point_count: number | null }>>`
      select polyline, point_count from workout_routes where execution_id = ${res.execution_id}::bigint
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.polyline).toBe(encodePolyline(route));
    expect(rows[0]!.point_count).toBe(3);
    expect(rows[0]!.point_count).toBe(polylinePointCount(rows[0]!.polyline));
  });

  test('muestras de pulso: se insertan cuando no había ninguna en la ventana', async () => {
    const fx = await athlete();
    const started_at = new Date('2026-03-08T06:00:00.000Z');
    const samples = Array.from({ length: 10 }, (_, i) => ({
      at: new Date(started_at.getTime() + i * 30_000),
      bpm: 140 + i,
    }));
    const act = activity({
      source_ref: 'fit:garmin-test:7',
      started_at,
      ended_at: new Date(started_at.getTime() + 5 * 60_000),
      hr_samples: samples,
    });
    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('inserted');

    const rows = await sql<Array<{ n: string }>>`
      select count(*)::text as n from biometric_streams
      where athlete_id = ${fx.athleteId} and metric_type = 'hr' and source = 'garmin'
    `;
    expect(Number(rows[0]!.n)).toBe(10);
  });

  test('muestras de pulso: NO se duplican si el atleta ya tiene pulso en esa ventana (no doblar zonas)', async () => {
    const fx = await athlete();
    const started_at = new Date('2026-03-09T06:00:00.000Z');
    const ended_at = new Date(started_at.getTime() + 5 * 60_000);

    // Apple Salud ya trajo pulso para esta misma ventana antes que el FIT.
    await sql`
      insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
      values (${fx.athleteId}, 'healthkit', 'hr'::biometric_metric, ${iso(new Date(started_at.getTime() + 60_000))}::timestamptz, 150, 'bpm')
    `;

    const samples = Array.from({ length: 10 }, (_, i) => ({
      at: new Date(started_at.getTime() + i * 30_000),
      bpm: 140 + i,
    }));
    const act = activity({ source_ref: 'fit:garmin-test:8', started_at, ended_at, hr_samples: samples });
    const res = await materializeFitActivity({ sql, athlete_id: BigInt(fx.athleteId), activity: act });
    expect(res.outcome).toBe('inserted');

    // Solo sigue la muestra de HealthKit — el FIT no añadió ni una.
    const rows = await sql<Array<{ n: string }>>`
      select count(*)::text as n from biometric_streams
      where athlete_id = ${fx.athleteId} and metric_type = 'hr'
    `;
    expect(Number(rows[0]!.n)).toBe(1);
    const garminRows = await sql<Array<{ n: string }>>`
      select count(*)::text as n from biometric_streams
      where athlete_id = ${fx.athleteId} and metric_type = 'hr' and source = 'garmin'
    `;
    expect(Number(garminRows[0]!.n)).toBe(0);
  });
});
