/**
 * Real-DB integration test for the #34 AUTO-SCHEDULE hook
 * (lib/coach/schedule-calibration). Verifies that scheduleWeek1Calibration injects
 * the 4 calibration tests into week 1 as per-athlete forks, on the right days, and
 * is idempotent. Runs against a coach that has the seeded calibration templates
 * (SEED_COACH_ID, default demo coach 29). Skips loudly without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { scheduleWeek1Calibration } from '@/lib/coach/schedule-calibration';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

type Sql = ReturnType<typeof getTestSql>;

const SEED_COACH_ID = Number(process.env.SEED_COACH_ID ?? 29);

describeWithDb('#34 auto-schedule week-1 calibration (real DB)', () => {
  let sql: Sql;
  let athleteId: number;
  let userId: number;
  let microcycleId: number;

  beforeAll(async () => {
    sql = getTestSql();
    const u = await sql<{ id: string }[]>`
      insert into users (email, role) values (${`cal-sched-${Date.now()}@test.local`}, 'athlete')
      returning id::text
    `;
    userId = Number(u[0]!.id);
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userId}, ${SEED_COACH_ID}, 'Cal Sched Test') returning id::text
    `;
    athleteId = Number(a[0]!.id);
    const mc = await sql<{ id: string }[]>`
      insert into microcycles (athlete_id, week_number, start_date, end_date)
      values (${athleteId}, 1, '2026-07-06'::date, '2026-07-12'::date) returning id::text
    `;
    microcycleId = Number(mc[0]!.id);
  });

  afterAll(async () => {
    if (athleteId) {
      await sql`delete from workout_assignments where athlete_id = ${athleteId}`;
      await sql`delete from templates where instance_athlete_id = ${athleteId}`;
      await sql`delete from microcycles where athlete_id = ${athleteId}`;
      await sql`delete from athletes where id = ${athleteId}`;
      await sql`delete from users where id = ${userId}`;
    }
    await closeTestSql();
  });

  test('injects the 4 tests into week 1 on their spread days', async () => {
    const n = await scheduleWeek1Calibration({
      client: sql,
      coach_id: SEED_COACH_ID,
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
      coach_id: SEED_COACH_ID,
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
