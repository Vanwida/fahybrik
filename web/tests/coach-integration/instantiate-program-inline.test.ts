/**
 * Real-DB integration tests for the INLINE-blocks materialization path of
 * `instantiateMonthFromTemplate` (the dashboard/coach copy, which is the one
 * wired to POST /api/coach/athletes/[id]/assign-month).
 *
 * The week-studio editor persists workout content as inline `blocks[]` on each
 * session (no reusable `template_id`). Previously the materializer skipped any
 * session without `template_id`, so assigning such a month created ZERO
 * workout_assignments. These tests lock in the fix: inline sessions are
 * materialized into a `templates` row (+ `template_segments`) and a real
 * workout_assignment is created. No SQL is mocked.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeMacrocycleWithBlock,
  makeExercise,
  makeInlineMonthTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('instantiateMonthFromTemplate — inline blocks (real DB)', () => {
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

  async function baseFixture() {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await makeMacrocycleWithBlock({
      sql,
      athleteId: fx.athleteId,
      startIso: '2026-01-05', // Monday
      endIso: '2026-03-01',
      status: 'planned',
    });
    return fx;
  }

  test('materializes inline blocks into a template + segments + assignment', async () => {
    const fx = await baseFixture();
    const ski = await makeExercise({ fx, name: 'SkiErg' });
    const squat = await makeExercise({ fx, name: 'Back Squat' });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            {
              title: 'Calentamiento',
              format: 'tempo',
              items: [
                { exercise_id: ski, exercise_name: 'SkiErg', params_json: { distance_meters: 500 } },
              ],
            },
            {
              title: 'Fuerza',
              format: 'strength_block',
              items: [
                { exercise_id: squat, exercise_name: 'Back Squat', params_json: { sets: 3, reps: 8 } },
              ],
            },
          ],
        },
      ],
    });

    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });

    expect(result.assignment_count).toBe(1);

    // The assignment references a real template, joinable like the iOS endpoint does.
    const rows = await sql<
      Array<{ template_id: string; name: string; format: string; notes: string; status: string }>
    >`
      select wa.template_id::text, t.name, t.format::text as format, wa.notes, wa.status::text as status
      from workout_assignments wa
      join templates t on t.id = wa.template_id
      where wa.athlete_id = ${fx.athleteId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('scheduled');
    expect(rows[0]!.notes).toContain('am');
    expect(rows[0]!.format).toBe('tempo'); // first valid block format

    // Two segments across two blocks, grouped by block_position.
    const segs = await sql<
      Array<{ position: number; block_position: number; block_title: string; exercise_id: string }>
    >`
      select position, block_position, block_title, exercise_id::text
      from template_segments where template_id = ${Number(rows[0]!.template_id)}
      order by position
    `;
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([ski, squat]);
    expect(segs.map((s) => s.block_position)).toEqual([0, 1]);
    expect(segs.map((s) => s.block_title)).toEqual(['Calentamiento', 'Fuerza']);
  });

  test('skips sessions whose inline blocks have no exercises (empty day)', async () => {
    const fx = await baseFixture();
    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [{ day_of_week: 2, blocks: [{ title: 'Empty', items: [] }] }],
    });
    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });
    expect(result.assignment_count).toBe(0);
    const wa = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(Number(wa[0]!.n)).toBe(0);
  });

  test('skips phantom exercise ids without aborting the whole assignment', async () => {
    const fx = await baseFixture();
    const real = await makeExercise({ fx, name: 'Run' });
    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            {
              title: 'Mix',
              format: 'intervals',
              items: [
                { exercise_id: 999_000_001, exercise_name: 'Phantom', params_json: {} },
                { exercise_id: real, exercise_name: 'Run', params_json: { duration_seconds: 60 } },
              ],
            },
          ],
        },
      ],
    });
    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });
    expect(result.assignment_count).toBe(1);
    const segs = await sql<Array<{ exercise_id: string }>>`
      select ts.exercise_id::text
      from template_segments ts
      join workout_assignments wa on wa.template_id = ts.template_id
      where wa.athlete_id = ${fx.athleteId}
    `;
    // Only the real exercise survives; the phantom is dropped.
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([real]);
  });
});
