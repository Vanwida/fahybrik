/**
 * #34 — real-DB verification of the coach calibration-test battery (WEB side):
 * restore-defaults → the 3 tables + content template + meta_json mirror; custom
 * create (calibration + baseline); the data-driven scheduler stamping the FK +
 * agenda dates; the ejecución→benchmark bridge reading the mirrored meta_json; the
 * battery status; and store_results on the athlete assignment detail.
 *
 * No SQL is mocked — every assertion re-queries the Neon test branch. SKIPPED
 * unless TEST_DATABASE_URL is set (describeWithDb). Requires migration 0112 on the
 * branch.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { restoreDefaultTests } from '@/lib/coach/restore-default-tests';
import { createCoachTest, CoachTestError } from '@/lib/coach/write-coach-test';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { scheduleWeek1Calibration } from '@/lib/coach/schedule-calibration';
import { recordBatteryResults } from '@/lib/coach/test-battery-bridge';
import { loadBatteryStatus } from '@/lib/coach/battery-status';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { addDays, isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMicrocycle, type Fixture } from '../utils/db-fixtures';

describeWithDb('#34 coach calibration tests (real DB)', () => {
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

  test('restoreDefaultTests seeds the 4 FABRIK tests + content templates + meta_json mirror', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);

    const res = await restoreDefaultTests(fx.coachId, sql);
    expect(res.created + res.restored).toBe(4);
    expect(res.tests).toHaveLength(4);

    const tests = await listCoachTests(fx.coachId, {}, sql);
    const bySlug = new Map(tests.map((t) => [t.slug, t]));
    // The run test calibrates run zones off run_5k (the objective contract).
    const run = bySlug.get('tt_5k');
    expect(run).toBeTruthy();
    expect(run!.results.some((r) => r.slug === 'run_5k' && r.derives === 'run_zones' && r.modality === 'run')).toBe(true);
    expect(run!.schedules.some((s) => s.week_offset === 1 && s.day_of_week === 3 && s.enabled)).toBe(true);
    // The 1RM battery produces 3 strength results.
    const oneRm = bySlug.get('one_rm_battery');
    expect(oneRm!.results.filter((r) => r.derives === 'strength_max')).toHaveLength(3);

    // Every test has a content template whose meta_json mirrors store_results +
    // carries the calibration slug (the bridge still reads meta_json).
    for (const t of tests) {
      expect(t.template_id).toBeTruthy();
      const [tpl] = await sql<{ store_len: number; calibration: string; segs: number }[]>`
        select jsonb_array_length(meta_json->'store_results') as store_len,
               meta_json->>'calibration' as calibration,
               (select count(*)::int from template_segments ts where ts.template_id = templates.id) as segs
        from templates where id = ${Number(t.template_id)}
      `;
      expect(tpl.calibration).toBe(t.slug);
      expect(tpl.store_len).toBe(t.results.length);
      expect(tpl.segs).toBeGreaterThan(0); // one segment per resolvable result
    }
  }, 60000);

  test('createCoachTest: calibration target derives its contract; baseline stays derives=none', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);

    const cal = await createCoachTest(
      fx.coachId,
      {
        name: 'Remo 2K propio',
        protocol: null,
        format: 'test',
        enabled: true,
        results: [{ kind: 'calibration', target: 'row_zones' }],
        schedule: [{ week_offset: 1, day_of_week: 5, enabled: true }],
      },
      sql,
    );
    const rowRes = cal.results[0]!;
    expect(rowRes.slug).toBe('row_2k');
    expect(rowRes.derives).toBe('row_zones');
    expect(rowRes.measure).toBe('time');
    expect(rowRes.unit).toBe('seconds');

    const base = await createCoachTest(
      fx.coachId,
      {
        name: 'Dominadas máximas',
        protocol: null,
        format: 'test',
        enabled: true,
        results: [{ kind: 'baseline', measure: 'reps', unit: 'reps', label: 'Dominadas máx' }],
        schedule: [],
      },
      sql,
    );
    expect(base.results[0]!.derives).toBe('none');
    expect(base.results[0]!.measure).toBe('reps');

    // A bad target key is rejected server-side (never silently mis-calibrates).
    await expect(
      createCoachTest(
        fx.coachId,
        {
          name: 'Test roto',
          protocol: null,
          format: 'test',
          enabled: true,
          results: [{ kind: 'calibration', target: 'not_a_target' }],
          schedule: [],
        },
        sql,
      ),
    ).rejects.toBeInstanceOf(CoachTestError);
  }, 60000);

  test('scheduler stamps the FK + agenda dates; bridge calibrates off the mirrored meta_json', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await restoreDefaultTests(fx.coachId, sql);

    const monday = mondayOfWeek(new Date());
    const { microcycleId } = await makeMicrocycle({
      sql,
      athleteId: fx.athleteId,
      startIso: isoDateString(monday),
      endIso: isoDateString(addDays(monday, 6)),
    });

    const injected = await scheduleWeek1Calibration({
      client: sql,
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      week1_monday: monday,
      microcycle_id: String(microcycleId),
    });
    expect(injected).toBe(4); // one occurrence per FABRIK test

    // Each injected assignment carries the FK + notes, and its cloned template
    // carries the meta_json contract (what the bridge reads).
    const assignments = await sql<
      { id: string; scheduled_for: string; calibration_test_id: string; slug: string; store_len: number }[]
    >`
      select wa.id::text as id, to_char(wa.scheduled_for,'YYYY-MM-DD') as scheduled_for,
             wa.calibration_test_id::text as calibration_test_id, cct.slug as slug,
             jsonb_array_length(t.meta_json->'store_results') as store_len
      from workout_assignments wa
      join coach_calibration_tests cct on cct.id = wa.calibration_test_id
      join templates t on t.id = wa.template_id
      where wa.athlete_id = ${fx.athleteId} and wa.calibration_test_id is not null
      order by wa.scheduled_for asc
    `;
    expect(assignments).toHaveLength(4);
    const run = assignments.find((a) => a.slug === 'tt_5k')!;
    // tt_5k → week 1, day 3 (Wed) ⇒ monday + 2 days.
    expect(run.scheduled_for).toBe(isoDateString(addDays(monday, 2)));
    expect(run.store_len).toBe(1);

    // Bridge: record the 5K time ⇒ a run_5k benchmark is written (calibration
    // read from the clone's meta_json.store_results).
    const bridge = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: Number(run.id),
      entries: [{ slug: 'run_5k', value: 1200 }],
      source: 'coach_test',
      client: sql,
    });
    expect(bridge.ok).toBe(true);
    expect(bridge.benchmarks_written).toBe(1);

    const [bench] = await sql<{ n: number }[]>`
      select count(*)::int as n from athlete_benchmarks
      where athlete_id = ${fx.athleteId} and exercise_slug = 'run_5k' and notes = 'coach_test'
    `;
    expect(bench.n).toBe(1);

    // 1RM battery: 3 load entries ⇒ 3 strength maxes written.
    const oneRm = assignments.find((a) => a.slug === 'one_rm_battery')!;
    const strength = await recordBatteryResults({
      athlete_id: fx.athleteId,
      assignment_id: Number(oneRm.id),
      entries: [
        { slug: 'back_squat_1rm', value: 140 },
        { slug: 'deadlift_1rm', value: 180 },
        { slug: 'bench_press_1rm', value: 100 },
      ],
      source: 'coach_test',
      client: sql,
    });
    expect(strength.ok).toBe(true);
    expect(strength.strength_maxes_written).toBe(3);

    // Battery status: 4 total, ≥1 captured (the 5K result landed), and the run
    // test's captured time is formatted for the card (1200s ⇒ "20:00").
    const status = await loadBatteryStatus(fx.athleteId, sql);
    expect(status.total).toBe(4);
    expect(status.completed).toBeGreaterThanOrEqual(1);
    const runStatus = status.tests.find((t) => t.calibration_slug === 'tt_5k')!;
    expect(runStatus.result_captured).toBe(true);
    expect(runStatus.result_label).toBe('20:00');

    // Assignment detail exposes store_results for the test session.
    const detail = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      assignment_id: BigInt(Number(run.id)),
    });
    expect(detail?.assignment.store_results).toEqual([
      expect.objectContaining({ slug: 'run_5k', measure: 'time', unit: 'seconds' }),
    ]);
  }, 60000);
});
