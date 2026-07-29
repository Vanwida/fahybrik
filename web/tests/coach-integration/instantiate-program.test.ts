/**
 * Real-DB integration tests for `instantiateMonthFromTemplate`.
 *
 * Exercises the actual transaction (`client.begin`), real inserts into
 * microcycles / workout_assignments / athlete_month_assignments, and the
 * real reads it does back. No SQL is mocked — every assertion is verified by
 * re-querying the Neon test branch.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { instantiateMonthFromTemplate, InstantiateProgramError } from '@/lib/dashboard/coach/instantiate-program';
import {
  closeTestSql,
  describeWithDb,
  getTestSql,
} from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('instantiateMonthFromTemplate (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    // Sanity: the branch must actually be reachable, else fail loudly.
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    // LIFO cleanup so child rows go before parents.
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  async function setup(opts: { weekCount: number; workoutDays: number[] }) {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);

    // AGNOSTIC: the materializer self-creates per-athlete microcycles (athlete_id +
    // date overlap) — no macrocycle/block entity needed: none exists.
    const startIso = '2026-01-05'; // a Monday

    const tplId = await makeTemplate({ fx, name: 'Z2 circuit' });
    const month = await makeMonthTemplate({
      fx,
      weekCount: opts.weekCount,
      workoutDays: opts.workoutDays,
      workoutTemplateId: tplId,
    });

    return { fx, tplId, month, startIso };
  }

  test('materializes a month into workout_assignments + a month assignment', async () => {
    const { fx, month } = await setup({ weekCount: 2, workoutDays: [1, 3, 5] }); // 3 days/week

    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-07', // a Wednesday — must snap back to Monday 2026-01-05
      client: sql,
    });

    // 2 weeks * 3 workout days = 6 assignments.
    expect(result.assignment_count).toBe(6);
    expect(result.start_date).toBe('2026-01-05');
    // 2 weeks → end = Monday + 13 days = 2026-01-18.
    expect(result.end_date).toBe('2026-01-18');
    expect(result.microcycle_ids).toHaveLength(2);

    // Verify against the DB, not the return value.
    const wa = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(Number(wa[0]!.n)).toBe(6);

    const ma = await sql<Array<{ assignment_count: number; microcycle_ids: number[] }>>`
      select assignment_count, microcycle_ids from athlete_month_assignments
      where id = ${Number(result.month_assignment_id)}
    `;
    expect(ma[0]!.assignment_count).toBe(6);
    expect(ma[0]!.microcycle_ids.map(String)).toEqual(result.microcycle_ids);

    // All assignments point at scheduled status and the seeded template.
    const statuses = await sql<Array<{ status: string }>>`
      select distinct status::text from workout_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(statuses.map((s) => s.status)).toEqual(['scheduled']);
  });

  test('rejects when athlete is not owned by the coach (404)', async () => {
    const { fx, month } = await setup({ weekCount: 1, workoutDays: [1] });
    await expect(
      instantiateMonthFromTemplate({
        coach_id: fx.coachId + 999999, // wrong coach
        athlete_id: fx.athleteId,
        month_template_id: month.monthId,
        start_date: '2026-01-05',
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  test('rejects when the month template has no weeks (empty_month)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tplId = await makeTemplate({ fx, name: 'X' });
    const month = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId: tplId,
    });

    await expect(
      instantiateMonthFromTemplate({
        coach_id: fx.coachId + 424242, // wrong coach → not_found before materializing
        athlete_id: fx.athleteId,
        month_template_id: month.monthId,
        start_date: '2026-01-05',
        client: sql,
      }),
    ).rejects.toBeInstanceOf(InstantiateProgramError);

    // Nothing persisted for this athlete (guard rejected before any insert).
    const wa = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_assignments where athlete_id = ${fx.athleteId}
    `;
    expect(Number(wa[0]!.n)).toBe(0);
  });
});
