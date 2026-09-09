/**
 * FH-27 — plan week visibility horizon (multi-tenant, real DB).
 * Skips when TEST_DATABASE_URL is unset.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { maxWeekOffset } from '@fahybrid/shared/domain/coach/plan-week-horizon';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const DB_TIMEOUT = 30_000;

describeWithDb('FH-27 — plan week visibility horizon', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  let buildAthleteWeekPlan: (
    athleteId: number | bigint,
    weekOffset?: number,
  ) => Promise<import('@/lib/athlete/week-plan').AthleteWeekPlan>;
  let resolveAthletePlanWeekVisibility: (
    athleteId: number | bigint,
    opts?: { weekOffset?: number; nextWeekPublished?: boolean },
  ) => Promise<import('@/lib/athlete/plan-week-visibility').ResolvedPlanWeekVisibility>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    ({ buildAthleteWeekPlan } = await import('@/lib/athlete/week-plan'));
    ({ resolveAthletePlanWeekVisibility } = await import('@/lib/athlete/plan-week-visibility'));
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  async function newFixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  async function setHorizon(coachId: number, horizon: string) {
    await sql`
      update coaches set plan_week_horizon = ${horizon} where id = ${coachId}
    `;
  }

  async function seedAssignment(athleteId: number, iso: string) {
    await sql`
      insert into workout_assignments (athlete_id, scheduled_for, status, origin)
      values (${athleteId}, ${iso}::date, 'pending', 'coach')
    `;
  }

  test(
    'tenant A this_week blocks peek; tenant B one_month allows further',
    async () => {
      const fxA = await newFixture();
      const fxB = await newFixture();
      await setHorizon(fxA.coachId, 'this_week');
      await setHorizon(fxB.coachId, 'one_month');

      const monday = isoDateString(mondayOfWeek(new Date()));
      const nextMonday = isoDateString(addDays(new Date(monday), 7));
      await seedAssignment(fxA.athleteId, nextMonday);
      await seedAssignment(fxB.athleteId, nextMonday);

      const visA = await resolveAthletePlanWeekVisibility(fxA.athleteId);
      const visB = await resolveAthletePlanWeekVisibility(fxB.athleteId);
      expect(visA.max_week_offset).toBe(0);
      expect(visB.max_week_offset).toBe(maxWeekOffset('one_month'));

      const weekA = await buildAthleteWeekPlan(fxA.athleteId, 0);
      const weekB = await buildAthleteWeekPlan(fxB.athleteId, 0);
      expect(weekA.has_next_week).toBe(false);
      expect(weekA.peek_blocked_by_horizon).toBe(true);
      expect(weekB.has_next_week).toBe(true);
      expect(weekB.peek_blocked_by_horizon).toBe(false);
    },
    DB_TIMEOUT,
  );

  test(
    'free athlete (no coach) has max offset 0',
    async () => {
      const fx = await newFixture();
      await sql`update athletes set coach_id = null where id = ${fx.athleteId}`;
      const vis = await resolveAthletePlanWeekVisibility(fx.athleteId);
      expect(vis.max_week_offset).toBe(0);
      expect(vis.horizon).toBeNull();
    },
    DB_TIMEOUT,
  );
});
