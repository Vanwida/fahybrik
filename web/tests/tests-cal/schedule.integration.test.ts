/**
 * Real-DB integration test for the #34 AUTO-SCHEDULE hook
 * (lib/coach/schedule-calibration). Verifies that scheduleWeek1Calibration injects
 * the 4 calibration tests into week 1 as per-athlete forks, on the right days, and
 * is idempotent. Runs against a throwaway coach + athlete whose battery is the
 * default one, restored exactly as the coach's «Restaurar batería por defecto»
 * does (it used to borrow demo coach 29's seeded battery, so it only ran on the
 * demo Neon branch). Skips loudly without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { scheduleWeek1Calibration } from '@/lib/coach/schedule-calibration';
import { restoreDefaultTests } from '@/lib/coach/restore-default-tests';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMicrocycle, type Fixture } from '../utils/db-fixtures';

type Sql = ReturnType<typeof getTestSql>;

describeWithDb('#34 auto-schedule week-1 calibration (real DB)', () => {
  let sql: Sql;
  let fx: Fixture | null = null;
  let coachId: number;
  let athleteId: number;
  let microcycleId: number;

  beforeAll(async () => {
    sql = getTestSql();
    fx = await makeCoachAndAthlete(sql);
    coachId = fx.coachId;
    athleteId = fx.athleteId;
    // The default battery: 4 week-1 tests + 2 that live unscheduled in the catalog.
    await restoreDefaultTests(coachId, sql);
    const week1 = await makeMicrocycle({
      sql,
      athleteId,
      startIso: '2026-07-06',
      endIso: '2026-07-12',
    });
    microcycleId = week1.microcycleId;
  });

  afterAll(async () => {
    // Assignments, per-athlete forks, the microcycle, the battery (cascades with
    // its coach) and its content templates all go with the fixture.
    if (fx) await fx.cleanup();
    await closeTestSql();
  });

  test('injects the 4 tests into week 1 on their spread days', async () => {
    const n = await scheduleWeek1Calibration({
      client: sql,
      coach_id: coachId,
      athlete_id: athleteId,
      week1_monday: new Date('2026-07-06T00:00:00Z'),
      microcycle_id: String(microcycleId),
    });
    expect(n).toBe(4);

    const rows = await sql<{ scheduled_for: string; cal: string | null; n_results: number }[]>`
      select wa.scheduled_for::text as scheduled_for,
             t.meta_json ->> 'calibration' as cal,
             jsonb_array_length(t.meta_json -> 'store_results') as n_results
      from workout_assignments wa
      join templates t on t.id = wa.template_id
      where wa.athlete_id = ${athleteId} and wa.notes = 'calibration'
      order by wa.scheduled_for asc
    `;
    expect(rows).toHaveLength(4);
    // every injected session is a per-athlete instance carrying store_results
    // (⇒ is_test = true) and a calibration slug.
    expect(rows.every((r) => r.cal && r.n_results > 0)).toBe(true);
    // spread across distinct days of week 1 (Tue 1RM, Wed 5K, Fri 2K, Sat half-sim).
    const days = rows.map((r) => r.scheduled_for);
    expect(new Set(days).size).toBe(4);
    expect(days).toContain('2026-07-08'); // 5K on Wednesday
  });

  test('is idempotent — a second call injects nothing', async () => {
    const n = await scheduleWeek1Calibration({
      client: sql,
      coach_id: coachId,
      athlete_id: athleteId,
      week1_monday: new Date('2026-07-06T00:00:00Z'),
      microcycle_id: String(microcycleId),
    });
    expect(n).toBe(0);
    const [{ c }] = await sql<{ c: number }[]>`
      select count(*)::int as c from workout_assignments where athlete_id = ${athleteId} and notes = 'calibration'
    `;
    expect(c).toBe(4);
  });
});
