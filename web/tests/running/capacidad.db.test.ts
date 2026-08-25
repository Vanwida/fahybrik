// GET /api/athlete/running/capacidad (web/lib/athlete/running/capacidad.ts)
// contra una base real: el estado vacío es honesto, y con perfil+marcas+test
// de batería configurados los tres salen conectados — incluida la desviación
// declarada del Cooper (metros, no segundos).
//
// SIN velocidad crítica (CS/D'): por contrato (team-lead, 13-ago-2026) ese
// ajuste vive SOLO en `/api/athlete/analytics/lecturas` (grupo `capacidad`),
// que iOS reutiliza — este endpoint no lo recalcula ni lo sirve.
//
// WRITE, do NOT run here (TCP egress bloqueado); Alex/CI corre esta suite
// contra una rama de Neon de prueba (TEST_DATABASE_URL).

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { buildRunningCapacidad } from '@/lib/athlete/running/capacidad';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const iso = (d: Date) => d.toISOString();

const ZONES_6 = [
  { code: 'Z1', label: 'Suave', color: '#8ecae6', role: 'recovery', sort_order: 0, fast_s: 262, slow_s: null },
  { code: 'Z2', label: 'Aeróbico', color: '#219ebc', role: 'aerobic_base', sort_order: 1, fast_s: 254, slow_s: 261 },
  { code: 'Z3', label: 'Tempo', color: '#023047', role: 'tempo', sort_order: 2, fast_s: 248, slow_s: 253 },
  { code: 'Z4', label: 'Umbral', color: '#ffb703', role: 'threshold', sort_order: 3, fast_s: 240, slow_s: 247 },
  { code: 'Z5', label: 'VO2máx', color: '#fb8500', role: 'vo2max', sort_order: 4, fast_s: 237, slow_s: 239 },
  { code: 'Z6', label: 'Anaeróbico', color: '#d62828', role: 'anaerobic', sort_order: 5, fast_s: 233, slow_s: 236 },
];

describeWithDb('buildRunningCapacidad (real DB)', () => {
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
      await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
      await sql`delete from athlete_zone_profiles where athlete_id = ${fx.athleteId}`;
    });
    return fx;
  }

  test('atleta sin nada configurado: todo honesto-vacío', async () => {
    const fx = await athlete();
    const result = await buildRunningCapacidad({ athlete_id: fx.athleteId, client: sql });
    expect(result.umbral).toBeNull();
    expect(result.zonas).toEqual([]);
    expect(result.records).toEqual([]);
    expect(result.predictor).toBeNull();
    expect(result.test_zonas).toBeNull();
  });

  test('perfil de zonas + test de batería + marcas: los tres conectan, y el Cooper sale en metros', async () => {
    const fx = await athlete();

    // Umbral+zonas: un test del coach, hace 5 días.
    const recordedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await sql`
      insert into athlete_zone_profiles (
        athlete_id, modality, threshold_s, pace_unit, zones_json, version, recorded_at, source, needs_review
      ) values (
        ${fx.athleteId}, 'run', 240, 'per_km', ${sql.json(ZONES_6)}, 1, ${iso(recordedAt)}::timestamptz,
        'coach_test', false
      )
    `;

    // El test de zonas de la batería: coach_calibration_tests × coach_test_results.
    const testRow = await sql<Array<{ id: string }>>`
      insert into coach_calibration_tests (coach_id, slug, name, format, enabled, sort_order)
      values (${fx.coachId}, 'tt-run-zones', 'Test 5K de zonas', 'test'::template_format, true, 1)
      returning id::text
    `;
    await sql`
      insert into coach_test_results (test_id, slug, label, measure, unit, derives, modality, sort_order)
      values (${Number(testRow[0]!.id)}, 'run_5k', '5 km', 'time', 'seconds', 'run_zones', 'run', 0)
    `;

    // Marcas: 1 km calle reciente (record), 5 km cinta antigua, y el Cooper —
    // en METROS, la marca que rompería un `segundos` mal tipado.
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, run_context, recorded_at)
      values
        (${fx.athleteId}, 'run_1k', 210, 'seconds', 'athlete_test', 'outdoor', ${iso(daysAgo(5))}::timestamptz),
        (${fx.athleteId}, 'run_5k', 1180, 'seconds', 'athlete_test', 'treadmill', ${iso(daysAgo(120))}::timestamptz),
        (${fx.athleteId}, 'cooper_12min', 2750, 'meters', 'athlete_test', 'outdoor', ${iso(daysAgo(10))}::timestamptz)
    `;

    const result = await buildRunningCapacidad({ athlete_id: fx.athleteId, now, client: sql });

    expect(result.umbral).toEqual({
      ritmo_s_km: 240,
      origen_label: 'Test del coach',
      hace_dias: 5,
      sin_revisar: false,
    });
    expect(result.zonas).toHaveLength(6);
    expect(result.zonas.find((z) => z.z === 4)).toEqual({ z: 4, nombre: 'Umbral', desde_s_km: 247, hasta_s_km: 240, color: '#ffb703' });

    expect(result.test_zonas).toEqual({ slug: 'tt-run-zones', label_es: 'Test 5K de zonas' });

    const cooper = result.records.find((r) => r.slug === 'cooper_12min');
    expect(cooper).toMatchObject({ contexto: 'street', unidad: 'meters', valor: 2750, reciente: true });
    const run1k = result.records.find((r) => r.slug === 'run_1k' && r.contexto === 'street');
    expect(run1k).toMatchObject({ unidad: 'seconds', valor: 210, reciente: true });
    const run5kTreadmill = result.records.find((r) => r.slug === 'run_5k' && r.contexto === 'treadmill');
    expect(run5kTreadmill).toMatchObject({ unidad: 'seconds', valor: 1180, reciente: false });

    // El predictor parte del VDOT del mejor 1k/5k medido — no null.
    expect(result.predictor).not.toBeNull();
    expect(result.predictor).toHaveLength(4);
    expect(result.predictor![0]!.distancia_m).toBe(5000);
    expect(result.predictor![0]!.segundos).toBeGreaterThan(0);
  });

  test('un perfil del alta no inventa umbral: vacío honesto', async () => {
    const fx = await athlete();
    await sql`
      insert into athlete_zone_profiles (
        athlete_id, modality, threshold_s, pace_unit, zones_json, version, source, needs_review
      ) values (
        ${fx.athleteId}, 'run', 274, 'per_km', ${sql.json(ZONES_6)}, 1, 'onboarding_auto', true
      )
    `;
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source)
      values (${fx.athleteId}, 'run_5k', 1320, 'seconds', 'onboarding')
    `;
    const result = await buildRunningCapacidad({ athlete_id: fx.athleteId, client: sql });
    expect(result.umbral).toBeNull();
    expect(result.zonas).toEqual([]);
  });

  test('marca de umbral guardada, sin perfil: el número de esa marca', async () => {
    const fx = await athlete();
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source)
      values (${fx.athleteId}, 'run_threshold_s_per_km', 248, 'seconds', 'athlete_test')
    `;
    const result = await buildRunningCapacidad({ athlete_id: fx.athleteId, client: sql });
    expect(result.umbral).toEqual({
      ritmo_s_km: 248,
      origen_label: 'Test propio',
      hace_dias: null,
      sin_revisar: false,
    });
  });
});
