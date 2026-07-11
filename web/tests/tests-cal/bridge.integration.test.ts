/**
 * Real-DB integration test for the #34 ejecución→benchmark BRIDGE
 * (lib/coach/test-battery-bridge). Exercises the WHOLE loop against a Neon test
 * branch (nothing mocked — project rule): a self-fixtured coach (with a complete
 * 6-zone model) + athlete + calibration assignments, then recordBatteryResults for
 * each test type, asserting the benchmarks / zones / strength maxes it produces.
 * Skips loudly without TEST_DATABASE_URL.
 *
 * NOTE: recordBatteryResults' internal level re-run (computeAndStoreLevelSuggestion)
 * takes no client and uses the default pool, so `level_recomputed` is asserted
 * loosely here (a boolean); the client-scoped effects (benchmarks/zones/maxes) are
 * asserted strictly against the test client. A live run with DATABASE_URL ==
 * TEST_DATABASE_URL confirms level_recomputed === true end to end.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { recordBatteryResults } from '@/lib/coach/test-battery-bridge';
import { DEFAULT_CALIBRATION_BATTERY } from '@fahybrid/shared/domain/coach/test-battery';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_HYROX_HALF_SIM,
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMicrocycle, makeTemplate, makeAssignment, type Fixture } from '../utils/db-fixtures';

type Sql = ReturnType<typeof getTestSql>;

// A minimal but VALID 6-zone offset model for a coach, in one pace unit. Offsets
// in seconds from threshold (Z4 lower bound = 0). Enough for the resolver to
// produce 6 positive bands from a real threshold.
const ZONES: Array<{ code: string; role: string; sort: number; low: number; high: number | null }> = [
  { code: 'Z1', role: 'recovery', sort: 1, low: 35, high: null },
  { code: 'Z2', role: 'aerobic_base', sort: 2, low: 15, high: 35 },
  { code: 'Z3', role: 'aerobic_threshold', sort: 3, low: 0, high: 15 },
  { code: 'Z4', role: 'threshold', sort: 4, low: -12, high: 0 },
  { code: 'Z5', role: 'vo2max', sort: 5, low: -25, high: -12 },
  { code: 'Z6', role: 'sprint', sort: 6, low: -40, high: -25 },
];

async function seedZoneModel(sql: Sql, coachId: number, paceUnit: 'per_km' | 'per_500m') {
  for (const z of ZONES) {
    await sql`
      insert into methodology_zones (coach_id, code, label, color, role, sort_order, anchor, pace_unit, low_offset_s, high_offset_s)
      values (${coachId}, ${z.code}, ${z.code}, ${'#888888'}, ${z.role}, ${z.sort}, 'threshold', ${paceUnit}, ${z.low}, ${z.high})
    `;
  }
}

async function makeCalibrationAssignment(
  fx: Fixture,
  protocolSlug: string,
  microcycleId: number,
): Promise<number> {
  const p = DEFAULT_CALIBRATION_BATTERY.find((x) => x.slug === protocolSlug)!;
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into templates (coach_id, name, format, target_block, version, meta_json)
    values (
      ${fx.coachId}, ${p.label}, ${p.format}::template_format, 'any', 1,
      ${fx.sql.json({ store_results: p.store_results, calibration: p.slug })}
    )
    returning id::text
  `;
  const templateId = Number(rows[0]!.id);
  fx.templateIds.push(templateId);
  return makeAssignment({ fx, templateId, scheduledForIso: '2026-07-08', microcycleId });
}

describeWithDb('#34 calibration bridge — the full loop (real DB)', () => {
  let sql: Sql;
  let fx: Fixture;
  let microcycleId: number;

  beforeAll(async () => {
    sql = getTestSql();
    fx = await makeCoachAndAthlete(sql);
    await seedZoneModel(sql, fx.coachId, 'per_km');
    await seedZoneModel(sql, fx.coachId, 'per_500m');
    microcycleId = (
      await makeMicrocycle({ sql, athleteId: fx.athleteId, startIso: '2026-07-06', endIso: '2026-07-12' })
    ).microcycleId;
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('5K → run_5k benchmark + derived run zones (athlete_test)', async () => {
    const aid = await makeCalibrationAssignment(fx, 'tt_5k', microcycleId);
    const res = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: aid,
      entries: [{ slug: BENCH_RUN_5K, value: 1290 }], // 21:30
      source: 'athlete_test',
      client: sql,
    });
    expect(res.ok).toBe(true);
    expect(res.benchmarks_written).toBe(1);
    expect(res.zones_derived.map((z) => z.modality)).toContain('run');
    expect(typeof res.level_recomputed).toBe('boolean');

    const [bench] = await sql<{ value: number; notes: string }[]>`
      select value::float8 as value, notes from athlete_benchmarks
      where athlete_id = ${fx.athleteId} and exercise_slug = ${BENCH_RUN_5K} limit 1
    `;
    expect(bench?.value).toBe(1290);
    expect(bench?.notes).toBe('athlete_test');

    const [zone] = await sql<{ source: string }[]>`
      select source from athlete_zone_profiles
      where athlete_id = ${fx.athleteId} and modality = 'run' order by version desc limit 1
    `;
    expect(zone?.source).toBe('athlete_test');
  });

  test('2K row → row_2k benchmark + derived row zones', async () => {
    const aid = await makeCalibrationAssignment(fx, 'tt_2k_row', microcycleId);
    const res = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: aid,
      entries: [{ slug: BENCH_ROW_2K, value: 460 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(res.ok).toBe(true);
    expect(res.zones_derived.map((z) => z.modality)).toContain('row');
    const [zone] = await sql<{ source: string }[]>`
      select source from athlete_zone_profiles
      where athlete_id = ${fx.athleteId} and modality = 'row' order by version desc limit 1
    `;
    expect(zone?.source).toBe('athlete_test');
  });

  test('1RM battery → 3 strength maxes + 3 benchmarks, no zones', async () => {
    const aid = await makeCalibrationAssignment(fx, 'one_rm_battery', microcycleId);
    const res = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: aid,
      entries: [
        { slug: BENCH_BACK_SQUAT_1RM, value: 140 },
        { slug: BENCH_DEADLIFT_1RM, value: 180 },
        { slug: BENCH_BENCH_PRESS_1RM, value: 100 },
      ],
      source: 'coach_test',
      client: sql,
    });
    expect(res.ok).toBe(true);
    expect(res.strength_maxes_written).toBe(3);
    expect(res.benchmarks_written).toBe(3);
    expect(res.zones_derived).toHaveLength(0);

    const maxes = await sql<{ exercise_slug: string; one_rm_kg: number }[]>`
      select exercise_slug, one_rm_kg::float8 as one_rm_kg from athlete_strength_maxes
      where athlete_id = ${fx.athleteId} and source = 'coach_test'
    `;
    expect(maxes).toHaveLength(3);
    expect(maxes.find((m) => m.exercise_slug === BENCH_BACK_SQUAT_1RM)?.one_rm_kg).toBe(140);
  });

  test('HYROX half-sim → baseline benchmark only, no zones/maxes', async () => {
    const aid = await makeCalibrationAssignment(fx, 'hyrox_half_sim', microcycleId);
    const res = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: aid,
      entries: [{ slug: BENCH_HYROX_HALF_SIM, value: 3600 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(res.ok).toBe(true);
    expect(res.benchmarks_written).toBe(1);
    expect(res.zones_derived).toHaveLength(0);
    const [bench] = await sql<{ value: number }[]>`
      select value::float8 as value from athlete_benchmarks
      where athlete_id = ${fx.athleteId} and exercise_slug = ${BENCH_HYROX_HALF_SIM} limit 1
    `;
    expect(bench?.value).toBe(3600);
  });

  test('guards: unknown_slug and not_a_test', async () => {
    const aid = await makeCalibrationAssignment(fx, 'tt_5k', microcycleId);
    const bad = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: aid,
      entries: [{ slug: 'bogus_slug', value: 100 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('unknown_slug');

    const plainTpl = await makeTemplate({ fx, name: 'Plain session', format: 'circuit' });
    const plainAid = await makeAssignment({ fx, templateId: plainTpl, scheduledForIso: '2026-07-09', microcycleId });
    const notTest = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: plainAid,
      entries: [{ slug: BENCH_RUN_5K, value: 1290 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(notTest.ok).toBe(false);
    expect(notTest.error).toBe('not_a_test');
  });
});
