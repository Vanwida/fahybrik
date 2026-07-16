/**
 * #34 follow-up — real-DB verification of the athlete "Probarme" start, the dated
 * benchmark history, and the capture deltas (prev/improved). No SQL is mocked; every
 * assertion re-queries the Neon test branch. SKIPPED unless TEST_DATABASE_URL is set
 * (describeWithDb). Requires migrations 0112 + 0130 on the branch.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { restoreDefaultTests } from '@/lib/coach/restore-default-tests';
import { createCoachTest } from '@/lib/coach/write-coach-test';
import { startCalibrationTest } from '@/lib/coach/start-calibration';
import { recordBatteryResults } from '@/lib/coach/test-battery-bridge';
import { loadAthleteBenchmarkSeries } from '@/lib/athlete/benchmark-history';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('#34 athlete test-battery endpoints (real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('start: materializes an ad-hoc test session today, then REUSES it (idempotent per day)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await restoreDefaultTests(fx.coachId, sql);

    const first = await startCalibrationTest({ athlete_id: fx.athleteId, slug: 'tt_5k', client: sql });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.reused).toBe(false);
    expect(first.data.store_results.some((r) => r.slug === 'run_5k')).toBe(true);

    // The created assignment is a real test session: FK set, notes 'calibration',
    // scheduled today (matching the returned scheduled_for).
    const [row] = await sql<
      { calibration_test_id: string | null; notes: string | null; scheduled_for: string }[]
    >`
      select calibration_test_id::text as calibration_test_id, notes,
             to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for
      from workout_assignments where id = ${first.data.assignment_id}
    `;
    expect(row.calibration_test_id).toBeTruthy();
    expect(row.notes).toBe('calibration');
    expect(row.scheduled_for).toBe(first.data.scheduled_for);

    // A second start for the SAME test today returns the SAME assignment (no dupe).
    const second = await startCalibrationTest({ athlete_id: fx.athleteId, slug: 'tt_5k', client: sql });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.reused).toBe(true);
    expect(second.data.assignment_id).toBe(first.data.assignment_id);

    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from workout_assignments
      where athlete_id = ${fx.athleteId} and calibration_test_id is not null
    `;
    expect(n).toBe(1);
  }, 60000);

  test('start: unknown slug → test_not_found', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await restoreDefaultTests(fx.coachId, sql);
    const bad = await startCalibrationTest({ athlete_id: fx.athleteId, slug: 'does_not_exist', client: sql });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('test_not_found');
  }, 60000);

  test('deltas: improved is unit-correct — time faster=better, load & bpm higher=better', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await restoreDefaultTests(fx.coachId, sql);

    // TIME (run_5k): first result → no prev → improved null; faster second → improved.
    const s1 = await startCalibrationTest({ athlete_id: fx.athleteId, slug: 'tt_5k', client: sql });
    if (!s1.ok) throw new Error('start failed');
    const r1 = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: s1.data.assignment_id,
      entries: [{ slug: 'run_5k', value: 1500 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(r1.entries).toEqual([{ slug: 'run_5k', value: 1500, prev_value: null, improved: null }]);

    const r2 = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: s1.data.assignment_id,
      entries: [{ slug: 'run_5k', value: 1400 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(r2.entries[0]).toEqual({ slug: 'run_5k', value: 1400, prev_value: 1500, improved: true });

    // A slower time is NOT an improvement.
    const r3 = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: s1.data.assignment_id,
      entries: [{ slug: 'run_5k', value: 1450 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(r3.entries[0]!.improved).toBe(false);

    // LOAD (kg higher = better).
    const sLoad = await startCalibrationTest({ athlete_id: fx.athleteId, slug: 'one_rm_battery', client: sql });
    if (!sLoad.ok) throw new Error('start failed');
    await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: sLoad.data.assignment_id,
      entries: [{ slug: 'back_squat_1rm', value: 100 }],
      source: 'athlete_test',
      client: sql,
    });
    const load2 = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: sLoad.data.assignment_id,
      entries: [{ slug: 'back_squat_1rm', value: 110 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(load2.entries[0]).toEqual({ slug: 'back_squat_1rm', value: 110, prev_value: 100, improved: true });

    // BPM / HRR (higher = better): a custom baseline hrr test proves the plumbing.
    const hrrTest = await createCoachTest(
      fx.coachId,
      {
        name: 'HRR 60s',
        protocol: null,
        format: 'test',
        enabled: true,
        results: [{ kind: 'baseline', measure: 'hrr', unit: 'bpm', label: 'Recuperación FC 60s' }],
        schedule: [],
      },
      sql,
    );
    const hrrSlug = hrrTest.results[0]!.slug;
    const sHrr = await startCalibrationTest({ athlete_id: fx.athleteId, slug: hrrTest.slug, client: sql });
    if (!sHrr.ok) throw new Error('start failed');
    await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: sHrr.data.assignment_id,
      entries: [{ slug: hrrSlug, value: 30 }],
      source: 'athlete_test',
      client: sql,
    });
    const hrr2 = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: sHrr.data.assignment_id,
      entries: [{ slug: hrrSlug, value: 40 }],
      source: 'athlete_test',
      client: sql,
    });
    expect(hrr2.entries[0]).toEqual({ slug: hrrSlug, value: 40, prev_value: 30, improved: true });

    // The hrr benchmark landed with unit 'bpm' (never seconds) — bridge is authoritative.
    const [{ unit }] = await sql<{ unit: string }[]>`
      select unit from athlete_benchmarks
      where athlete_id = ${fx.athleteId} and exercise_slug = ${hrrSlug}
      order by recorded_at desc, id desc limit 1
    `;
    expect(unit).toBe('bpm');
  }, 60000);

  test('history: grouped per slug, oldest→newest, slug filter, correct label/unit', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await restoreDefaultTests(fx.coachId, sql);

    const s = await startCalibrationTest({ athlete_id: fx.athleteId, slug: 'tt_5k', client: sql });
    if (!s.ok) throw new Error('start failed');
    // Two dated results; the id tiebreak makes oldest→newest deterministic = [1500, 1400].
    await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: s.data.assignment_id,
      entries: [{ slug: 'run_5k', value: 1500 }],
      source: 'athlete_test',
      client: sql,
    });
    await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: s.data.assignment_id,
      entries: [{ slug: 'run_5k', value: 1400 }],
      source: 'athlete_test',
      client: sql,
    });

    const all = await loadAthleteBenchmarkSeries({ athlete_id: fx.athleteId, client: sql });
    const run = all.find((x) => x.exercise_slug === 'run_5k');
    expect(run).toBeTruthy();
    expect(run!.unit).toBe('seconds');
    expect(run!.label).toBe('Carrera 5 km');
    expect(run!.results.map((r) => r.value)).toEqual([1500, 1400]); // oldest→newest

    // Slug filter returns ONLY that series.
    const only = await loadAthleteBenchmarkSeries({ athlete_id: fx.athleteId, slug: 'run_5k', client: sql });
    expect(only).toHaveLength(1);
    expect(only[0]!.exercise_slug).toBe('run_5k');
  }, 60000);
});
